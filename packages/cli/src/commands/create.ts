import path from "node:path";
import chalk from "chalk";
import {
  ModuleRegistry,
  resolveModules,
  buildCompositionPlan,
  runExecutionPipeline,
  renderAllTemplates,
  type PipelineEvent,
} from "@foundation-cli/core";
import {
  loadBuiltinModules,
  discoverBuiltinModules,
  selectionsToModuleIds,
} from "@foundation-cli/modules";
import { runPromptFlow } from "../prompt/flow.js";
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
  const builtinIds = registry.listBuiltins().map((m) => m.id).sort();
  const pluginIds  = new Set(registry.listPlugins().map((m) => m.id));
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
          `Resolving modules… ${chalk.yellow(`+${resolution.added.join(", ")}`)}`
        );
      }
      resolveSpinner.succeed(
        chalk.dim(`Resolved ${resolution.ordered.length} module(s)`) +
          (resolution.added.length > 0
            ? chalk.dim(`  auto-added: ${chalk.yellow(resolution.added.join(", "))}`)
            : ""),
      );

      const planSpinner = createStepSpinner("Building composition plan…");
      plan = buildCompositionPlan(resolution.ordered);
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
  printRow("Modules",  String(plan.orderedModules.length));
  printRow("Files",    String(plan.files.length));
  printRow("Packages", String(plan.dependencies.length));
  process.stdout.write("\n");

  // ── 7. Render templates ───────────────────────────────────────────────────
  const templateVars: Record<string, unknown> = {
    projectName: selection.projectName,
    projectType: selection.projectType,
    ...selection.rawSelections,
  };

  const renderedPlan = {
    ...plan,
    files: renderAllTemplates(
      plan.files.map((f) => ({ relativePath: f.relativePath, content: f.content })),
      templateVars as Record<string, string>,
    ).map((f) => ({ relativePath: f.relativePath, content: f.content })),
    configPatches: plan.configPatches.map((patch) => ({
      ...patch,
      merge: renderTemplateValues(
        patch.merge as Record<string, unknown>,
        templateVars as Record<string, string>,
      ),
    })),
  };

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
        selections: selection.rawSelections as unknown as Record<string, string>,
      },
      onProgress: (event: PipelineEvent) => handler(event),
    });
  } catch (err) {
    stop();
    printError(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  stop();

  // ── 9. Write base files ───────────────────────────────────────────────────
  const baseSpinner = createStepSpinner("Writing base project files…");
  await writeBaseFiles(targetDir, selection.projectName, selection.rawSelections);
  baseSpinner.succeed(chalk.dim("Base files written"));

  printSuccess(selection.projectName);
}

// ── Base files ────────────────────────────────────────────────────────────────

async function writeBaseFiles(
  targetDir: string,
  projectName: string,
  selections: UserRawSelections,
): Promise<void> {
  const fs   = await import("node:fs/promises");
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
          dev:   "echo 'Configure dev script'",
          build: "echo 'Configure build script'",
          start: "echo 'Configure start script'",
          lint:  "eslint .",
        },
      },
      null,
      2,
    ),
  );

  await write("README.md",  buildReadme(projectName, selections));
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
  frontend:        string;
  backend:         string;
  database:        string;
  auth:            string;
  ui:              string;
  stateManagement: string;
  deployment:      string;
};

function buildReadme(projectName: string, s: UserRawSelections): string {
  const stack = [
    s.frontend   !== "none" && `- **Frontend:** ${s.frontend}`,
    s.backend    !== "none" && `- **Backend:** ${s.backend}`,
    s.database   !== "none" && `- **Database:** ${s.database}`,
    s.auth       !== "none" && `- **Auth:** ${s.auth}`,
    s.ui         !== "none" && `- **UI:** ${s.ui}`,
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

function renderTemplateValues(
  obj: Record<string, unknown>,
  vars: Record<string, string>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      result[key] = value.replace(/<%=\s*(\w+)\s*%>/g, (_, name: string) => vars[name] ?? _);
    } else if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      result[key] = renderTemplateValues(value as Record<string, unknown>, vars);
    } else {
      result[key] = value;
    }
  }
  return result;
}