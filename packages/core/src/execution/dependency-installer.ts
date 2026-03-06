import { execa } from "execa";
import fs from "node:fs/promises";
import path from "node:path";
import { FoundationError } from "../errors.js";
import type { PackageDependency } from "@foundation-cli/plugin-sdk";

// ── Error ─────────────────────────────────────────────────────────────────────

export class DependencyInstallError extends FoundationError {
  constructor(
    public readonly packageManager: string,
    public readonly packages: ReadonlyArray<string>,
    cause: unknown,
  ) {
    const msg = cause instanceof Error ? cause.message : String(cause);
    super(`Dependency installation failed (${packageManager}): ${msg}`, "ERR_DEPENDENCY_INSTALL");
    this.name = "DependencyInstallError";
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type PackageManager = "pnpm" | "yarn" | "npm";

export interface InstallProgress {
  readonly stage: "detecting" | "writing-package-json" | "installing" | "done";
  readonly packageManager?: PackageManager;
  readonly message: string;
}

export interface DependencyInstallerOptions {
  readonly targetDir: string;
  readonly deps: ReadonlyArray<PackageDependency>;
  readonly packageManager?: PackageManager;
  readonly onProgress?: (progress: InstallProgress) => void;
  /** Skip actual execa call — for testing. */
  readonly dryRun?: boolean;
}

export interface InstallResult {
  readonly packageManager: PackageManager;
  readonly installed: ReadonlyArray<string>;
  readonly duration: number;
}

// ── Package manager detection ─────────────────────────────────────────────────

export async function detectPackageManager(cwd: string): Promise<PackageManager> {
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
      // not found
    }
  }

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

// ── Package.json writer ───────────────────────────────────────────────────────

/**
 * Merges dependency entries into the existing package.json at targetDir.
 * Creates a minimal package.json if one does not exist.
 */
export async function writeDepsToPackageJson(
  targetDir: string,
  deps: ReadonlyArray<PackageDependency>,
): Promise<void> {
  const pkgPath = path.join(path.resolve(targetDir), "package.json");

  let existing: Record<string, unknown> = {};
  try {
    const raw = await fs.readFile(pkgPath, "utf-8");
    existing = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // File doesn't exist or is invalid — start fresh.
  }

  const depMap = (existing["dependencies"] as Record<string, string> | undefined) ?? {};
  const devDepMap = (existing["devDependencies"] as Record<string, string> | undefined) ?? {};
  const peerDepMap = (existing["peerDependencies"] as Record<string, string> | undefined) ?? {};

  for (const dep of deps) {
    if (dep.scope === "dependencies") {
      depMap[dep.name] = dep.version;
    } else if (dep.scope === "devDependencies") {
      devDepMap[dep.name] = dep.version;
    } else if (dep.scope === "peerDependencies") {
      peerDepMap[dep.name] = dep.version;
    }
  }

  const updated: Record<string, unknown> = {
    ...existing,
    name: (existing["name"] as string | undefined) ?? "my-app",
    version: (existing["version"] as string | undefined) ?? "0.1.0",
    private: true,
    type: "module",
    scripts: {
      ...(existing["scripts"] as Record<string, string> | undefined),
    },
  };

  if (Object.keys(depMap).length > 0) {
    updated["dependencies"] = {
      ...(existing["dependencies"] as Record<string, string> | undefined),
      ...depMap,
    };
  }

  if (Object.keys(devDepMap).length > 0) {
    updated["devDependencies"] = {
      ...(existing["devDependencies"] as Record<string, string> | undefined),
      ...devDepMap,
    };
  }

  if (Object.keys(peerDepMap).length > 0) {
    updated["peerDependencies"] = {
      ...(existing["peerDependencies"] as Record<string, string> | undefined),
      ...peerDepMap,
    };
  }
  
  await fs.mkdir(path.dirname(pkgPath), { recursive: true });
  await fs.writeFile(pkgPath, JSON.stringify(updated, null, 2), "utf-8");
}

// ── Installer ─────────────────────────────────────────────────────────────────

/**
 * Writes deps to package.json and runs the package manager install command.
 *
 * Emits structured InstallProgress events — no UI logic here.
 */
export async function installDependencies(
  options: DependencyInstallerOptions,
): Promise<InstallResult> {
  const { targetDir, deps, dryRun = false, onProgress } = options;
  const start = Date.now();
  const pm = options.packageManager ?? (await detectPackageManager(targetDir));

  if (deps.length === 0) {
    return { packageManager: pm, installed: [], duration: 0 };
  }

  // Detect PM
  onProgress?.({ stage: "detecting", message: "Detecting package manager…" });
  onProgress?.({
    stage: "detecting",
    packageManager: pm,
    message: `Using ${pm}`,
  });

  // Write package.json
  onProgress?.({
    stage: "writing-package-json",
    packageManager: pm,
    message: "Writing package.json…",
  });
  await writeDepsToPackageJson(targetDir, deps);

  const installedNames = deps.map((d) => `${d.name}@${d.version}`);

  if (dryRun) {
    return {
      packageManager: pm,
      installed: installedNames,
      duration: Date.now() - start,
    };
  }

  // Run install
  onProgress?.({
    stage: "installing",
    packageManager: pm,
    message: `Running ${pm} install…`,
  });

  try {
    await execa(pm, ["install"], {
      cwd: path.resolve(targetDir),
      reject: true,
    });
  } catch (err) {
    throw new DependencyInstallError(pm, installedNames, err);
  }

  const duration = Date.now() - start;

  onProgress?.({
    stage: "done",
    packageManager: pm,
    message: `Installed ${installedNames.length} package(s) in ${(duration / 1000).toFixed(1)}s`,
  });

  return {
    packageManager: pm,
    installed: installedNames,
    duration,
  };
}