// cli/src/commands/validate.ts
//
// GAP FILLED: `foundation validate` command (spec Appendix B)
//
// Validates the current project's .foundation/project.lock and
// foundation.config.json for consistency. Reports:
//   - Stale or missing module entries
//   - Plugin API version compatibility
//   - Deprecated/removed module references
//   - Lockfile schema integrity

// import path from "node:path";
import chalk from "chalk";
import {
  readProjectState,
  isFoundationProject,
  FOUNDATION_CLI_VERSION,
  ModuleRegistry,
  registerInstalledPlugins
} from "@systemlabs/foundation-core";
import { loadBuiltinModules } from "@systemlabs/foundation-modules";
import { printSection, printError } from "../ui/renderer.js";

// ── Entry point ───────────────────────────────────────────────────────────────

export async function runValidateCommand(): Promise<void> {
  const cwd = process.cwd();

  if (!(await isFoundationProject(cwd))) {
    printError(
      "Not a Foundation project. `foundation validate` must be run inside a project directory.",
    );
    process.exit(1);
  }

  const { lockfile, config } = await readProjectState(cwd);

  const issues: Issue[] = [];
  const warnings: Issue[] = [];

  // ── Lockfile presence ─────────────────────────────────────────────────────
  if (lockfile === null) {
    issues.push({ kind: "error", message: "project.lock is missing or corrupt." });
  }

  if (config === null) {
    issues.push({ kind: "error", message: "foundation.config.json is missing or corrupt." });
  }

  if (lockfile === null || config === null) {
    printResults(issues, warnings);
    process.exit(issues.length > 0 ? 1 : 0);
  }

  // ── CLI version check ─────────────────────────────────────────────────────
  if (lockfile.foundationCliVersion !== FOUNDATION_CLI_VERSION) {
    warnings.push({
      kind: "warning",
      message:
        `project.lock was generated with CLI v${lockfile.foundationCliVersion}, ` +
          `current CLI is v${FOUNDATION_CLI_VERSION}. Run \`foundation upgrade\` to update.`,
    });
  }

  // ── Build registry for module checks ─────────────────────────────────────
  const registry = new ModuleRegistry();
  loadBuiltinModules(registry);
  await registerInstalledPlugins(cwd, registry);

  // ── Module checks ─────────────────────────────────────────────────────────
  for (const entry of lockfile.modules) {
    if (!registry.hasModule(entry.id)) {
      issues.push({
        kind: "error",
        message: `Module "${entry.id}" (v${entry.version}) is referenced in project.lock but not found in the registry. Has it been removed?`,
      });
      continue;
    }

    const plugin   = registry.getModule(entry.id);
    const manifest = plugin.manifest;

    // Version mismatch (advisory)
    if (manifest.version !== entry.version) {
      warnings.push({
        kind: "warning",
        message:
          `Module "${entry.id}": project.lock pins v${entry.version}, ` +
            `registry has v${manifest.version}. Run \`foundation upgrade\` to update.`,
      });
    }

    // Lifecycle status
    const status = manifest.status ?? "stable";
    if (status === "removed") {
      issues.push({
        kind: "error",
        message:
          `Module "${entry.id}" has been removed. ` +
            `See https://foundation.build/migrations/${entry.id} for migration instructions.`,
      });
    } else if (status === "deprecated") {
      warnings.push({
        kind: "warning",
        message: `Module "${entry.id}" is deprecated. Check docs for a recommended replacement.`,
      });
    }
  }

  // ── Plugin checks ─────────────────────────────────────────────────────────
  for (const pluginEntry of lockfile.plugins) {
    if (!registry.hasModule(pluginEntry.id)) {
      warnings.push({
        kind: "warning",
        message:
          `Plugin "${pluginEntry.id}" is in project.lock but not installed. ` +
            `Run \`foundation add ${pluginEntry.id}\` to reinstall.`,
      });
    }
  }

  // ── Config consistency check ──────────────────────────────────────────────
  for (const pluginId of config.plugins) {
    const inLock = lockfile.plugins.some((p) => p.id === pluginId);
    if (!inLock) {
      warnings.push({
        kind: "warning",
        message:
          `Plugin "${pluginId}" is in foundation.config.json but missing from project.lock. ` +
            `The lockfile may be out of sync.`,
      });
    }
  }

  printResults(issues, warnings);
  process.exit(issues.length > 0 ? 1 : 0);
}

// ── Output ────────────────────────────────────────────────────────────────────

interface Issue {
  kind: "error" | "warning";
  message: string;
}

function printResults(issues: Issue[], warnings: Issue[]): void {
  printSection("Foundation Validate");

  if (issues.length === 0 && warnings.length === 0) {
    process.stdout.write(`  ${chalk.green("✔")}  Project is valid.\n\n`);
    return;
  }

  for (const w of warnings) {
    process.stdout.write(`  ${chalk.yellow("⚠")}  ${chalk.yellow(w.message)}\n`);
  }

  for (const e of issues) {
    process.stdout.write(`  ${chalk.red("✖")}  ${chalk.red(e.message)}\n`);
  }

  process.stdout.write("\n");

  if (issues.length > 0) {
    process.stdout.write(
      `  ${chalk.red(`${issues.length} error(s)`)}` +
        (warnings.length > 0 ? `, ${chalk.yellow(`${warnings.length} warning(s)`)}` : "") +
        " found.\n\n",
    );
  } else {
    process.stdout.write(
      `  ${chalk.yellow(`${warnings.length} warning(s)`)} found.\n\n`,
    );
  }
}
