// cli/src/commands/upgrade.ts
//
// GAP FILLED: `foundation upgrade` command (spec §8 Phase 4, Appendix B, §11.2)
//
// Reads project.lock, compares each module/plugin version against the
// current registry, and updates the lockfile to the latest version.
// Does NOT re-scaffold files — it only updates the lockfile so future
// `foundation compose` runs use the new versions.
//
// Usage:
//   foundation upgrade           → upgrade all modules and plugins
//   foundation upgrade --dry-run → show what would change, write nothing

import path from "node:path";
import fs from "node:fs/promises";
import chalk from "chalk";
import {
  readProjectState,
  isFoundationProject,
  FOUNDATION_DIR,
  LOCKFILE_NAME,
  FOUNDATION_CLI_VERSION,
  serialiseLockfile,
  ModuleRegistry,
  registerInstalledPlugins,
  type ProjectLockfile,
  type LockfileModuleEntry,
} from "@systemlabs/foundation-core";
import { loadBuiltinModules } from "@systemlabs/foundation-modules";
import { printSection, printError } from "../ui/renderer.js";

// ── Entry point ───────────────────────────────────────────────────────────────

export async function runUpgradeCommand(args: ReadonlyArray<string>): Promise<void> {
  const cwd    = process.cwd();
  const dryRun = args.includes("--dry-run");

  if (!(await isFoundationProject(cwd))) {
    printError(
      "Not a Foundation project. `foundation upgrade` must be run inside a project directory.",
    );
    process.exit(1);
  }

  const { lockfile } = await readProjectState(cwd);

  if (lockfile === null) {
    printError("project.lock is missing or corrupt. Cannot upgrade.");
    process.exit(1);
  }

  // Build registry with current versions
  const registry = new ModuleRegistry();
  loadBuiltinModules(registry);
  await registerInstalledPlugins(cwd, registry);

  printSection(dryRun ? "Foundation Upgrade (dry run)" : "Foundation Upgrade");

  const updatedModules: LockfileModuleEntry[] = [];
  let   changeCount = 0;

  // ── Module version comparison ─────────────────────────────────────────────
  for (const entry of lockfile.modules) {
    if (!registry.hasModule(entry.id)) {
      process.stdout.write(
        `  ${chalk.yellow("⚠")}  ${entry.id}: not found in registry — skipped\n`,
      );
      updatedModules.push(entry);
      continue;
    }

    const plugin         = registry.getModule(entry.id);
    const currentVersion = plugin.manifest.version;
    const status         = plugin.manifest.status ?? "stable";

    if (status === "removed") {
      process.stdout.write(
        `  ${chalk.red("✖")}  ${entry.id}: REMOVED — ` +
          `see https://foundation.build/migrations/${entry.id}\n`,
      );
      updatedModules.push(entry); // preserve in lockfile for user to act on
      continue;
    }

    if (entry.version === currentVersion) {
      process.stdout.write(
        `  ${chalk.dim("–")}  ${entry.id}: ${chalk.dim(`v${entry.version} (up to date)`)}\n`,
      );
      updatedModules.push(entry);
    } else {
      process.stdout.write(
        `  ${chalk.green("↑")}  ${entry.id}: ` +
          `${chalk.dim(`v${entry.version}`)} → ${chalk.green(`v${currentVersion}`)}\n`,
      );
      updatedModules.push({ id: entry.id, version: currentVersion });
      changeCount++;
    }

    if (status === "deprecated") {
      process.stdout.write(
        `    ${chalk.yellow("⚠")}  This module is deprecated. Check docs for a replacement.\n`,
      );
    }
  }

  process.stdout.write("\n");

  if (changeCount === 0) {
    process.stdout.write(`  ${chalk.green("✔")}  All modules are up to date.\n\n`);
    return;
  }

  if (dryRun) {
    process.stdout.write(
      `  ${chalk.dim(`${changeCount} module(s) would be updated (dry run — no changes written).`)}\n\n`,
    );
    return;
  }

  // ── Write updated lockfile ─────────────────────────────────────────────────
  const updated: ProjectLockfile = {
    ...lockfile,
    foundationCliVersion: FOUNDATION_CLI_VERSION,
    generatedAt:          new Date().toISOString(),
    modules:              updatedModules,
  };

  const lockfilePath = path.join(cwd, FOUNDATION_DIR, LOCKFILE_NAME);
  await fs.writeFile(lockfilePath, serialiseLockfile(updated), "utf-8");

  process.stdout.write(
    `  ${chalk.green("✔")}  Updated ${changeCount} module(s) in project.lock.\n`,
  );
  process.stdout.write(
    `  ${chalk.dim("Note: Files are not re-scaffolded. Run `foundation eject` to refresh individual module files.")}\n\n`,
  );
}
