import { runCreateCommand }  from "./commands/create.js";
import { runAddCommand }     from "./commands/add.js";
import { runSearchCommand }  from "./commands/search.js";
import { runPluginsCommand } from "./commands/plugins.js";
import { printError }        from "./ui/renderer.js";
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
    ${chalk.cyan("create")}                 Scaffold a new project interactively
    ${chalk.cyan("add")} ${chalk.dim("<plugin>")}          Add a plugin to the current project
    ${chalk.cyan("plugins list")}           List installed plugins
    ${chalk.cyan("search")} ${chalk.dim("[query]")}        Search available plugins on npm
    ${chalk.cyan("--help, -h")}             Show this help message
    ${chalk.cyan("--version, -v")}          Print CLI version

  ${chalk.bold("Available modules:")}
    frontend:   ${chalk.dim("nextjs, react-vite, vue, svelte")}
    backend:    ${chalk.dim("express, nestjs, fastapi, django")}
    database:   ${chalk.dim("postgresql, mysql, mongodb, sqlite")}
    auth:       ${chalk.dim("jwt, oauth, session, clerk, auth0")}
    ui:         ${chalk.dim("tailwind, shadcn, mui, chakra, bootstrap")}
    deployment: ${chalk.dim("docker, vercel, render, aws")}

  ${chalk.bold("Examples:")}
    ${chalk.dim("foundation")}
    ${chalk.dim("foundation create")}
    ${chalk.dim("foundation add stripe")}
    ${chalk.dim("foundation plugins list")}
    ${chalk.dim("foundation search payments")}

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
        const pkg = JSON.parse(await readFile(pkgPath, "utf-8")) as {
          version: string;
        };
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