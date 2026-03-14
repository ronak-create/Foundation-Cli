// packages/core/src/file-transaction.ts
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { safeResolve } from "./path-utils.js";
import {
  TransactionStateError,
  TransactionCommitError,
  TransactionRollbackError,
} from "./errors.js";
import type {
  FileTransactionOptions,
  StagedFile,
  TransactionState,
  TransactionSummary,
} from "./types.js";

/**
 * FileTransaction provides atomic, rollback-capable file writes.
 *
 * Lifecycle:
 *   new FileTransaction(options)  → state: "idle"
 *   .open()                       → state: "open"
 *   .stage(path, content) × N
 *   .commit()                     → state: "committed"
 *   — or —
 *   .rollback()                   → state: "rolled-back"
 */
export class FileTransaction {
  readonly #projectRoot: string;
  readonly #stagingDir: string;
  #state: TransactionState = "idle";
  readonly #staged: Map<string, StagedFile> = new Map();

  constructor(options: FileTransactionOptions) {
    this.#projectRoot = path.resolve(options.projectRoot);
    this.#stagingDir =
      options.stagingDir ??
      path.join(os.tmpdir(), `foundation-txn-${randomUUID()}`);
  }

  get state(): TransactionState {
    return this.#state;
  }

  get projectRoot(): string {
    return this.#projectRoot;
  }

  /** Opens the transaction, creating the staging directory. */
  async open(): Promise<void> {
    this.#assertState("idle");
    await fs.mkdir(this.#stagingDir, { recursive: true });
    this.#state = "open";
  }

  /**
   * Stages a file for writing.
   * The file is written to the staging directory.  Nothing in the
   * project root is touched until `commit()` is called.
   *
   * @param relativePath  Path relative to projectRoot. Must not escape root.
   * @param content       UTF-8 file content.
   */
  async stage(relativePath: string, content: string): Promise<void> {
    this.#assertState("open");

    const destinationPath = safeResolve(this.#projectRoot, relativePath);

    // Unique file in staging dir to avoid collisions with nested paths.
    const stagingFileName = randomUUID();
    const stagingPath = path.join(this.#stagingDir, stagingFileName);

    // Check whether destination exists and snapshot content for rollback.
    let existedBefore = false;
    let originalContent: string | null = null;

    try {
      originalContent = await fs.readFile(destinationPath, "utf-8");
      existedBefore = true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        throw err;
      }
    }

    // Write content to staging.
    await fs.writeFile(stagingPath, content, "utf-8");

    this.#staged.set(destinationPath, {
      stagingPath,
      destinationPath,
      existedBefore,
      originalContent,
    });
  }

  /**
   * Atomically commits all staged files to their destinations.
   * Creates intermediate directories as needed.
   * On any failure, automatically rolls back all successfully moved files.
   */
  async commit(): Promise<void> {
    this.#assertState("open");

    const committed: StagedFile[] = [];

    try {
      for (const staged of this.#staged.values()) {
        await fs.mkdir(path.dirname(staged.destinationPath), {
          recursive: true,
        });
        // rename is atomic on the same filesystem; cross-device falls back
        // to copy+delete via a manual two-step below.
        try {
          await fs.rename(staged.stagingPath, staged.destinationPath);
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === "EXDEV") {
            // Cross-device: copy then unlink.
            await fs.copyFile(staged.stagingPath, staged.destinationPath);
            await fs.unlink(staged.stagingPath);
          } else {
            throw err;
          }
        }
        committed.push(staged);
      }
      this.#state = "committed";
    } catch (rawErr) {
      // Best-effort rollback of already-committed files.
      for (const sf of committed) {
        try {
          if (sf.existedBefore && sf.originalContent !== null) {
            await fs.writeFile(sf.destinationPath, sf.originalContent, "utf-8");
          } else {
            await fs.unlink(sf.destinationPath);
          }
        } catch {
          // Swallow — we're in a best-effort rollback.
        }
      }
      this.#state = "rolled-back";
      throw new TransactionCommitError(rawErr);
    } finally {
      await this.#cleanupStagingDir();
    }
  }

  /**
   * Rolls back the transaction, restoring any previously-existing files
   * to their original content and removing newly-created files.
   * May be called when state is "open".
   */
  async rollback(): Promise<void> {
    this.#assertState("open");

    const errors: Error[] = [];

    for (const staged of this.#staged.values()) {
      try {
        // Remove the staged copy.
        await fs.unlink(staged.stagingPath).catch(() => {
          // May already be gone — ignore.
        });

        // If the destination was written already (shouldn't be, but guard):
        if (!staged.existedBefore) {
          await fs.unlink(staged.destinationPath).catch(() => undefined);
        } else if (staged.originalContent !== null) {
          await fs.writeFile(
            staged.destinationPath,
            staged.originalContent,
            "utf-8",
          );
        }
      } catch (err) {
        errors.push(err instanceof Error ? err : new Error(String(err)));
      }
    }

    this.#state = "rolled-back";
    await this.#cleanupStagingDir();

    if (errors.length > 0) {
      throw new TransactionRollbackError(errors[0]);
    }
  }

  /** Returns a read-only summary of the current transaction state. */
  summary(): TransactionSummary {
    return {
      state: this.#state,
      stagedCount: this.#staged.size,
      projectRoot: this.#projectRoot,
    };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  #assertState(expected: TransactionState): void {
    if (this.#state !== expected) {
      throw new TransactionStateError(expected, this.#state);
    }
  }

  async #cleanupStagingDir(): Promise<void> {
    try {
      await fs.rm(this.#stagingDir, { recursive: true, force: true });
    } catch {
      // Non-fatal — temp dir cleanup failure should not mask primary errors.
    }
  }
}
