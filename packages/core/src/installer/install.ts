import path from "node:path";
import fs from "node:fs/promises";
import { execa } from "execa";
import { FoundationError } from "../errors.js";

export class InstallError extends FoundationError {
  constructor(
    public readonly packageManager: PackageManager,
    cause: unknown,
  ) {
    const msg = cause instanceof Error ? cause.message : String(cause);
    super(
      `Dependency installation failed using ${packageManager}: ${msg}`,
      "ERR_INSTALL_FAILED",
    );
    this.name = "InstallError";
  }
}

export type PackageManager = "pnpm" | "npm" | "yarn";

export interface InstallOptions {
  /** Absolute path to the project directory. */
  readonly cwd: string;
  /** Override auto-detected package manager. */
  readonly packageManager?: PackageManager;
  /** Receive status updates without a spinner dependency. */
  readonly onProgress?: (message: string) => void;
}

export interface InstallResult {
  readonly packageManager: PackageManager;
  readonly duration: number;
}

/**
 * Detects the available package manager by probing lock files and then
 * the system PATH.  Resolution order: pnpm → yarn → npm (always available).
 */
export async function detectPackageManager(cwd: string): Promise<PackageManager> {
  // 1. Lock file heuristic
  const lockFiles: Array<[string, PackageManager]> = [
    ["pnpm-lock.yaml", "pnpm"],
    ["yarn.lock", "yarn"],
    ["package-lock.json", "npm"],
  ];

  for (const [lockFile, pm] of lockFiles) {
    try {
      await fs.access(path.join(cwd, lockFile));
      return pm;
    } catch {
      // not found — try next
    }
  }

  // 2. PATH probe
  for (const pm of ["pnpm", "yarn"] as const) {
    try {
      await execa(pm, ["--version"], { reject: true });
      return pm;
    } catch {
      // not on PATH
    }
  }

  return "npm";
}

/**
 * Runs `<packageManager> install` in the target directory.
 *
 * @throws InstallError on non-zero exit.
 */
export async function installDependencies(
  options: InstallOptions,
): Promise<InstallResult> {
  const pm =
    options.packageManager ?? (await detectPackageManager(options.cwd));

  options.onProgress?.(`Installing dependencies with ${pm}…`);

  const start = Date.now();

  try {
    await execa(pm, ["install"], {
      cwd: options.cwd,
      reject: true,
      all: true,
    });
  } catch (err) {
    throw new InstallError(pm, err);
  }

  const duration = Date.now() - start;
  options.onProgress?.(`Dependencies installed in ${(duration / 1000).toFixed(1)}s`);

  return { packageManager: pm, duration };
}
