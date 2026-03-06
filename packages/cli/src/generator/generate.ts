import path from "node:path";
import fs from "node:fs/promises";
import chalk from "chalk";
import ora from "ora";
import {
  ModuleRegistry,
  FileTransaction,
  resolveModules,
  buildCompositionPlan,
  renderAllTemplates,
  //   applyConfigPatch,
  installDependencies,
  FoundationError,
  type CompositionPlan,
  writeDepsToPackageJson,
} from "@foundation-cli/core";
// import type { PluginDefinition, PluginHookContext } from "@foundation-cli/plugin-sdk";
import type { PluginHookContext } from "@foundation-cli/plugin-sdk";
import type { UserSelection } from "../prompt/flow.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GenerateOptions {
  /** Absolute path to the directory where the project folder will be created. */
  readonly outputDir: string;
  /** If true, skip `npm/pnpm install` step. */
  readonly skipInstall?: boolean;
  /**
   * Pre-populated registry.  If omitted, a fresh empty registry is used.
   * Callers can inject modules by registering them before passing in.
   */
  readonly registry?: ModuleRegistry;
}

export interface GenerateResult {
  readonly projectRoot: string;
  readonly filesWritten: number;
  readonly modulesUsed: ReadonlyArray<string>;
  readonly autoAdded: ReadonlyArray<string>;
  readonly packageManager: string;
  readonly duration: number;
}

const SEP = chalk.dim("━".repeat(50));

// ── Orchestrator ──────────────────────────────────────────────────────────────

/**
 * Full project generation pipeline.
 *
 * Steps:
 *  1. Create project directory
 *  2. Resolve modules from registry
 *  3. Build composition plan
 *  4. Render templates
 *  5. Open FileTransaction → stage all files → commit
 *  6. Apply config patches to written files
 *  7. Install dependencies
 *  8. Run plugin hooks
 *  9. Print success screen
 */
