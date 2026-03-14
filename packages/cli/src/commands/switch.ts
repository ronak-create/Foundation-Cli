// cli/src/commands/switch.ts
//
// Phase 6 — Feature 9
// `foundation switch <category> <moduleId>`
//
// Safely replaces one module with another in the same category.
// The CLI:
//   1. Validates the project and target module
//   2. Detects the currently installed module in that category
//   3. Checks the incoming module is not in conflict with remaining modules
//   4. Re-composes the project: builds a new plan with the old module removed
//      and the new module added
//   5. Writes only the files that changed (new module files added, old module
//      files that are not overridden left in place with a warning)
//   6. Updates project.lock and foundation.config.json
//
// Usage:
//   foundation switch orm prisma
//   foundation switch backend fastify      ← resolves to backend-fastify
//   foundation switch database mongodb

import fs    from "node:fs/promises";
import path  from "node:path";
import chalk from "chalk";
import ora   from "ora";
import {
  ModuleRegistry,
  resolveModules,
  buildCompositionPlanWithOverrides,
  runExecutionPipeline,
  readProjectState,
  isFoundationProject,
  registerInstalledPlugins,
  serialiseLockfile,
  FOUNDATION_DIR,
  LOCKFILE_NAME,
  CONFIG_NAME,
  FOUNDATION_CLI_VERSION,
  ModuleConflictError,
  type ProjectLockfile,
  type FoundationConfig,
} from "@systemlabs/foundation-core";
import {
  loadBuiltinModules,
  SELECTION_TO_MODULE_ID,
} from "@systemlabs/foundation-modules";
import { printError, printSection } from "../ui/renderer.js";

// ── Switchable categories ─────────────────────────────────────────────────────

const SWITCHABLE_CATEGORIES = [
  "orm",
  "backend",
  "database",
  "frontend",
  "auth",
  "ui",
  "deployment",
  "state",
] as const;

type SwitchableCategory = typeof SWITCHABLE_CATEGORIES[number];

// ── Entry point ───────────────────────────────────────────────────────────────

