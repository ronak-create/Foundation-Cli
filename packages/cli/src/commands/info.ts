// cli/src/commands/info.ts
//
// Phase 2 — `foundation info`
//
// Prints a human-readable summary of the current Foundation project:
//   - Project name and creation date
//   - All selections (backend, database, ORM, auth, …)
//   - Installed modules (from lockfile)
//   - Installed plugins (from lockfile)
//   - Active ORM provider (from registry.orm)
//   - CLI / lockfile version info
//
// Usage:
//   foundation info

import chalk from "chalk";
import {
  ModuleRegistry,
  readProjectState,
  isFoundationProject,
  registerInstalledPlugins,
  FOUNDATION_CLI_VERSION,
} from "@systemlabs/foundation-core";
import { loadBuiltinModules } from "@systemlabs/foundation-modules";
import { printSection, printError } from "../ui/renderer.js";

// ── Entry point ───────────────────────────────────────────────────────────────

export async function runInfoCommand(): Promise<void> {
  const cwd = process.cwd();

  if (!(await isFoundationProject(cwd))) {
    printError(
      "Not a Foundation project. `foundation info` must be run inside a project directory.",
    );
    process.exit(1);
  }

  const { lockfile, config } = await readProjectState(cwd);

  if (lockfile === null || config === null) {
    printError(
      "Project state is corrupt or incomplete. " +
        "Try running `foundation validate` for details.",
    );
    process.exit(1);
  }

  // Build registry so we can query ORM provider and module metadata
  const registry = new ModuleRegistry();
  loadBuiltinModules(registry);
  await registerInstalledPlugins(cwd, registry);

  // ── Print ──────────────────────────────────────────────────────────────────

  printSection("Project Info");

  row("Project",      config.projectName);
  row("Created",      formatDate(config.createdAt));
  row("CLI version",  `v${lockfile.foundationCliVersion}` +
    (lockfile.foundationCliVersion !== FOUNDATION_CLI_VERSION
      ? chalk.yellow(` (current: v${FOUNDATION_CLI_VERSION})`)
      : ""));
  row("Package mgr",  lockfile.packageManager);

  // ── Selections ─────────────────────────────────────────────────────────────
  const sel = config.selections;
  const selEntries = Object.entries(sel).filter(([, v]) => v && v !== "none");

  if (selEntries.length > 0) {
    printSection("Stack Selections");
    for (const [key, value] of selEntries) {
      row(capitalise(key), value);
    }
  }

  // ── ORM provider (live from registry) ──────────────────────────────────────
  const ormProvider = registry.orm.getProvider();
  if (ormProvider !== null) {
    printSection("ORM");
    row("Provider",   ormProvider.name);
    row("Provider ID",ormProvider.id);
    row("Models",     String(registry.orm.getModels().length));
  }

  // ── Modules ────────────────────────────────────────────────────────────────
  printSection(`Installed Modules  ${chalk.dim(`(${lockfile.modules.length})`)}`);

  if (lockfile.modules.length === 0) {
    process.stdout.write(`  ${chalk.dim("(none)")}\n`);
  } else {
    for (const m of lockfile.modules) {
      const inRegistry = registry.hasModule(m.id);
      const label = inRegistry
        ? chalk.green(m.id)
        : chalk.red(`${m.id} ${chalk.dim("(not found in registry)")}`);
      const ver   = chalk.dim(`v${m.version}`);
      process.stdout.write(`  ${chalk.dim("•")} ${label}  ${ver}\n`);
    }
  }

  // ── Plugins ────────────────────────────────────────────────────────────────
  if (lockfile.plugins.length > 0) {
    printSection(`Installed Plugins  ${chalk.dim(`(${lockfile.plugins.length})`)}`);
    for (const p of lockfile.plugins) {
      process.stdout.write(
        `  ${chalk.dim("•")} ${chalk.magenta(p.id)}  ${chalk.dim(`v${p.version}`)}  ` +
          chalk.dim(`[${p.source}]`) + "\n",
      );
    }
  }

  process.stdout.write("\n");
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function row(label: string, value: string): void {
  process.stdout.write(
    `  ${chalk.dim((label + ":").padEnd(16))} ${chalk.white(value)}\n`,
  );
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}