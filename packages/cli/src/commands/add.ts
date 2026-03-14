// cli/src/commands/add.ts
//
// Phase 3 — Features 6, 7, 8
//
// Feature 6 — Dependency-Aware Module Installation
//   When a plugin requires a capability that isn't installed, the CLI prompts
//   the user to choose a compatible provider rather than failing silently.
//   When the resolver auto-adds a module, the user is offered alternatives
//   from the same category before the plan is built.
//
// Feature 7 — Module Conflict Detection
//   Pre-flight manifest check surfaces conflicts before the resolver even runs,
//   giving a clear, actionable message. The resolver's ModuleConflictError is
//   also caught and displayed cleanly.
//
// Feature 8 — Module Recommendations
//   After a successful install the CLI traverses the new module's
//   `compatibleWith` matrix and suggests uninstalled compatible modules.

import path   from "node:path";
import fs     from "node:fs/promises";
import chalk  from "chalk";
import ora    from "ora";
import { select } from "@inquirer/prompts";
import {
  ModuleRegistry,
  resolveModules,
  buildCompositionPlanWithOverrides,
  detectDependencyConflicts,
  runExecutionPipeline,
  readProjectState,
  isFoundationProject,
  installPlugin,
  registerInstalledPlugins,
  resolvePackageName,
  serialiseLockfile,
  FOUNDATION_DIR,
  LOCKFILE_NAME,
  FOUNDATION_CLI_VERSION,
  NotAFoundationProjectError,
  PluginAlreadyInstalledError,
  ValidationError,
  ModuleConflictError,
  MissingRequiredModuleError,
} from "@systemlabs/foundation-core";
import type { ModuleManifest } from "@systemlabs/foundation-plugin-sdk";
import { loadBuiltinModules, SELECTION_TO_MODULE_ID } from "@systemlabs/foundation-modules";
import { printError, printSection } from "../ui/renderer.js";
import { resolveConflictsInteractively } from "../conflict-resolver.js";

// ── Entry point ───────────────────────────────────────────────────────────────

