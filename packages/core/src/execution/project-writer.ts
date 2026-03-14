import fs from "node:fs/promises";
import path from "node:path";
import { FileTransaction } from "../file-transaction.js";
import { safeResolve } from "../path-utils.js";
import { FoundationError } from "../errors.js";
import type { CompositionPlan } from "../types.js";

// ── Error ─────────────────────────────────────────────────────────────────────

export class FileWriteError extends FoundationError {
  constructor(
    public readonly filePath: string,
    cause: unknown,
  ) {
    const msg = cause instanceof Error ? cause.message : String(cause);
    super(`Failed to write file "${filePath}": ${msg}`, "ERR_FILE_WRITE");
    this.name = "FileWriteError";
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WriteResult {
  readonly filesWritten: number;
  readonly paths: ReadonlyArray<string>;
  readonly targetDir: string;
}

// ── Implementation ────────────────────────────────────────────────────────────

/**
 * Writes all files from a CompositionPlan into targetDir atomically.
 *
 * - Ensures targetDir exists.
 * - Validates every path against path traversal before staging.
 * - Uses FileTransaction for atomic commit / rollback.
 * - Returns a structured WriteResult.
 */
export async function executeCompositionPlan(
  plan: CompositionPlan,
  targetDir: string,
): Promise<WriteResult> {
  const resolvedTarget = path.resolve(targetDir);

  // Ensure target directory exists before opening the transaction.
  await fs.mkdir(resolvedTarget, { recursive: true });

  const txn = new FileTransaction({ projectRoot: resolvedTarget });
  await txn.open();

  const writtenPaths: string[] = [];

  try {
    for (const file of plan.files) {
      // safeResolve throws PathTraversalError on escape attempts.
      const absoluteDest = safeResolve(resolvedTarget, file.relativePath);
      writtenPaths.push(absoluteDest);

      try {
        await txn.stage(file.relativePath, file.content);
      } catch (err) {
        throw new FileWriteError(file.relativePath, err);
      }
    }

    await txn.commit();
  } catch (err) {
      // If already a FileWriteError, rethrow
    if (err instanceof FileWriteError) {
      throw err;
    }

    // Wrap everything else
    throw new FileWriteError(
      "Failed to write project files",
      err instanceof Error ? err : undefined,
    );
  }

  return {
    filesWritten: writtenPaths.length,
    paths: writtenPaths,
    targetDir: resolvedTarget,
  };
}

/**
 * Writes a single file to targetDir, creating intermediate directories.
 * Validates against path traversal.
 * Used for individual out-of-transaction writes (e.g. patched configs).
 */
export async function writeSingleFile(
  targetDir: string,
  relativePath: string,
  content: string,
): Promise<void> {
  const resolvedTarget = path.resolve(targetDir);
  const absolutePath = safeResolve(resolvedTarget, relativePath);

  try {
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, content, "utf-8");
  } catch (err) {
    throw new FileWriteError(relativePath, err);
  }
}
