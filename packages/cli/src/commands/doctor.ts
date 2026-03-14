// cli/src/commands/doctor.ts
//
// Phase 2 — `foundation doctor`
//
// Runs a set of diagnostic checks on the current project and prints a
// color-coded report:  ✔ pass  /  ⚠ warning  /  ✖ fail
//
// Checks performed:
//   1. Node.js version  (≥ 18 required)
//   2. Foundation project presence
//   3. Lockfile + config file integrity
//   4. Module registry consistency  (all lockfile modules still exist)
//   5. Module lifecycle status      (deprecated / removed warnings)
//   6. Module compatibility         (no conflicts among installed set)
//   7. Environment variables        (.env keys vs .env.example)
//   8. ORM provider validity        (provider registered if ORM module present)
//
// Usage:
//   foundation doctor

import fs   from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import {
  ModuleRegistry,
  readProjectState,
  isFoundationProject,
  registerInstalledPlugins,
  resolveModules,
  ModuleConflictError,
  FOUNDATION_CLI_VERSION,
} from "@systemlabs/foundation-core";
import { loadBuiltinModules } from "@systemlabs/foundation-modules";
import { printSection} from "../ui/renderer.js";

// ── Types ─────────────────────────────────────────────────────────────────────

type CheckStatus = "pass" | "warn" | "fail";

interface CheckResult {
  readonly label: string;
  readonly status: CheckStatus;
  readonly message: string;
  /** Optional detail lines printed under the main result. */
  readonly details?: ReadonlyArray<string>;
}

// ── Entry point ───────────────────────────────────────────────────────────────

export async function runDoctorCommand(): Promise<void> {
  const cwd = process.cwd();
  const results: CheckResult[] = [];

  // ── 1. Node.js version ─────────────────────────────────────────────────────
  results.push(checkNodeVersion());

  // ── 2. Foundation project presence ─────────────────────────────────────────
  const isProject = await isFoundationProject(cwd);
  results.push({
    label:   "Foundation project",
    status:  isProject ? "pass" : "fail",
    message: isProject
      ? ".foundation/project.lock found"
      : "Not a Foundation project — run `foundation create` first",
  });

  if (!isProject) {
    printReport(results);
    process.exit(1);
  }

  // ── 3. Lockfile + config integrity ─────────────────────────────────────────
  const { lockfile, config } = await readProjectState(cwd);

  results.push({
    label:   "project.lock",
    status:  lockfile !== null ? "pass" : "fail",
    message: lockfile !== null ? "Valid" : "Missing or corrupt",
  });

  results.push({
    label:   "foundation.config.json",
    status:  config !== null ? "pass" : "fail",
    message: config !== null ? "Valid" : "Missing or corrupt",
  });

  if (lockfile === null || config === null) {
    printReport(results);
    process.exit(1);
  }

  // ── 4. CLI version match ────────────────────────────────────────────────────
  const versionMatch = lockfile.foundationCliVersion === FOUNDATION_CLI_VERSION;
  results.push({
    label:   "CLI version",
    status:  versionMatch ? "pass" : "warn",
    message: versionMatch
      ? `v${FOUNDATION_CLI_VERSION}`
      : `Lockfile generated with v${lockfile.foundationCliVersion}, current CLI is v${FOUNDATION_CLI_VERSION}. Run \`foundation upgrade\`.`,
  });

  // ── 5. Build registry ───────────────────────────────────────────────────────
  const registry = new ModuleRegistry();
  loadBuiltinModules(registry);
  await registerInstalledPlugins(cwd, registry);

  // ── 6. Module registry consistency ─────────────────────────────────────────
  const missingModules: string[] = [];
  const deprecatedModules: string[] = [];
  const removedModules: string[] = [];

  for (const entry of lockfile.modules) {
    if (!registry.hasModule(entry.id)) {
      missingModules.push(entry.id);
      continue;
    }
    const status = registry.getModule(entry.id).manifest.status ?? "stable";
    if (status === "removed")    removedModules.push(entry.id);
    else if (status === "deprecated") deprecatedModules.push(entry.id);
  }

  results.push({
    label:   "Module registry",
    status:  missingModules.length > 0 || removedModules.length > 0 ? "fail"
           : deprecatedModules.length > 0 ? "warn"
           : "pass",
    message: missingModules.length === 0 && removedModules.length === 0 && deprecatedModules.length === 0
      ? `All ${lockfile.modules.length} module(s) found`
      : [
          missingModules.length  > 0 ? `${missingModules.length} missing`   : "",
          removedModules.length  > 0 ? `${removedModules.length} removed`   : "",
          deprecatedModules.length > 0 ? `${deprecatedModules.length} deprecated` : "",
        ].filter(Boolean).join(", "),
    details: [
      ...missingModules.map(   id => `Missing:    ${id}`),
      ...removedModules.map(   id => `Removed:    ${id}`),
      ...deprecatedModules.map(id => `Deprecated: ${id}`),
    ],
  });

  // ── 7. Module compatibility (conflict check) ────────────────────────────────
  const installedIds = lockfile.modules
    .map(m => m.id)
    .filter(id => registry.hasModule(id));

  let conflictMessage = "No conflicts detected";
  let conflictStatus: CheckStatus = "pass";
  const conflictDetails: string[] = [];

  try {
    resolveModules(installedIds, registry);
  } catch (err) {
    conflictStatus = "fail";
    conflictMessage = err instanceof ModuleConflictError
      ? err.message
      : "Conflict detected among installed modules";
    if (err instanceof Error) conflictDetails.push(err.message);
  }

  results.push({
    label:   "Module compatibility",
    status:  conflictStatus,
    message: conflictMessage,
    details: conflictDetails,
  });

  // ── 8. Environment variables ────────────────────────────────────────────────
  results.push(await checkEnvVars(cwd));

  // ── 9. ORM provider ─────────────────────────────────────────────────────────
  results.push(checkOrmProvider(registry, lockfile.modules.map(m => m.id)));

  // ── Print report ────────────────────────────────────────────────────────────
  printReport(results);

  const failures = results.filter(r => r.status === "fail").length;
  process.exit(failures > 0 ? 1 : 0);
}

