import path from "node:path";
import chalk from "chalk";
import ora from "ora";
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
  NotAFoundationProjectError,
  PluginAlreadyInstalledError,
  ValidationError,
} from "@foundation-cli/core";
import { loadBuiltinModules } from "@foundation-cli/modules";
import { printError } from "../ui/renderer.js";
import { resolveConflictsInteractively } from "../conflict-resolver.js";

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

  const isLocal = pluginName.startsWith("file:");
  const displayName = isLocal
    ? path.basename(pluginName.slice(5))
    : resolvePackageName(pluginName);

  process.stdout.write(
    `\n  ${chalk.bold("Adding plugin")} ${chalk.yellow(displayName)}…\n\n`,
  );

  // ── Install plugin ─────────────────────────────────────────────────────────
  const installSpinner = ora({
    text: chalk.dim("Fetching and validating plugin…"),
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

  // ── Re-compose with conflict detection ────────────────────────────────────
  process.stdout.write(
    `\n  ${chalk.dim("Re-composing project with plugin module…")}\n`,
  );

  const composeSpinner = ora({
    text: chalk.dim("Loading registry…"),
    color: "cyan",
  }).start();

  try {
    const registry = new ModuleRegistry();
    loadBuiltinModules(registry);
    await registerInstalledPlugins(cwd, registry);

    const { config } = await readProjectState(cwd);
    const existingSelections = config?.selections ?? {};
    const existingModuleIds = Object.values(existingSelections).filter(
      (v) => v !== "none" && registry.hasModule(v),
    );

    const allModuleIds = [
      ...new Set([...existingModuleIds, pluginResult.pluginId]),
    ];

    composeSpinner.text = chalk.dim("Resolving modules…");

    let plan;
    if (allModuleIds.length === 0) {
      plan = {
        files:          [],
        dependencies:   [],
        configPatches:  [],
        orderedModules: [],
      };
    } else {
      const resolution = resolveModules(allModuleIds, registry);

      // Detect & interactively resolve conflicts before building plan
      const conflicts = detectDependencyConflicts(resolution.ordered);
      composeSpinner.stop();

      const versionOverrides = conflicts.length > 0
        ? await resolveConflictsInteractively(conflicts)
        : new Map<string, string>();

      composeSpinner.start(chalk.dim("Building composition plan…"));
      plan = buildCompositionPlanWithOverrides(resolution.ordered, versionOverrides);
    }

    composeSpinner.text = chalk.dim(
      `Applying ${plan.files.length} file(s) and ${plan.configPatches.length} patch(es)…`,
    );

    await runExecutionPipeline(plan, {
      targetDir: cwd,
      registry,
      skipInstall: true,
      dryRun: false,
      hookContext: {
        config: existingSelections,
        selectedModules: allModuleIds,
      },
    });

    composeSpinner.succeed(chalk.green("Composition applied successfully."));
  } catch (err) {
    composeSpinner.fail(chalk.red("Composition failed."));
    printError(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  process.stdout.write("\n");
  process.stdout.write(
    chalk.bold.green(`  ✔  Plugin "${pluginResult.pluginId}" added successfully!\n`),
  );
  process.stdout.write(
    chalk.dim(`\n  Run ${chalk.white("npm install")} to install new packages.\n\n`),
  );
}

function formatValidationError(err: ValidationError): string {
  return err.fieldErrors
    .map((fe) => `    • ${fe.field}: ${fe.message}`)
    .join("\n");
}