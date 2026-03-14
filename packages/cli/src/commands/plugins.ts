// import path from "node:path";
import chalk from "chalk";
import {
  loadInstalledPlugins,
  registerInstalledPlugins,
  isFoundationProject,
  ModuleRegistry,
} from "@systemlabs/foundation-core";
import { loadBuiltinModules } from "@systemlabs/foundation-modules";
import { printError, printSection } from "../ui/renderer.js";

// ── Entry point ───────────────────────────────────────────────────────────────

export async function runPluginsCommand(
  args: ReadonlyArray<string>,
): Promise<void> {
  const sub = args[0];

  switch (sub) {
    case undefined:
    case "list":
      await listPlugins();
      break;

    default:
      printError(`Unknown plugins sub-command: "${sub}"`);
      process.stdout.write(
        chalk.dim(
          "\n  Usage:\n" +
            "    foundation plugins list\n\n",
        ),
      );
      process.exit(1);
  }
}

// ── List ──────────────────────────────────────────────────────────────────────

async function listPlugins(): Promise<void> {
  const cwd = process.cwd();

  // Read installed plugins directly (works in any directory)
  const plugins = await loadInstalledPlugins(cwd);

  printSection("Installed Plugins");

  if (plugins.length === 0) {
    process.stdout.write(
      `\n  ${chalk.dim("No plugins installed.")}\n` +
        chalk.dim(`\n  Run ${chalk.white("foundation add <plugin>")} to add one.\n\n`),
    );
    return;
  }

  process.stdout.write("\n");
  for (const { packageName, manifest, sandboxedHooks } of plugins) {
    const hookCount  = Object.keys(sandboxedHooks).length;
    const hookSuffix = hookCount > 0
      ? chalk.dim(` (${hookCount} sandboxed hook${hookCount === 1 ? "" : "s"})`)
      : "";

    process.stdout.write(
      `  ${chalk.dim("-")} ${chalk.magenta(packageName)}` +
        chalk.dim(`  v${manifest.version}`) +
        hookSuffix +
        "\n",
    );
  }
  process.stdout.write("\n");

  // Also show which plugin IDs are registered when running inside a project
  if (await isFoundationProject(cwd)) {
    const registry = new ModuleRegistry();
    loadBuiltinModules(registry);
    const registered = await registerInstalledPlugins(cwd, registry);

    if (registered.length > 0) {
      process.stdout.write(
        chalk.dim(`  Registered in module registry: `) +
          chalk.cyan(registered.join(", ")) + "\n\n",
      );
    }
  }
}