// ── Individual checks ─────────────────────────────────────────────────────────

function checkNodeVersion(): CheckResult {
  const MIN_MAJOR = 18;
  const raw = process.version; // e.g. "v20.11.0"
  const major = parseInt(raw.slice(1).split(".")[0] ?? "0", 10);
  const ok = major >= MIN_MAJOR;
  return {
    label:   "Node.js version",
    status:  ok ? "pass" : "fail",
    message: ok
      ? `${raw} (≥ v${MIN_MAJOR} required)`
      : `${raw} is below the required v${MIN_MAJOR}. Please upgrade Node.js.`,
  };
}

async function checkEnvVars(cwd: string): Promise<CheckResult> {
  const envPath        = path.join(cwd, ".env");
  const envExamplePath = path.join(cwd, ".env.example");

  // If neither file exists, skip gracefully
  const [envExists, exampleExists] = await Promise.all([
    fileExists(envPath),
    fileExists(envExamplePath),
  ]);

  if (!exampleExists) {
    return {
      label:   "Environment variables",
      status:  "pass",
      message: "No .env.example found — skipping check",
    };
  }

  if (!envExists) {
    return {
      label:   "Environment variables",
      status:  "warn",
      message: ".env not found. Copy .env.example to .env and fill in values.",
    };
  }

  const [envContent, exampleContent] = await Promise.all([
    fs.readFile(envPath, "utf-8"),
    fs.readFile(envExamplePath, "utf-8"),
  ]);

  const envKeys     = parseEnvKeys(envContent);
  const exampleKeys = parseEnvKeys(exampleContent);
  const missing     = exampleKeys.filter(k => !envKeys.includes(k));

  if (missing.length === 0) {
    return {
      label:   "Environment variables",
      status:  "pass",
      message: `All ${exampleKeys.length} key(s) from .env.example are present in .env`,
    };
  }

  return {
    label:   "Environment variables",
    status:  "warn",
    message: `${missing.length} key(s) from .env.example are missing from .env`,
    details: missing.map(k => `Missing: ${k}`),
  };
}

function checkOrmProvider(
  registry: ModuleRegistry,
  installedIds: ReadonlyArray<string>,
): CheckResult {
  const ormModuleIds = ["orm-prisma", "orm-typeorm", "orm-mongoose", "orm-sqlalchemy"];
  const hasOrmModule = installedIds.some(id => ormModuleIds.includes(id));

  if (!hasOrmModule) {
    return {
      label:   "ORM provider",
      status:  "pass",
      message: "No ORM module installed — skipping check",
    };
  }

  const provider = registry.orm.getProvider();

  if (provider === null) {
    return {
      label:   "ORM provider",
      status:  "warn",
      message: "ORM module is installed but no provider was registered. " +
               "This is expected outside the scaffold pipeline.",
    };
  }

  return {
    label:   "ORM provider",
    status:  "pass",
    message: `${provider.name} (${provider.id})`,
  };
}

// ── Output ────────────────────────────────────────────────────────────────────

function printReport(results: CheckResult[]): void {
  printSection("Foundation Doctor");

  for (const r of results) {
    const icon =
      r.status === "pass" ? chalk.green("✔") :
      r.status === "warn" ? chalk.yellow("⚠") :
                            chalk.red("✖");

    const msg =
      r.status === "pass" ? chalk.dim(r.message) :
      r.status === "warn" ? chalk.yellow(r.message) :
                            chalk.red(r.message);

    process.stdout.write(
      `  ${icon}  ${chalk.bold(r.label.padEnd(26))} ${msg}\n`,
    );

    if (r.details && r.details.length > 0) {
      for (const detail of r.details) {
        process.stdout.write(`       ${chalk.dim("↳")} ${chalk.dim(detail)}\n`);
      }
    }
  }

  process.stdout.write("\n");

  const passes   = results.filter(r => r.status === "pass").length;
  const warnings = results.filter(r => r.status === "warn").length;
  const failures = results.filter(r => r.status === "fail").length;

  const summary: string[] = [
    chalk.green(`${passes} passed`),
    warnings > 0 ? chalk.yellow(`${warnings} warning(s)`) : "",
    failures > 0 ? chalk.red(`${failures} failed`) : "",
  ].filter(Boolean);

  process.stdout.write(`  ${summary.join(chalk.dim("  ·  "))}\n\n`);
}

// ── Utilities ─────────────────────────────────────────────────────────────────

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/** Extracts all KEY names from an env file, ignoring comments and blank lines. */
function parseEnvKeys(content: string): string[] {
  return content
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith("#"))
    .map(line => line.split("=")[0]?.trim() ?? "")
    .filter(key => key.length > 0);
}