export async function runSwitchCommand(
  args: ReadonlyArray<string>,
): Promise<void> {
  const [categoryArg, moduleArg] = args;

  if (!categoryArg || !moduleArg) {
    printSwitchUsage();
    process.exit(categoryArg ? 1 : 0);
  }

  const category = categoryArg.toLowerCase() as SwitchableCategory;

  if (!(SWITCHABLE_CATEGORIES as ReadonlyArray<string>).includes(category)) {
    printError(
      `Unknown category "${categoryArg}". ` +
      `Valid categories: ${SWITCHABLE_CATEGORIES.join(", ")}.`,
    );
    process.exit(1);
  }

  const cwd = process.cwd();

  if (!(await isFoundationProject(cwd))) {
    printError("`foundation switch` must be run inside a Foundation project directory.");
    process.exit(1);
  }

  // Resolve short name → full module ID (e.g. "prisma" → "orm-prisma")
  const incomingId = SELECTION_TO_MODULE_ID[moduleArg] ?? moduleArg;

  // Build registry
  const registry = new ModuleRegistry();
  loadBuiltinModules(registry);
  await registerInstalledPlugins(cwd, registry);

  // Validate the incoming module exists
  if (!registry.hasModule(incomingId)) {
    printError(
      `Module "${incomingId}" not found in registry.\n` +
      `  Run ${chalk.white("foundation add " + moduleArg)} to install it first, ` +
      `or check the module ID with ${chalk.white("foundation --help")}.`,
    );
    process.exit(1);
  }

  const { lockfile, config } = await readProjectState(cwd);

  if (!lockfile || !config) {
    printError("Project state is corrupt. Run `foundation validate` for details.");
    process.exit(1);
  }

  // Find the currently installed module in this category
  const currentId = findInstalledInCategory(category, lockfile, registry);

  if (currentId === null) {
    printError(
      `No "${category}" module is currently installed in this project.\n` +
      `  Use ${chalk.white("foundation add " + incomingId)} to add one instead.`,
    );
    process.exit(1);
  }

  if (currentId === incomingId) {
    process.stdout.write(
      `\n  ${chalk.yellow("ℹ")}  ${chalk.bold(incomingId)} is already the active ${category} module.\n\n`,
    );
    process.exit(0);
  }

  process.stdout.write(
    `\n  ${chalk.bold("Switching")} ${chalk.dim(category)}:  ` +
    `${chalk.red(currentId)} → ${chalk.green(incomingId)}\n\n`,
  );

  // Build new module ID set: replace old with new
  const lockedIds    = lockfile.modules.map(m => m.id);
  const withoutOld   = lockedIds.filter(id => id !== currentId);
  const proposedIds  = [...new Set([...withoutOld, incomingId])];

  // Validate no conflicts with remaining modules
  const spinner = ora({ text: chalk.dim("Validating compatibility…"), color: "cyan" }).start();

  let resolution;
  try {
    resolution = resolveModules(proposedIds, registry);
  } catch (err) {
    spinner.fail(chalk.red("Compatibility check failed."));

    if (err instanceof ModuleConflictError) {
      printSection("Module Conflict");
      process.stdout.write(
        `  ${chalk.red("✖")}  ${chalk.bold(incomingId)} conflicts with ` +
        `${chalk.bold(err.conflictsWith)}.\n\n`,
      );
    } else {
      printError(err instanceof Error ? err.message : String(err));
    }
    process.exit(1);
  }

  spinner.text = chalk.dim("Building composition plan…");

  const plan = buildCompositionPlanWithOverrides(
    resolution.ordered,
    new Map(),
    registry.orm,
  );

  spinner.text = chalk.dim(`Applying ${plan.files.length} file(s)…`);

  try {
    await runExecutionPipeline(plan, {
      targetDir:   cwd,
      registry,
      skipInstall: true,
      dryRun:      false,
      hookContext: {
        config:          config.selections as Record<string, string>,
        selectedModules: proposedIds,
      },
    });
  } catch (err) {
    spinner.fail(chalk.red("Re-compose failed."));
    printError(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // Update project.lock — replace old module entry with new one
  await updateLockfile(cwd, lockfile, currentId, incomingId, registry);

  // Update foundation.config.json selections
  await updateConfig(cwd, config, category, currentId, incomingId);

  spinner.succeed(chalk.green(`Switched ${category}: ${currentId} → ${incomingId}`));

  printSection("Switch Complete");
  process.stdout.write(
    `  ${chalk.green("✔")}  ${chalk.bold(incomingId)} is now your ${category} module.\n`,
  );
  process.stdout.write(
    chalk.dim(`\n  Run ${chalk.white("npm install")} to install new packages.\n`),
  );

  // Print post-install instructions for the new module
  const newManifest = registry.getModule(incomingId).manifest;
  if (newManifest.postInstallInstructions) {
    process.stdout.write(
      `\n  ${chalk.dim("→")} ${chalk.dim(newManifest.postInstallInstructions)}\n`,
    );
  }

  process.stdout.write("\n");
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Finds the currently installed module ID for a given category.
 * Checks both the lockfile modules list and the registry for category match.
 */
function findInstalledInCategory(
  category:  string,
  lockfile:  ProjectLockfile,
  registry:  ModuleRegistry,
): string | null {
  for (const entry of lockfile.modules) {
    if (!registry.hasModule(entry.id)) continue;
    const manifest = registry.getModule(entry.id).manifest;
    if (manifest.category === category) return entry.id;
  }
  return null;
}

/**
 * Replaces the old module entry with the new one in project.lock.
 */
async function updateLockfile(
  cwd:       string,
  lockfile:  ProjectLockfile,
  oldId:     string,
  newId:     string,
  registry:  ModuleRegistry,
): Promise<void> {
  const newVersion = registry.hasModule(newId)
    ? registry.getModule(newId).manifest.version
    : "0.0.0";

  const updatedModules = lockfile.modules
    .filter(m => m.id !== oldId)
    .concat({ id: newId, version: newVersion });

  const updated: ProjectLockfile = {
    ...lockfile,
    generatedAt: new Date().toISOString(),
    foundationCliVersion: FOUNDATION_CLI_VERSION,
    modules: updatedModules,
  };

  const lockPath = path.join(cwd, FOUNDATION_DIR, LOCKFILE_NAME);
  await fs.writeFile(lockPath, serialiseLockfile(updated), "utf-8");
}

/**
 * Updates the selections in foundation.config.json so `foundation info`
 * and subsequent commands reflect the new module.
 */
async function updateConfig(
  cwd:      string,
  config:   FoundationConfig,
  category: string,
  oldId:    string,
  newId:    string,
): Promise<void> {
  // Reverse-map module ID → selection value (e.g. "orm-prisma" → "prisma")
  const reverseMap = buildReverseSelectionMap();
  const newSelectionValue = reverseMap[newId] ?? newId;

  // Find the selection key that currently holds the old module's value
  const oldSelectionValue = reverseMap[oldId] ?? oldId;
  const updatedSelections: Record<string, string> = { ...config.selections };

  for (const [key, value] of Object.entries(updatedSelections)) {
    if (value === oldSelectionValue || value === oldId) {
      updatedSelections[key] = newSelectionValue;
    }
  }

  // If no existing key matched, set the category key directly
  if (!Object.values(updatedSelections).includes(newSelectionValue)) {
    updatedSelections[category] = newSelectionValue;
  }

  const updatedConfig: FoundationConfig = {
    ...config,
    selections: updatedSelections,
  };

  const configPath = path.join(cwd, FOUNDATION_DIR, CONFIG_NAME);
  await fs.writeFile(configPath, JSON.stringify(updatedConfig, null, 2), "utf-8");
}

/**
 * Builds a reverse lookup: moduleId → selection value.
 * e.g. { "orm-prisma": "prisma", "backend-express": "express", ... }
 */
function buildReverseSelectionMap(): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [selValue, moduleId] of Object.entries(SELECTION_TO_MODULE_ID)) {
    result[moduleId] = selValue;
  }
  return result;
}

function printSwitchUsage(): void {
  process.stdout.write(
    `\n  ${chalk.bold("Usage:")} ${chalk.cyan("foundation switch")} ` +
    `${chalk.dim("<category> <module>")}\n\n` +
    `  ${chalk.bold("Categories:")}\n` +
    `    orm, backend, database, frontend, auth, ui, deployment, state\n\n` +
    `  ${chalk.bold("Examples:")}\n` +
    `    ${chalk.dim("foundation switch orm prisma")}\n` +
    `    ${chalk.dim("foundation switch backend nestjs")}\n` +
    `    ${chalk.dim("foundation switch database mongodb")}\n\n`,
  );
}