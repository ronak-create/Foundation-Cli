// cli/src/index.ts
//
// GAP FILLED: New commands wired in:
//   - foundation eject [module]
//   - foundation upgrade [--dry-run]
//   - foundation validate
//   - foundation create-plugin [name]
//   - foundation create --preset <archetype>   (CI / non-interactive mode)

import { runCreateCommand }       from "./commands/create.js";
import { runAddCommand }          from "./commands/add.js";
import { runSearchCommand }       from "./commands/search.js";
import { runPluginsCommand }      from "./commands/plugins.js";
import { runEjectCommand }        from "./commands/eject.js";
import { runUpgradeCommand }      from "./commands/upgrade.js";
import { runValidateCommand }     from "./commands/validate.js";
import { runCreatePluginCommand } from "./commands/create-plugin.js";
import { printError }             from "./ui/renderer.js";
import chalk      from "chalk";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

// ── Help ──────────────────────────────────────────────────────────────────────

function printHelp(): void {
  process.stdout.write(`
  ${chalk.bold.white("Foundation CLI")}  ${chalk.dim("— scaffold production-ready stacks")}

  ${chalk.bold("Usage:")}
    ${chalk.cyan("foundation")} ${chalk.dim("[command] [options]")}

  ${chalk.bold("Commands:")}
    ${chalk.cyan("create")}                   Scaffold a new project interactively
    ${chalk.cyan("create --preset")} ${chalk.dim("<arch>")}  Non-interactive scaffold (CI mode)
    ${chalk.cyan("add")} ${chalk.dim("<plugin>")}            Add a plugin to the current project
    ${chalk.cyan("plugins list")}             List installed plugins
    ${chalk.cyan("search")} ${chalk.dim("[query]")}          Search available plugins on npm
    ${chalk.cyan("eject")} ${chalk.dim("[module]")}          Copy module files into project for customisation
    ${chalk.cyan("upgrade")} ${chalk.dim("[--dry-run]")}     Upgrade modules to latest registry versions
    ${chalk.cyan("validate")}                 Validate project.lock and foundation.config.json
    ${chalk.cyan("create-plugin")} ${chalk.dim("[name]")}    Scaffold a new Foundation plugin package
    ${chalk.cyan("--help, -h")}               Show this help message
    ${chalk.cyan("--version, -v")}            Print CLI version

  ${chalk.bold("Presets (--preset flag):")}
    saas, ai-app, ecommerce, api-backend, internal-tool

  ${chalk.bold("Available modules:")}
    frontend:   ${chalk.dim("nextjs, react-vite, vue, svelte")}
    backend:    ${chalk.dim("express, nestjs, fastapi, django")}
    database:   ${chalk.dim("postgresql, mysql, mongodb, sqlite")}
    auth:       ${chalk.dim("jwt, oauth, session, clerk, auth0")}
    ui:         ${chalk.dim("tailwind, shadcn, mui, chakra, bootstrap")}
    deployment: ${chalk.dim("docker, vercel, render, aws")}

  ${chalk.bold("Examples:")}
    ${chalk.dim("foundation create")}
    ${chalk.dim("foundation create --preset saas")}
    ${chalk.dim("foundation add stripe")}
    ${chalk.dim("foundation eject nextjs")}
    ${chalk.dim("foundation upgrade --dry-run")}
    ${chalk.dim("foundation validate")}
    ${chalk.dim("foundation create-plugin payments")}

`);
}

// ── Runner ────────────────────────────────────────────────────────────────────

export async function run(args: ReadonlyArray<string>): Promise<void> {
  const [command, ...rest] = args;

  switch (command) {
    case undefined:
    case "create":
      await runCreateCommand();
      break;

    case "add":
      await runAddCommand(rest);
      break;

    case "plugins":
      await runPluginsCommand(rest);
      break;

    case "search":
      await runSearchCommand(rest);
      break;

    case "eject":
      await runEjectCommand(rest);
      break;

    case "upgrade":
      await runUpgradeCommand(rest);
      break;

    case "validate":
      await runValidateCommand();
      break;

    case "create-plugin":
      await runCreatePluginCommand(rest);
      break;

    case "--help":
    case "-h":
      printHelp();
      break;

    case "--version":
    case "-v": {
      try {
        const pkgPath = path.join(
          path.dirname(fileURLToPath(import.meta.url)),
          "..",
          "package.json",
        );
        const pkg = JSON.parse(await readFile(pkgPath, "utf-8")) as { version: string };
        process.stdout.write(`foundation-cli v${pkg.version}\n`);
      } catch {
        process.stdout.write(`foundation-cli v0.0.1\n`);
      }
      break;
    }

    default:
      printError(`Unknown command: "${command}"`);
      printHelp();
      process.exit(1);
  }
}