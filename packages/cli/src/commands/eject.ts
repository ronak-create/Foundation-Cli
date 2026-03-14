// cli/src/commands/eject.ts
//
// GAP FILLED: `foundation eject [module]` command (spec §8 Phase 4, Appendix B)
//
// Copies module files from the registry (compiled module definitions) into
// the current project so the user can customise them freely. Once ejected,
// Foundation CLI no longer manages those files.
//
// Usage:
//   foundation eject             → interactive: pick which module(s) to eject
//   foundation eject nextjs      → eject a specific module by ID

import path from "node:path";
import fs from "node:fs/promises";
import chalk from "chalk";
import {
  ModuleRegistry,
  readProjectState,
  isFoundationProject,
  FOUNDATION_DIR,
  CONFIG_NAME,
  registerInstalledPlugins
} from "@systemlabs/foundation-core";
import { loadBuiltinModules } from "@systemlabs/foundation-modules";
import { printError, printSection} from "../ui/renderer.js";

// ── Entry point ───────────────────────────────────────────────────────────────

export async function runEjectCommand(args: ReadonlyArray<string>): Promise<void> {
  const cwd = process.cwd();

  // Must be inside a Foundation project
  if (!(await isFoundationProject(cwd))) {
    printError(
      "Not a Foundation project. Run `foundation create` first, or navigate to a project directory.",
    );
    process.exit(1);
  }

  // Build registry
  const registry = new ModuleRegistry();
  loadBuiltinModules(registry);
  await registerInstalledPlugins(cwd, registry);

  // Read project state to know which modules are active
  const { lockfile } = await readProjectState(cwd);
  if (lockfile === null) {
    printError("Could not read .foundation/project.lock. Is the project corrupted?");
    process.exit(1);
  }

  const activeModuleIds = lockfile.modules.map((m) => m.id);

  // Determine target module(s)
  let targetIds: string[];

  if (args.length > 0 && args[0] !== undefined && args[0] !== "") {
    const requested = args[0];
    if (!activeModuleIds.includes(requested)) {
      printError(
        `Module "${requested}" is not active in this project.\n` +
          `Active modules: ${activeModuleIds.join(", ")}`,
      );
      process.exit(1);
    }
    targetIds = [requested];
  } else {
    // Interactive pick — simple list prompt using @inquirer/prompts
    const { checkbox } = await import("@inquirer/prompts");
    const choices = activeModuleIds.map((id) => ({ name: id, value: id }));

    if (choices.length === 0) {
      printError("No modules are active in this project.");
      process.exit(0);
    }

    targetIds = await checkbox({
      message: "Select module(s) to eject:",
      choices,
    });

    if (targetIds.length === 0) {
      process.stdout.write(chalk.dim("  No modules selected. Aborting.\n"));
      process.exit(0);
    }
  }

  // Eject each selected module
  printSection("Ejecting Modules");
  let totalFiles = 0;

  for (const moduleId of targetIds) {
    let plugin;
    try {
      plugin = registry.getModule(moduleId);
    } catch {
      process.stderr.write(chalk.yellow(`  ⚠  Module "${moduleId}" not found in registry — skipping.\n`));
      continue;
    }

    const { manifest } = plugin;
    process.stdout.write(`\n  ${chalk.bold(manifest.name)} (${moduleId})\n`);

    let ejectedCount = 0;
    for (const fileEntry of manifest.files) {
      const destAbs = path.join(cwd, fileEntry.relativePath);

      // Check for conflicts — warn but overwrite (user explicitly chose to eject)
      let existed = false;
      try {
        await fs.access(destAbs);
        existed = true;
      } catch { /* file does not exist yet */ }

      await fs.mkdir(path.dirname(destAbs), { recursive: true });
      await fs.writeFile(destAbs, fileEntry.content, "utf-8");

      const label = existed ? chalk.yellow("overwrite") : chalk.green("create");
      process.stdout.write(`    ${label}  ${fileEntry.relativePath}\n`);
      ejectedCount++;
    }

    totalFiles += ejectedCount;
    process.stdout.write(`    ${chalk.dim(`${ejectedCount} file(s) ejected.`)}\n`);

    if (manifest.postInstallInstructions) {
      process.stdout.write(`\n    ${chalk.dim("Note:")} ${manifest.postInstallInstructions}\n`);
    }
  }

  // Mark ejected modules in foundation.config.json
  await markEjectedModules(cwd, targetIds);

  process.stdout.write(
    `\n  ${chalk.green("✔")}  Ejected ${totalFiles} file(s) from ${targetIds.length} module(s).\n`,
  );
  process.stdout.write(
    `  ${chalk.dim("These files are now yours to edit. Foundation CLI will no longer manage them.")}\n\n`,
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function markEjectedModules(projectRoot: string, moduleIds: string[]): Promise<void> {
  const configPath = path.join(projectRoot, FOUNDATION_DIR, CONFIG_NAME);

  let raw: string;
  try {
    raw = await fs.readFile(configPath, "utf-8");
  } catch {
    return; // config missing — skip gracefully
  }

  let config: Record<string, unknown>;
  try {
    config = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return;
  }

  const existing = Array.isArray(config["ejected"]) ? (config["ejected"] as string[]) : [];
  const merged   = Array.from(new Set([...existing, ...moduleIds]));
  config["ejected"] = merged;

  await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
}
