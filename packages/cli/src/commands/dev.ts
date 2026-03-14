// cli/src/commands/dev.ts
//
// Phase 3 — Feature 5
// `foundation dev` / `foundation db <subcommand>` / `foundation test`
//
// These commands delegate to the npm scripts that ORM and backend modules
// injected into the project's package.json during scaffold. The active ORM
// is detected from project.lock to select the correct script names. The child
// process inherits stdio so the user sees all output in real time.
//
// Usage:
//   foundation dev                 → npm run dev
//   foundation db migrate          → npm run db:migrate  (ORM-aware)
//   foundation db seed             → npm run db:seed
//   foundation db reset            → npm run db:reset
//   foundation db studio           → npm run db:studio   (Prisma only)
//   foundation db push             → npm run db:push     (Prisma only)
//   foundation test                → npm run test

import { spawn } from "node:child_process";
import fs        from "node:fs/promises";
import path      from "node:path";
import chalk     from "chalk";
import {
  isFoundationProject,
  readProjectState,
} from "@systemlabs/foundation-core";
import { printError } from "../ui/renderer.js";

// ── ORM → script name mapping ─────────────────────────────────────────────────
//
// Each ORM module injects specific scripts into package.json via configPatches.
// Map canonical sub-command names → script names, per ORM provider.

const ORM_SCRIPT_MAP: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  "orm-prisma": {
    migrate: "db:migrate",
    seed:    "db:seed",
    reset:   "db:reset",
    studio:  "db:studio",
    push:    "db:push",
  },
  "orm-typeorm": {
    migrate: "migration:run",
    seed:    "db:seed",
    reset:   "db:reset",
  },
  "orm-mongoose": {
    seed:  "db:seed",
    reset: "db:reset",
  },
  "orm-sqlalchemy": {
    migrate: "db:migrate",  // delegates to alembic upgrade head
    seed:    "db:seed",
    reset:   "db:reset",
  },
};

// Fallback used when no ORM-specific entry exists
const DEFAULT_SCRIPT_MAP: Readonly<Record<string, string>> = {
  migrate: "db:migrate",
  seed:    "db:seed",
  reset:   "db:reset",
  studio:  "db:studio",
  push:    "db:push",
};

const DB_SUBCOMMANDS = ["migrate", "seed", "reset", "studio", "push"] as const;
type DbSubcommand = typeof DB_SUBCOMMANDS[number];

// ── foundation dev ─────────────────────────────────────────────────────────────

export async function runDevCommand(): Promise<void> {
  const cwd = process.cwd();

  if (!(await isFoundationProject(cwd))) {
    printError("`foundation dev` must be run inside a Foundation project directory.");
    process.exit(1);
  }

  await runNpmScript(cwd, "dev");
}

// ── foundation test ────────────────────────────────────────────────────────────

export async function runTestCommand(): Promise<void> {
  const cwd = process.cwd();

  if (!(await isFoundationProject(cwd))) {
    printError("`foundation test` must be run inside a Foundation project directory.");
    process.exit(1);
  }

  await runNpmScript(cwd, "test");
}

// ── foundation db <subcommand> ─────────────────────────────────────────────────

export async function runDbCommand(args: ReadonlyArray<string>): Promise<void> {
  const subcommand = args[0] as DbSubcommand | undefined;

  if (!subcommand || !(DB_SUBCOMMANDS as ReadonlyArray<string>).includes(subcommand)) {
    process.stdout.write(
      `\n  ${chalk.bold("Usage:")} ${chalk.cyan("foundation db")} ${chalk.dim("<subcommand>")}\n\n` +
      `  ${chalk.bold("Subcommands:")}\n` +
      `    ${chalk.cyan("migrate")}    Run pending database migrations\n` +
      `    ${chalk.cyan("seed")}       Seed the database with initial data\n` +
      `    ${chalk.cyan("reset")}      Drop, migrate, and re-seed the database\n` +
      `    ${chalk.cyan("studio")}     Open the ORM visual database studio (Prisma)\n` +
      `    ${chalk.cyan("push")}       Push schema changes without a migration (Prisma)\n\n`,
    );
    process.exit(subcommand ? 1 : 0);
  }

  const cwd = process.cwd();

  if (!(await isFoundationProject(cwd))) {
    printError("`foundation db` must be run inside a Foundation project directory.");
    process.exit(1);
  }

  // Detect the active ORM from the lockfile
  const { lockfile } = await readProjectState(cwd);
  const ormModuleIds = Object.keys(ORM_SCRIPT_MAP);
  const activeOrm = lockfile?.modules.find(m => ormModuleIds.includes(m.id))?.id ?? null;

  // Resolve the correct npm script name
  const scriptMap  = activeOrm ? (ORM_SCRIPT_MAP[activeOrm] ?? DEFAULT_SCRIPT_MAP) : DEFAULT_SCRIPT_MAP;
  const scriptName = scriptMap[subcommand] ?? DEFAULT_SCRIPT_MAP[subcommand];

  if (!scriptName) {
    printError(
      `Sub-command "${subcommand}" is not supported by the active ORM` +
      (activeOrm ? ` (${activeOrm})` : " (none detected)") + ".",
    );
    process.exit(1);
  }

  // Warn if the script isn't present in the project's package.json
  const pkgScripts = await readPackageScripts(cwd);
  if (pkgScripts !== null && !Object.prototype.hasOwnProperty.call(pkgScripts, scriptName)) {
    process.stdout.write(
      `  ${chalk.yellow("⚠")}  Script ${chalk.cyan(`"${scriptName}"`)} not found in package.json.\n` +
      `     Run ${chalk.dim("npm install")} first, or re-scaffold with ${chalk.dim("foundation create")}.\n\n`,
    );
    process.exit(1);
  }

  await runNpmScript(cwd, scriptName);
}

// ── Subprocess runner ──────────────────────────────────────────────────────────

/**
 * Runs `<pm> run <scriptName>` in `cwd`, inheriting stdio.
 * Exits with the child process exit code on failure.
 */
async function runNpmScript(cwd: string, scriptName: string): Promise<void> {
  const pm = await detectPackageManager(cwd);

  process.stdout.write(
    `\n  ${chalk.dim("$")} ${chalk.cyan(`${pm} run ${scriptName}`)}\n\n`,
  );

  await new Promise<void>((resolve, reject) => {
    const child = spawn(pm, ["run", scriptName], {
      cwd,
      stdio:  "inherit",
      shell:  process.platform === "win32",
    });

    child.on("error", (err) => {
      reject(new Error(`Failed to start process: ${err.message}`));
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        // Child already printed its own error output
        process.exit(code ?? 1);
      }
    });
  }).catch((err: unknown) => {
    printError(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function detectPackageManager(cwd: string): Promise<string> {
  const candidates: Array<[string, string]> = [
    ["pnpm-lock.yaml",    "pnpm"],
    ["yarn.lock",         "yarn"],
    ["package-lock.json", "npm"],
  ];
  for (const [lockFile, pm] of candidates) {
    try {
      await fs.access(path.join(cwd, lockFile));
      return pm;
    } catch { /* not found */ }
  }
  return "npm";
}

async function readPackageScripts(cwd: string): Promise<Record<string, string> | null> {
  try {
    const raw = await fs.readFile(path.join(cwd, "package.json"), "utf-8");
    const pkg = JSON.parse(raw) as { scripts?: Record<string, string> };
    return pkg.scripts ?? null;
  } catch {
    return null;
  }
}