export async function runAddCommand(
  args: ReadonlyArray<string>,
): Promise<void> {
  const pluginName = args[0];

  if (!pluginName) {
    printError("Usage: foundation add <plugin-name>");
    process.stdout.write(
      chalk.dim(
        "\n  Examples:\n" +
          "    foundation add stripe\n" +
          "    foundation add foundation-plugin-redis\n" +
          "    foundation add file:/path/to/local-plugin\n\n",
      ),
    );
    process.exit(1);
  }

  const cwd = process.cwd();

  if (!(await isFoundationProject(cwd))) {
    printError(
      `"${cwd}" is not a Foundation project.\n` +
        `  Run "foundation create" first, or cd into a Foundation project directory.`,
    );
    process.exit(1);
  }

  // ── Feature 12: Built-in module short-name resolution ──────────────────────
  // Before hitting npm, check if the name resolves to a built-in module.
  // e.g. "auth-jwt", "orm-prisma", "prisma", "jwt" all resolve without npm.
  if (!pluginName.startsWith("file:")) {
    const builtinId = resolveBuiltinModuleId(pluginName);
    if (builtinId !== null) {
      await installBuiltinModule(cwd, builtinId, pluginName);
      return;
    }
  }

  const isLocal     = pluginName.startsWith("file:");
  const displayName = isLocal
    ? path.basename(pluginName.slice(5))
    : resolvePackageName(pluginName);

  process.stdout.write(
    `\n  ${chalk.bold("Adding plugin")} ${chalk.yellow(displayName)}…\n\n`,
  );

  // ── Install plugin ──────────────────────────────────────────────────────────
  const installSpinner = ora({
    text:  chalk.dim("Fetching and validating plugin…"),
    color: "cyan",
  }).start();

  let pluginResult;
  try {
    pluginResult = await installPlugin({
      projectRoot: cwd,
      pluginName,
      onProgress: (msg) => { installSpinner.text = chalk.dim(msg); },
    });
    installSpinner.succeed(
      chalk.green(
        `Plugin installed: ${chalk.bold(pluginResult.pluginId)} v${pluginResult.resolvedVersion}`,
      ),
    );
  } catch (err) {
    installSpinner.fail(chalk.red("Plugin installation failed."));
    if (err instanceof NotAFoundationProjectError) {
      printError(err.message);
    } else if (err instanceof PluginAlreadyInstalledError) {
      printError(`Plugin "${err.pluginId}" is already installed.`);
    } else if (err instanceof ValidationError) {
      printError(`Plugin manifest is invalid:\n${formatValidationError(err)}`);
    } else {
      printError(err instanceof Error ? err.message : String(err));
    }
    process.exit(1);
  }

  // ── Build registry ──────────────────────────────────────────────────────────
  const registry = new ModuleRegistry();
  loadBuiltinModules(registry);
  await registerInstalledPlugins(cwd, registry);

  const { lockfile, config } = await readProjectState(cwd);

  // Authoritative installed set: lockfile modules + config selections
  const lockedIds    = (lockfile?.modules ?? []).map(m => m.id);
  const selectionIds = Object.values(config?.selections ?? {}).filter(
    v => v !== "none" && registry.hasModule(v),
  );
  const existingIds = [...new Set([...lockedIds, ...selectionIds])].filter(id =>
    registry.hasModule(id),
  );
  const existingSelections = config?.selections ?? {};
  const proposedIds = [...new Set([...existingIds, pluginResult.pluginId])];

  // ── Feature 7: Pre-flight manifest conflict check ───────────────────────────
  if (registry.hasModule(pluginResult.pluginId)) {
    const newManifest = registry.getModule(pluginResult.pluginId).manifest;
    const conflict    = findManifestConflict(newManifest, existingIds, registry);

    if (conflict !== null) {
      printSection("Module Conflict Detected");
      process.stdout.write(
        `  ${chalk.red("✖")}  ${chalk.bold(pluginResult.pluginId)} conflicts with ` +
        `${chalk.bold(conflict)}, which is already installed.\n\n`,
      );
      process.stdout.write(
        `  ${chalk.dim("These two modules cannot be used together.")}\n`,
      );
      process.stdout.write(
        `  ${chalk.dim(`To use ${pluginResult.pluginId}, first remove ${conflict} from your project.`)}\n\n`,
      );
      process.exit(1);
    }
  }

  // ── Re-compose with dependency-aware resolution ─────────────────────────────
  process.stdout.write(
    `\n  ${chalk.dim("Re-composing project with plugin module…")}\n`,
  );

  const composeSpinner = ora({
    text:  chalk.dim("Resolving modules…"),
    color: "cyan",
  }).start();

  try {
    let plan;

    if (proposedIds.length === 0) {
      plan = {
        files:          [],
        dependencies:   [],
        configPatches:  [],
        orderedModules: [],
      };
    } else {
      let resolution;

      try {
        resolution = resolveModules(proposedIds, registry);
      } catch (err) {
        composeSpinner.stop();

        // ── Feature 7: Hard conflict from resolver ────────────────────────────
        if (err instanceof ModuleConflictError) {
          printSection("Module Conflict Detected");
          process.stdout.write(
            `  ${chalk.red("✖")}  ${chalk.bold(err.moduleId)} conflicts with ` +
            `${chalk.bold(err.conflictsWith)}.\n\n`,
          );
          process.stdout.write(
            `  ${chalk.dim("These two modules cannot be used together.")}\n\n`,
          );
          process.exit(1);
        }

        // ── Feature 6: Missing dependency → prompt for provider ───────────────
        if (err instanceof MissingRequiredModuleError) {
          const chosen = await promptForMissingDependency(
            err.moduleId,
            err.requiredBy,
            registry,
          );

          if (chosen === null) {
            process.stdout.write(
              `\n  ${chalk.yellow("⚠")}  Skipped — required dependency "${err.moduleId}" was not selected.\n\n`,
            );
            process.exit(0);
          }

          const withDep = [...new Set([...proposedIds, chosen])];
          resolution    = resolveModules(withDep, registry);
        } else {
          throw err;
        }
      }

      // ── Feature 6: Surface auto-added modules and offer alternatives ─────────
      if (resolution.added.length > 0) {
        composeSpinner.stop();
        resolution = await promptForAutoAddedModules(resolution, proposedIds, registry);
        composeSpinner.start(chalk.dim("Building composition plan…"));
      }

      // Detect and interactively resolve npm version conflicts
      const versionConflicts = detectDependencyConflicts(resolution.ordered);
      if (versionConflicts.length > 0) {
        composeSpinner.stop();
        const versionOverrides = await resolveConflictsInteractively(versionConflicts);
        composeSpinner.start(chalk.dim("Building composition plan…"));
        plan = buildCompositionPlanWithOverrides(
          resolution.ordered,
          versionOverrides,
          // registry.orm,
        );
      } else {
        plan = buildCompositionPlanWithOverrides(
          resolution.ordered,
          new Map<string, string>(),
          // registry.orm,
        );
      }
    }

    composeSpinner.text = chalk.dim(
      `Applying ${plan.files.length} file(s) and ${plan.configPatches.length} patch(es)…`,
    );

    await runExecutionPipeline(plan, {
      targetDir:    cwd,
      registry,
      skipInstall:  true,
      dryRun:       false,
      hookContext: {
        config:          existingSelections,
        selectedModules: proposedIds,
      },
    });

    composeSpinner.succeed(chalk.green("Composition applied successfully."));
  } catch (err) {
    composeSpinner.fail(chalk.red("Composition failed."));
    printError(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // ── Feature 8: Module recommendations ──────────────────────────────────────
  printRecommendations(pluginResult.pluginId, existingIds, registry);

  process.stdout.write("\n");
  process.stdout.write(
    chalk.bold.green(`  ✔  Plugin "${pluginResult.pluginId}" added successfully!\n`),
  );
  process.stdout.write(
    chalk.dim(`\n  Run ${chalk.white("npm install")} to install new packages.\n\n`),
  );
}

// ── Feature 6: Dependency prompts ─────────────────────────────────────────────

async function promptForMissingDependency(
  missingToken: string,
  requiredBy:   string,
  registry:     ModuleRegistry,
): Promise<string | null> {
  const providers = findCapabilityProviders(missingToken, registry);

  process.stdout.write("\n");
  process.stdout.write(
    `  ${chalk.yellow("⚠")}  ${chalk.bold(requiredBy)} requires a ${chalk.cyan(missingToken)} module.\n\n`,
  );

  if (providers.length === 0) {
    process.stdout.write(
      `  ${chalk.dim(`No compatible "${missingToken}" modules found in the registry.`)}\n\n`,
    );
    return null;
  }

  const choices = [
    ...providers.map(m => ({
      name:  `${m.name}  ${chalk.dim(`(${m.id})`)}`,
      value: m.id,
    })),
    { name: chalk.dim("Skip (install without this dependency)"), value: "__skip__" },
  ];

  const chosen = await select({
    message: `Choose a ${chalk.bold(missingToken)} provider:`,
    choices,
  });

  return chosen === "__skip__" ? null : chosen;
}

async function promptForAutoAddedModules(
  resolution:  ReturnType<typeof resolveModules>,
  originalIds: ReadonlyArray<string>,
  registry:    ModuleRegistry,
): Promise<ReturnType<typeof resolveModules>> {
  const originalSet = new Set(originalIds);
  let currentIds    = [...originalIds];

  for (const autoId of resolution.added) {
    if (originalSet.has(autoId)) continue;
    if (!registry.hasModule(autoId)) continue;

    const autoManifest = registry.getModule(autoId).manifest;
    const alternatives = registry
      .listBuiltins()
      .filter(
        m =>
          m.category === autoManifest.category &&
          m.id !== autoId &&
          !currentIds.includes(m.id),
      );

    if (alternatives.length === 0) {
      process.stdout.write(
        `  ${chalk.dim("ℹ")}  Auto-adding required module: ${chalk.cyan(autoId)}\n`,
      );
      currentIds = [...new Set([...currentIds, autoId])];
      continue;
    }

    process.stdout.write(
      `\n  ${chalk.yellow("ℹ")}  ${chalk.bold(autoId)} is required — you can choose an alternative:\n`,
    );

    const choices = [
      {
        name:  `${autoManifest.name}  ${chalk.dim(`(${autoId})`)}  ${chalk.dim("[recommended]")}`,
        value: autoId,
      },
      ...alternatives.map((m: ModuleManifest) => ({
        name:  `${m.name}  ${chalk.dim(`(${m.id})`)}`,
        value: m.id,
      })),
    ];

    const chosen = await select({
      message: `Choose a ${chalk.bold(autoManifest.category)} module:`,
      choices,
    });

    currentIds = [...new Set([...currentIds, chosen])];
  }

  return resolveModules(currentIds, registry);
}

// ── Feature 8: Recommendations ────────────────────────────────────────────────

function printRecommendations(
  installedId: string,
  currentIds:  ReadonlyArray<string>,
  registry:    ModuleRegistry,
): void {
  if (!registry.hasModule(installedId)) return;

  const manifest = registry.getModule(installedId).manifest;
  const matrix   = manifest.compatibility.compatibleWith;
  if (!matrix) return;

  const currentSet = new Set(currentIds);
  const suggestions: Array<{ category: string; modules: ModuleManifest[] }> = [];

  for (const [category, allowedIds] of Object.entries(matrix)) {
    const notInstalled = allowedIds
      .filter(id => id !== "*" && !currentSet.has(id) && registry.hasModule(id))
      .map(id => registry.getModule(id).manifest);
    if (notInstalled.length > 0) {
      suggestions.push({ category, modules: notInstalled });
    }
  }

  if (suggestions.length === 0) return;

  process.stdout.write("\n");
  printSection(`Recommended for ${installedId}`);

  for (const { category, modules } of suggestions) {
    process.stdout.write(`  ${chalk.dim(category + ":")}\n`);
    for (const m of modules) {
      process.stdout.write(
        `    ${chalk.dim("•")} ${chalk.cyan(m.id)}  ${chalk.dim(m.name)}\n`,
      );
    }
  }

  process.stdout.write(
    `\n  ${chalk.dim("Run")} ${chalk.white("foundation add <module-id>")} ` +
    `${chalk.dim("to install any of the above.")}\n`,
  );
}

// ── Feature 7: Pre-flight conflict helper ─────────────────────────────────────

function findManifestConflict(
  newManifest:  ModuleManifest,
  installedIds: ReadonlyArray<string>,
  registry:     ModuleRegistry,
): string | null {
  for (const conflictId of newManifest.compatibility.conflicts ?? []) {
    if (installedIds.includes(conflictId)) return conflictId;
  }
  for (const existingId of installedIds) {
    if (!registry.hasModule(existingId)) continue;
    const existing = registry.getModule(existingId).manifest;
    if (existing.compatibility.conflicts?.includes(newManifest.id)) {
      return existingId;
    }
  }
  return null;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function findCapabilityProviders(
  token:    string,
  registry: ModuleRegistry,
): ReadonlyArray<ModuleManifest> {
  return [...registry.listBuiltins(), ...registry.listPlugins()].filter(
    m => m.category === token || m.provides?.includes(token),
  );
}

function formatValidationError(err: ValidationError): string {
  return err.fieldErrors
    .map(fe => `    • ${fe.field}: ${fe.message}`)
    .join("\n");
}
// ── Feature 12: Built-in module helpers ──────────────────────────────────────

/**
 * Resolves a short name or full module ID to a known built-in module ID.
 * Checks: exact module ID match, then SELECTION_TO_MODULE_ID short name.
 * Returns null when not a built-in (caller should fall through to npm).
 */
function resolveBuiltinModuleId(name: string): string | null {
  // Direct module ID match (e.g. "orm-prisma", "backend-express")
  const directPatterns = /^(orm|backend|database|frontend|auth|ui|deployment|state)-/;
  if (directPatterns.test(name)) return name;

  // Short-name lookup (e.g. "prisma" → "orm-prisma", "jwt" → "auth-jwt")
  const mapped = SELECTION_TO_MODULE_ID[name];
  if (mapped !== undefined) return mapped;

  return null;
}

/**
 * Installs a built-in module by composing it into the current project.
 * Mirrors the latter half of runAddCommand without the npm install step.
 */
async function installBuiltinModule(
  cwd:       string,
  moduleId:  string,
  inputName: string,
): Promise<void> {
  process.stdout.write(
    `\n  ${chalk.bold("Adding built-in module")} ${chalk.yellow(moduleId)}…\n\n`,
  );

  const registry = new ModuleRegistry();
  loadBuiltinModules(registry);
  await registerInstalledPlugins(cwd, registry);

  if (!registry.hasModule(moduleId)) {
    printError(
      `Module "${moduleId}" is not registered. ` +
      `Try ${chalk.white("foundation add " + inputName + " --npm")} to search npm instead.`,
    );
    process.exit(1);
  }

  const { lockfile, config } = await readProjectState(cwd);
  const lockedIds    = (lockfile?.modules ?? []).map(m => m.id);
  const selectionIds = Object.values(config?.selections ?? {}).filter(
    v => v !== "none" && registry.hasModule(v),
  );
  const existingIds = [...new Set([...lockedIds, ...selectionIds])].filter(id =>
    registry.hasModule(id),
  );
  const existingSelections = config?.selections ?? {};
  const proposedIds = [...new Set([...existingIds, moduleId])];

  // Pre-flight conflict check
  const newManifest = registry.getModule(moduleId).manifest;
  const conflict    = (newManifest.compatibility.conflicts ?? []).find(id =>
    existingIds.includes(id),
  );
  if (conflict) {
    printSection("Module Conflict Detected");
    process.stdout.write(
      `  ${chalk.red("✖")}  ${chalk.bold(moduleId)} conflicts with ` +
      `${chalk.bold(conflict)}, which is already installed.\n\n`,
    );
    process.exit(1);
  }

  const composeSpinner = ora({
    text:  chalk.dim("Resolving modules…"),
    color: "cyan",
  }).start();

  try {
    const resolution = resolveModules(proposedIds, registry);
    const plan = buildCompositionPlanWithOverrides(
      resolution.ordered,
      new Map<string, string>(),
      // registry.orm,
    );

    composeSpinner.text = chalk.dim(
      `Applying ${plan.files.length} file(s) and ${plan.configPatches.length} patch(es)…`,
    );

    await runExecutionPipeline(plan, {
      targetDir:    cwd,
      registry,
      skipInstall:  true,
      dryRun:       false,
      hookContext: {
        config:          existingSelections,
        selectedModules: proposedIds,
      },
    });

    composeSpinner.succeed(chalk.green(`Module "${moduleId}" added successfully.`));

    // Write the new module to project.lock so `foundation switch` and
    // `foundation info` can see it. runExecutionPipeline only writes
    // state when stateOptions is provided; for built-in adds we append directly.
    const { lockfile: currentLock } = await readProjectState(cwd);
    if (currentLock && !currentLock.modules.some(m => m.id === moduleId)) {
      const version = registry.getModule(moduleId).manifest.version;
      const updated = {
        ...currentLock,
        generatedAt:          new Date().toISOString(),
        foundationCliVersion: FOUNDATION_CLI_VERSION,
        modules:              [...currentLock.modules, { id: moduleId, version }],
      };
      await fs.writeFile(
        path.join(cwd, FOUNDATION_DIR, LOCKFILE_NAME),
        serialiseLockfile(updated),
        "utf-8",
      );
    }
  } catch (err) {
    composeSpinner.fail(chalk.red("Failed to add module."));
    printError(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // Recommendations
  printRecommendations(moduleId, existingIds, registry);

  process.stdout.write("\n");
  process.stdout.write(chalk.bold.green(`  ✔  Module "${moduleId}" added!\n`));
  process.stdout.write(
    chalk.dim(`\n  Run ${chalk.white("npm install")} to install new packages.\n\n`),
  );
}