export async function generateProject(
  selection: UserSelection,
  options: GenerateOptions,
): Promise<GenerateResult> {
  const start = Date.now();

  const projectRoot = path.resolve(options.outputDir, selection.projectName);
  const registry = options.registry ?? new ModuleRegistry();

  // ── Step 1: Create project directory ──────────────────────────────────────
  const mkdirSpinner = ora({
    text: chalk.dim("Creating project directory…"),
    color: "cyan",
  }).start();

  try {
    await fs.mkdir(projectRoot, { recursive: true });
    mkdirSpinner.succeed(chalk.green(`Project directory created: `) + chalk.yellow(projectRoot));
  } catch (err) {
    mkdirSpinner.fail(chalk.red("Failed to create project directory."));
    throw err;
  }

  // ── Step 2: Resolve modules ───────────────────────────────────────────────
  const resolveSpinner = ora({
    text: chalk.dim("Resolving modules…"),
    color: "cyan",
  }).start();

  let plan: CompositionPlan;
  let autoAdded: ReadonlyArray<string> = [];

  try {
    // Only resolve modules that are actually registered.
    // Unregistered module IDs (e.g. "none" was already filtered, but unknown
    // real IDs) are filtered gracefully here rather than throwing on unknown
    // selections that have no implementation yet.
    const registeredIds = new Set(registry.listModules().map((m) => m.id));
    const resolveableIds = selection.selectedModules.filter((id) => registeredIds.has(id));

    if (resolveableIds.length === 0) {
      // Nothing to compose — write a bare project scaffold.
      plan = {
        files: [],
        dependencies: [],
        configPatches: [],
        orderedModules: [],
      };
    } else {
      const result = resolveModules(resolveableIds, registry);
      autoAdded = result.added;
      plan = buildCompositionPlan(result.ordered);
    }

    resolveSpinner.succeed(
      chalk.green(
        `Resolved ${plan.orderedModules.length} module(s)` +
          (autoAdded.length > 0 ? chalk.dim(` (+${autoAdded.length} auto-added)`) : ""),
      ),
    );
  } catch (err) {
    resolveSpinner.fail(chalk.red("Module resolution failed."));
    await cleanupOnFailure(projectRoot);
    throw formatError(err);
  }

  // ── Step 3 + 4: Render templates ─────────────────────────────────────────
  const templateVars = buildTemplateVariables(selection, projectRoot);
  const renderedFiles = renderAllTemplates(
    plan.files.map((f) => ({ relativePath: f.relativePath, content: f.content })),
    templateVars,
  );

  // ── Step 5: FileTransaction — stage + commit ──────────────────────────────
  const writeSpinner = ora({
    text: chalk.dim(`Writing ${renderedFiles.length} file(s)…`),
    color: "cyan",
  }).start();

  const txn = new FileTransaction({ projectRoot });

  try {
    await txn.open();

    for (const file of renderedFiles) {
      await txn.stage(file.relativePath, file.content);
    }

    // Always write a minimal package.json if no module provided one
    if (!renderedFiles.some((f) => f.relativePath === "package.json")) {
      const barePackageJson = buildBarePackageJson(selection.projectName, plan);
      await txn.stage("package.json", barePackageJson);
    }

    // Always write a .gitignore if no module provided one
    if (!renderedFiles.some((f) => f.relativePath === ".gitignore")) {
      await txn.stage(".gitignore", DEFAULT_GITIGNORE);
    }

    // Always write a README.md if no module provided one
    if (!renderedFiles.some((f) => f.relativePath === "README.md")) {
      await txn.stage("README.md", buildReadme(selection.projectName, selection.rawSelections));
    }

    await txn.commit();

    writeSpinner.succeed(chalk.green(`Written ${txn.summary().stagedCount} file(s) atomically.`));
  } catch (err) {
    writeSpinner.fail(chalk.red("File write failed — rolling back."));
    if (txn.state === "open") {
      await txn.rollback().catch(() => undefined);
    }
    await cleanupOnFailure(projectRoot);
    throw formatError(err);
  }

  // ── Step 6: Apply config patches ─────────────────────────────────────────
  if (plan.configPatches.length > 0) {
    const patchSpinner = ora({
      text: chalk.dim("Applying config patches…"),
      color: "cyan",
    }).start();

    try {
      await applyConfigPatches(projectRoot, plan.configPatches);
      patchSpinner.succeed(chalk.green(`Applied ${plan.configPatches.length} config patch(es).`));
    } catch (err) {
      patchSpinner.fail(chalk.red("Config patching failed."));
      throw formatError(err);
    }
  }

  // ── Step 7: Write deps to package.json + install ─────────────────────────
  let packageManager = "npm";

  // Always write dependencies into package.json, regardless of skipInstall.
  // This runs AFTER applyConfigPatches so the patches (e.g. scripts) are
  // already on disk and writeDepsToPackageJson preserves them via `existing`.
  if (plan.dependencies.length > 0) {
    await writeDepsToPackageJson(projectRoot, plan.dependencies);
  }

  if (!options.skipInstall && plan.dependencies.length > 0) {
    const installSpinner = ora({
      text: chalk.dim("Installing dependencies…"),
      color: "cyan",
    }).start();

    try {
      const result = await installDependencies({
        targetDir: projectRoot,
        deps: plan.dependencies,
        onProgress: (p) => {
          installSpinner.text = chalk.dim(p.message);
        },
      });
      packageManager = result.packageManager;
      installSpinner.succeed(
        chalk.green(
          `Dependencies installed via ${result.packageManager} ` +
            chalk.dim(`(${(result.duration / 1000).toFixed(1)}s)`),
        ),
      );
    } catch (err) {
      installSpinner.fail(chalk.red("Dependency installation failed."));
      throw formatError(err);
    }
  }

  // ── Step 8: Run plugin hooks ──────────────────────────────────────────────
  const hookCtx: PluginHookContext = {
    projectRoot,
    config: templateVars,
    selectedModules: selection.selectedModules,
  };

  for (const manifest of plan.orderedModules) {
    let plugin;
    try {
      plugin = registry.getModule(manifest.id);
    } catch {
      continue;
    }

    if (plugin.hooks?.afterInstall !== undefined) {
      const hookSpinner = ora({
        text: chalk.dim(`Running afterInstall hook for ${manifest.id}…`),
        color: "cyan",
      }).start();
      try {
        await plugin.hooks.afterInstall(hookCtx);
        hookSpinner.succeed(chalk.green(`Hook: ${manifest.id}/afterInstall`));
      } catch (err) {
        hookSpinner.warn(
          chalk.yellow(
            `Hook: ${manifest.id}/afterInstall failed (non-fatal): ${
              err instanceof Error ? err.message : String(err)
            }`,
          ),
        );
      }
    }
  }

  // ── Step 9: Success screen ────────────────────────────────────────────────
  const duration = Date.now() - start;
  const result: GenerateResult = {
    projectRoot,
    filesWritten: renderedFiles.length,
    modulesUsed: plan.orderedModules.map((m) => m.id),
    autoAdded,
    packageManager,
    duration,
  };

  printSuccessScreen(selection, result);

  return result;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildTemplateVariables(
  selection: UserSelection,
  projectRoot: string,
): Record<string, unknown> {
  return {
    projectName: selection.projectName,
    projectType: selection.projectType,
    projectRoot,
    frontend: selection.rawSelections.frontend,
    backend: selection.rawSelections.backend,
    database: selection.rawSelections.database,
    auth: selection.rawSelections.auth,
    ui: selection.rawSelections.ui,
    stateManagement: selection.rawSelections.stateManagement,
    deployment: selection.rawSelections.deployment,
    // Common derived flags used in templates
    hasDocker: selection.rawSelections.deployment === "docker",
    hasTypeScript: true,
    databaseUrl: buildDatabaseUrl(selection.rawSelections.database),
    authProvider: selection.rawSelections.auth,
  };
}

function buildDatabaseUrl(database: string): string {
  const urls: Record<string, string> = {
    postgresql: "postgresql://user:password@localhost:5432/<%= projectName %>",
    mysql: "mysql://user:password@localhost:3306/<%= projectName %>",
    mongodb: "mongodb://localhost:27017/<%= projectName %>",
    sqlite: "file:./dev.db",
    supabase: "postgresql://[user]:[password]@[host]:[port]/[dbname]",
  };
  return urls[database] ?? "";
}

async function applyConfigPatches(
  projectRoot: string,
  patches: CompositionPlan["configPatches"],
): Promise<void> {
  const { applyConfigPatch } = await import("@foundation-cli/core");
  const fsModule = await import("node:fs/promises");
  const pathModule = await import("node:path");

  for (const patch of patches) {
    const targetPath = pathModule.default.join(projectRoot, patch.targetFile);

    let existingContent: string;
    try {
      existingContent = await fsModule.default.readFile(targetPath, "utf-8");
    } catch {
      // File doesn't exist yet — seed with empty structure appropriate for type
      existingContent = patch.targetFile.endsWith(".json")
        ? "{}"
        : patch.targetFile.endsWith(".yaml") || patch.targetFile.endsWith(".yml")
          ? ""
          : "";
    }

    const merged = applyConfigPatch(
      patch.targetFile,
      existingContent,
      patch.merge as Record<string, unknown>,
    );

    await fsModule.default.mkdir(pathModule.default.dirname(targetPath), { recursive: true });
    await fsModule.default.writeFile(targetPath, merged, "utf-8");
  }
}

function buildBarePackageJson(projectName: string, plan: CompositionPlan): string {
  const deps: Record<string, string> = {};
  const devDeps: Record<string, string> = {};
  const peerDeps: Record<string, string> = {};

  for (const dep of plan.dependencies) {
    if (dep.scope === "dependencies") deps[dep.name] = dep.version;
    else if (dep.scope === "devDependencies") devDeps[dep.name] = dep.version;
    else if (dep.scope === "peerDependencies") peerDeps[dep.name] = dep.version;
  }

  const pkg: Record<string, unknown> = {
    name: projectName,
    version: "0.1.0",
    private: true,
    type: "module",
    scripts: {
      dev: "node src/index.js",
      build: "echo 'Configure your build step'",
      start: "node src/index.js",
    },
  };

  if (Object.keys(deps).length > 0) pkg["dependencies"] = deps;
  if (Object.keys(devDeps).length > 0) pkg["devDependencies"] = devDeps;
  if (Object.keys(peerDeps).length > 0) pkg["peerDependencies"] = peerDeps;

  return JSON.stringify(pkg, null, 2);
}

function buildReadme(projectName: string, selections: UserSelection["rawSelections"]): string {
  const lines: string[] = [
    `# ${projectName}`,
    "",
    "> Generated by [Foundation CLI](https://github.com/foundation-cli/foundation-cli)",
    "",
    "## Stack",
    "",
  ];

  const rows: Array<[string, string]> = [
    ["Frontend", selections.frontend],
    ["Backend", selections.backend],
    ["Database", selections.database],
    ["Auth", selections.auth],
    ["UI System", selections.ui],
    ["State Mgmt", selections.stateManagement],
    ["Deployment", selections.deployment],
  ];

  for (const [label, value] of rows) {
    if (value !== "none") {
      lines.push(`- **${label}**: ${value}`);
    }
  }

  lines.push(
    "",
    "## Getting Started",
    "",
    "```bash",
    `cd ${projectName}`,
    "npm install",
    "npm run dev",
    "```",
    "",
    "## Environment Variables",
    "",
    "Copy `.env.example` to `.env` and fill in your values.",
    "",
  );

  return lines.join("\n");
}

const DEFAULT_GITIGNORE = `# Dependencies
node_modules/
.pnp
.pnp.js

# Build outputs
dist/
build/
.next/
.nuxt/
.svelte-kit/
out/

# Environment
.env
.env.local
.env.*.local

# Logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# OS
.DS_Store
Thumbs.db

# Editor
.vscode/
.idea/
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?
`;

function printSuccessScreen(selection: UserSelection, result: GenerateResult): void {
  const { rawSelections } = selection;

  process.stdout.write(`\n${SEP}\n`);
  process.stdout.write(`${chalk.bold.green("  🎉  Project created successfully!")}\n`);
  process.stdout.write(`${SEP}\n\n`);

  // Selection summary
  const checkmark = chalk.green("✔");
  const printRow = (label: string, value: string): void => {
    if (value !== "none") {
      process.stdout.write(`  ${checkmark} ${chalk.dim(label.padEnd(16))} ${chalk.white(value)}\n`);
    }
  };

  printRow("Frontend", rawSelections.frontend);
  printRow("Backend", rawSelections.backend);
  printRow("Database", rawSelections.database);
  printRow("Auth", rawSelections.auth);
  printRow("UI System", rawSelections.ui);
  printRow("Deployment", rawSelections.deployment);

  process.stdout.write("\n");

  // Stats
  process.stdout.write(
    `  ${chalk.dim("Files written:")}   ${chalk.yellow(String(result.filesWritten))}\n`,
  );
  process.stdout.write(
    `  ${chalk.dim("Modules used:")}    ${chalk.yellow(String(result.modulesUsed.length))}\n`,
  );
  if (result.autoAdded.length > 0) {
    process.stdout.write(
      `  ${chalk.dim("Auto-added:")}      ${chalk.yellow(result.autoAdded.join(", "))}\n`,
    );
  }
  process.stdout.write(
    `  ${chalk.dim("Time:")}            ${chalk.yellow((result.duration / 1000).toFixed(1) + "s")}\n`,
  );

  process.stdout.write(`\n${SEP}\n`);

  // Next steps
  process.stdout.write(`\n  ${chalk.bold("Next steps:")}\n\n`);
  process.stdout.write(`  ${chalk.cyan("cd")} ${chalk.yellow(selection.projectName)}\n`);
  process.stdout.write(`  ${chalk.cyan("npm install")}\n`);
  process.stdout.write(`  ${chalk.cyan("npm run dev")}\n`);
  process.stdout.write(`\n${SEP}\n\n`);
}

async function cleanupOnFailure(projectRoot: string): Promise<void> {
  try {
    await fs.rm(projectRoot, { recursive: true, force: true });
  } catch {
    // Best-effort
  }
}

function formatError(err: unknown): Error {
  if (err instanceof FoundationError) {
    return new Error(`${chalk.red(`[${err.code}]`)} ${err.message}`);
  }
  if (err instanceof Error) return err;
  return new Error(String(err));
}