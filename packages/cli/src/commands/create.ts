import path from "node:path";
import chalk from "chalk";
import {
  ModuleRegistry,
  resolveModules,
  buildCompositionPlan,
  runExecutionPipeline,
  renderAllTemplates,
  type PipelineEvent,
} from "@systemlabs/foundation-core";
import {
  loadBuiltinModules,
  discoverBuiltinModules,
  selectionsToModuleIds,
} from "@systemlabs/foundation-modules";
import { runPromptFlow } from "../prompt/flow.js";
import { writeEnvFiles } from "../execution/env-writer.js";
import {
  createPipelineRenderer,
  createStepSpinner,
  printSuccess,
  printError,
  printSection,
  printRow,
  printModuleList,
} from "../ui/renderer.js";

export async function runCreateCommand(): Promise<void> {
  // ── 1. Collect user selections ────────────────────────────────────────────
  const selection = await runPromptFlow();

  // ── 2. Build registry ────────────────────────────────────────────────────
  const registrySpinner = createStepSpinner("Loading modules…");
  const registry = new ModuleRegistry();
  loadBuiltinModules(registry);

  let discoveryResult;
  try {
    discoveryResult = await discoverBuiltinModules(registry);
  } catch {
    discoveryResult = null;
  }
  registrySpinner.succeed(chalk.dim(`Loaded ${registry.size} module(s)`));

  // ── 3. Show loaded modules ────────────────────────────────────────────────
  printSection("Loaded Modules");
  const builtinIds = registry
    .listBuiltins()
    .map((m) => m.id)
    .sort();
  const pluginIds = new Set(registry.listPlugins().map((m) => m.id));
  printModuleList(builtinIds, pluginIds);

  if (discoveryResult !== null && discoveryResult.failed.length > 0) {
    for (const { filePath, error } of discoveryResult.failed) {
      process.stderr.write(
        `  ${chalk.yellow("⚠")} ${chalk.dim(path.basename(filePath))}: ${chalk.dim(error.message)}\n`,
      );
    }
    process.stdout.write("\n");
  }

  // ── 4. Resolve module IDs ────────────────────────────────────────────────
  const selectionValues = Object.values(selection.rawSelections);
  const moduleIds = selectionsToModuleIds(selectionValues, registry);

  // ── 5. Resolve dependencies + build composition plan ─────────────────────
  const resolveSpinner = createStepSpinner("Resolving modules…");
  let plan;
  try {
    if (moduleIds.length === 0) {
      plan = { files: [], dependencies: [], configPatches: [], orderedModules: [] };
      resolveSpinner.succeed(chalk.dim("No modules selected"));
    } else {
      const resolution = resolveModules(moduleIds, registry);

      if (resolution.added.length > 0) {
        resolveSpinner.text = chalk.dim(
          `Resolving modules… ${chalk.yellow(`+${resolution.added.join(", ")}`)}`,
        );
      }
      resolveSpinner.succeed(
        chalk.dim(`Resolved ${resolution.ordered.length} module(s)`) +
          (resolution.added.length > 0
            ? chalk.dim(`  auto-added: ${chalk.yellow(resolution.added.join(", "))}`)
            : ""),
      );

      const planSpinner = createStepSpinner("Building composition plan…");
      plan = buildCompositionPlan(resolution.ordered, registry.orm);
      planSpinner.succeed(
        chalk.dim(
          `Composition plan ready  ` +
            `${chalk.white(plan.files.length)} file(s)  ` +
            `${chalk.white(plan.dependencies.length)} package(s)`,
        ),
      );
    }
  } catch (err) {
    resolveSpinner.fail(chalk.red("Failed"));
    printError(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // ── 6. Summary ────────────────────────────────────────────────────────────
  printSection("Generating Project");
  printRow("Modules", String(plan.orderedModules.length));
  printRow("Files", String(plan.files.length));
  printRow("Packages", String(plan.dependencies.length));
  process.stdout.write("\n");

  // ── 7. Render templates ───────────────────────────────────────────────────
  const templateVars: Record<string, string> = {
    projectName: selection.projectName,
    projectType: selection.projectType,
    ...selection.rawSelections,
    // Inject collected credentials so EJS templates can reference them
    // e.g. <%= DATABASE_URL %> or <%= JWT_SECRET %>
    ...selection.credentials.envVars,
  };

  const renderedPlan = {
    ...plan,
    files: renderAllTemplates(
      plan.files.map((f) => ({ relativePath: f.relativePath, content: f.content })),
      templateVars,
    ).map((f) => ({ relativePath: f.relativePath, content: f.content })),
    configPatches: plan.configPatches.map((patch) => ({
      ...patch,
      merge: renderTemplateValues(patch.merge, templateVars),
    })),
  };

  // ── 7b. Write credentials to .env BEFORE pipeline ────────────────────────
  // This must happen before runExecutionPipeline so that when config patches
  // run (applyAllPatches → mergeEnvContent), existing credential keys are
  // preserved and placeholder values from manifests are NOT written over them.
  const { envVars, exampleVars } = selection.credentials;
  if (Object.keys(envVars).length > 0) {
    const targetDir = path.resolve(process.cwd(), selection.projectName);
    const envSpinner = createStepSpinner("Writing environment files…");
    await writeEnvFiles({
      targetDir,
      envVars,
      exampleVars,
    });
    envSpinner.succeed(chalk.dim(".env and .env.example written"));
  }

  // ── 8. Execute pipeline ───────────────────────────────────────────────────
  const { handler, stop } = createPipelineRenderer();
  const targetDir = path.resolve(process.cwd(), selection.projectName);
  try {
    await runExecutionPipeline(renderedPlan, {
      targetDir,
      registry,
      skipInstall: true,
      dryRun: false,
      hookContext: {
        config: templateVars,
        selectedModules: moduleIds,
      },
      stateOptions: {
        projectName: selection.projectName,
        selections: Object.fromEntries(Object.entries(selection.rawSelections)),
      },
      onProgress: (event: PipelineEvent) => handler(event),
    });
  } catch (err) {
    stop();
    printError(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  stop();

  // ── 9. Sync .env from .env.example ───────────────────────────────────────
  // After the pipeline has written all .env.example keys (PORT, NODE_ENV,
  // CORS_ORIGIN, NEXT_PUBLIC_APP_URL, etc.), copy any keys that are in
  // .env.example but missing from .env — using the example file's default
  // values. This ensures `foundation doctor` passes without the user needing
  // to manually create .env from .env.example.
  await syncEnvFromExample(targetDir);

  // ── 10. Write base files ──────────────────────────────────────────────────
  const baseSpinner = createStepSpinner("Writing base project files…");
  await writeBaseFiles(targetDir, selection.projectName, selection.rawSelections);
  baseSpinner.succeed(chalk.dim("Base files written"));

  printSuccess(selection.projectName);
}

// ── Sync .env from .env.example ───────────────────────────────────────────────

/**
 * Reads .env.example and copies any keys that are missing from .env,
 * using the example's default values. Keys already in .env are preserved.
 * This fills in non-credential config values (PORT, NODE_ENV, etc.) that
 * modules write to .env.example but credential-collector doesn't collect.
 */
async function syncEnvFromExample(targetDir: string): Promise<void> {
  const fsSync = await import("node:fs/promises");
  const pathSync = await import("node:path");

  const envPath        = pathSync.default.join(targetDir, ".env");
  const envExamplePath = pathSync.default.join(targetDir, ".env.example");

  let exampleContent: string;
  try {
    exampleContent = await fsSync.default.readFile(envExamplePath, "utf-8");
  } catch {
    return; // no .env.example — nothing to sync
  }

  let envContent = "";
  try {
    envContent = await fsSync.default.readFile(envPath, "utf-8");
  } catch {
    // .env doesn't exist yet — will be created
  }

  // Parse existing .env keys
  const existingKeys = new Set(
    envContent.split("\n")
      .filter(l => l.trim() && !l.trim().startsWith("#") && l.includes("="))
      .map(l => l.slice(0, l.indexOf("=")).trim()),
  );

  // Collect keys from .env.example that are missing from .env
  const toAppend: string[] = [];
  for (const line of exampleContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const key = trimmed.slice(0, trimmed.indexOf("=")).trim();
    if (!existingKeys.has(key)) {
      toAppend.push(line); // copy with default value from .env.example
    }
  }

  if (toAppend.length === 0) return;

  const separator = envContent && !envContent.endsWith("\n") ? "\n" : "";
  const addition  = "\n# Config defaults (from .env.example)\n" + toAppend.join("\n") + "\n";
  await fsSync.default.writeFile(envPath, envContent + separator + addition, "utf-8");
}

// ── Base files ────────────────────────────────────────────────────────────────

async function writeBaseFiles(
  targetDir: string,
  projectName: string,
  selections: UserRawSelections,
): Promise<void> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");

  const write = async (rel: string, content: string): Promise<void> => {
    const abs = path.default.join(targetDir, rel);
    try {
      await fs.default.access(abs);
    } catch {
      await fs.default.mkdir(path.default.dirname(abs), { recursive: true });
      await fs.default.writeFile(abs, content, "utf-8");
    }
  };

  await write(
    "package.json",
    JSON.stringify(
      {
        name: projectName,
        version: "0.1.0",
        private: true,
        type: "module",
        scripts: {
          dev: "echo 'Configure dev script'",
          build: "echo 'Configure build script'",
          start: "echo 'Configure start script'",
          lint: "eslint .",
        },
      },
      null,
      2,
    ),
  );

  await write("README.md", buildReadme(projectName, selections));
  await write(".gitignore", BASE_GITIGNORE);
  await write(
    ".eslintrc.json",
    JSON.stringify(
      {
        root: true,
        env: { node: true, es2022: true },
        extends: ["eslint:recommended"],
        parserOptions: { ecmaVersion: 2022, sourceType: "module" },
        rules: { "no-unused-vars": "warn", "no-console": "off" },
      },
      null,
      2,
    ),
  );
}

type UserRawSelections = {
  frontend: string;
  backend: string;
  database: string;
  auth: string;
  ui: string;
  stateManagement: string;
  deployment: string;
};

function buildReadme(projectName: string, s: UserRawSelections): string {
  const stack = [
    s.frontend !== "none" && `- **Frontend:** ${s.frontend}`,
    s.backend !== "none" && `- **Backend:** ${s.backend}`,
    s.database !== "none" && `- **Database:** ${s.database}`,
    s.auth !== "none" && `- **Auth:** ${s.auth}`,
    s.ui !== "none" && `- **UI:** ${s.ui}`,
    s.deployment !== "none" && `- **Deployment:** ${s.deployment}`,
  ]
    .filter(Boolean)
    .join("\n");

  return `# ${projectName}\n\n> Generated by [Foundation CLI](https://github.com/foundation-cli)\n\n## Stack\n\n${stack || "- Custom configuration"}\n\n## Getting Started\n\n\`\`\`bash\ncd ${projectName}\nnpm install\nnpm run dev\n\`\`\`\n\n## Environment Variables\n\nCopy \`.env.example\` to \`.env\` and fill in your values:\n\n\`\`\`bash\ncp .env.example .env\n\`\`\`\n`;
}

const BASE_GITIGNORE = `# Dependencies
node_modules/
.pnp
.pnp.js

# Build
dist/
build/
.next/
out/

# Env
.env
.env.local
.env.*.local

# Logs
*.log
npm-debug.log*

# OS
.DS_Store
Thumbs.db

# Editor
.vscode/
.idea/
`;

function renderTemplateValues(obj: unknown, vars: Record<string, string>): Record<string, unknown> {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    return {};
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (typeof value === "string") {
      result[key] = value.replace(/<%=\s*(\w+)\s*%>/g, (_, name: string) => vars[name] ?? _);
    } else if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      result[key] = renderTemplateValues(value, vars);
    } else {
      result[key] = value;
    }
  }
  return result;
}