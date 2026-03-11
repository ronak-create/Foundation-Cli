// cli/src/commands/create-plugin.ts
//
// GAP FILLED: `foundation create-plugin` command (spec §13.2)
//
// Scaffolds a new Foundation plugin package with:
//   - manifest.json (pre-filled ModuleManifest + plugin fields)
//   - hooks.mjs    (stub lifecycle hooks)
//   - files/       (empty template directory)
//   - patches/     (empty patches directory)
//   - package.json (npm metadata with foundation-plugin keyword)
//   - README.md    (plugin documentation template)
//   - tsconfig.json
//
// Usage:
//   foundation create-plugin              → interactive
//   foundation create-plugin my-plugin    → use name directly

import path from "node:path";
import fs from "node:fs/promises";
import chalk from "chalk";
import { printSection, printError } from "../ui/renderer.js";

// ── Entry point ───────────────────────────────────────────────────────────────

export async function runCreatePluginCommand(args: ReadonlyArray<string>): Promise<void> {
  let pluginName: string;

  if (args[0] !== undefined && args[0] !== "") {
    pluginName = args[0];
  } else {
    const { input } = await import("@inquirer/prompts");
    pluginName = await input({
      message: "Plugin name (e.g. stripe, redis, openai):",
      validate: (v) =>
        /^[a-z0-9-]+$/.test(v) ? true : "Use lowercase letters, numbers, and hyphens only.",
    });
  }

  const packageName = pluginName.startsWith("foundation-plugin-")
    ? pluginName
    : `foundation-plugin-${pluginName}`;

  const moduleId = pluginName.replace(/^foundation-plugin-/, "");
  const outDir   = path.resolve(process.cwd(), packageName);

  // Check the directory doesn't already exist
  try {
    await fs.access(outDir);
    printError(`Directory "${packageName}" already exists. Choose a different name.`);
    process.exit(1);
  } catch { /* expected — directory should not exist */ }

  printSection(`Scaffolding plugin: ${packageName}`);

  await fs.mkdir(outDir, { recursive: true });
  await fs.mkdir(path.join(outDir, "files"), { recursive: true });
  await fs.mkdir(path.join(outDir, "patches"), { recursive: true });
  await fs.mkdir(path.join(outDir, "src"), { recursive: true });

  // ── manifest.json ─────────────────────────────────────────────────────────
  const manifest = {
    id:          moduleId,
    name:        toTitleCase(moduleId),
    version:     "1.0.0",
    description: `Foundation CLI plugin for ${toTitleCase(moduleId)}`,
    category:    "addon",
    runtime:     "node",
    provides:    [moduleId],
    optional:    [],
    pluginApiVersion: "1.0.0",
    author:      "",
    dependencies:  [],
    files:         [],
    configPatches: [],
    compatibility: {
      requires:     [],
      conflicts:    [],
      compatibleWith: {},
      peerFrameworks: {},
    },
    postInstallInstructions: `See the ${packageName} README for configuration instructions.`,
    tags: ["foundation-plugin"],
  };

  await writeFile(outDir, "manifest.json", JSON.stringify(manifest, null, 2));

  // ── hooks.mjs ─────────────────────────────────────────────────────────────
  await writeFile(outDir, "hooks.mjs", buildHooksTemplate(packageName, moduleId));

  // ── package.json ──────────────────────────────────────────────────────────
  await writeFile(
    outDir,
    "package.json",
    JSON.stringify(
      {
        name:    packageName,
        version: "1.0.0",
        type:    "module",
        description: `Foundation CLI plugin for ${toTitleCase(moduleId)}`,
        keywords: ["foundation-plugin", moduleId],
        main:    "./src/index.js",
        exports: { ".": "./src/index.js" },
        scripts: {
          build: "tsc",
          test:  "vitest run",
          lint:  "eslint src",
        },
        peerDependencies: {
          "@foundation-cli/plugin-sdk": "^1.0.0",
        },
        devDependencies: {
          "@foundation-cli/plugin-sdk": "^1.0.0",
          typescript: "^5.0.0",
          vitest:     "^1.0.0",
        },
      },
      null,
      2,
    ),
  );

  // ── tsconfig.json ─────────────────────────────────────────────────────────
  await writeFile(
    outDir,
    "tsconfig.json",
    JSON.stringify(
      {
        compilerOptions: {
          target:          "ES2022",
          module:          "NodeNext",
          moduleResolution: "NodeNext",
          outDir:          "./dist",
          rootDir:         "./src",
          strict:          true,
          declaration:     true,
        },
        include: ["src"],
      },
      null,
      2,
    ),
  );

  // ── src/index.ts ──────────────────────────────────────────────────────────
  await writeFile(outDir, "src/index.ts", buildIndexTemplate(moduleId));

  // ── README.md ─────────────────────────────────────────────────────────────
  await writeFile(
    outDir,
    "README.md",
    `# ${packageName}

> Foundation CLI plugin for ${toTitleCase(moduleId)}.

## Installation

\`\`\`bash
foundation add ${moduleId}
\`\`\`

## Configuration

Add the following to your \`.env\` file:

\`\`\`
${moduleId.toUpperCase()}_API_KEY=your_key_here
\`\`\`

## Files Added

This plugin adds the following files to your project:

_Document your template files here._

## Hooks

| Hook | Description |
|------|-------------|
| \`afterInstall\` | Runs after package manager completes |
| \`onFinalize\`   | Prints post-install instructions |
| \`onRollback\`   | Cleans up on failure |

## Development

\`\`\`bash
npm install
npm run build
npm test
\`\`\`

## Publishing

\`\`\`bash
npm publish --access public
\`\`\`

Plugins must include the \`foundation-plugin\` keyword in \`package.json\` to
appear in \`foundation search\` results.
`,
  );

  // ── Print summary ─────────────────────────────────────────────────────────
  process.stdout.write("\n");
  process.stdout.write(`  ${chalk.green("✔")}  Plugin scaffolded at ${chalk.cyan(packageName)}/\n`);
  process.stdout.write("\n");
  process.stdout.write(`  ${chalk.bold("Next steps:")}\n`);
  process.stdout.write(`    cd ${packageName}\n`);
  process.stdout.write(`    npm install\n`);
  process.stdout.write(`    # Edit manifest.json, hooks.mjs, and files/ as needed\n`);
  process.stdout.write(`    npm run build && npm publish\n`);
  process.stdout.write("\n");
  process.stdout.write(
    `  ${chalk.dim("Docs:")} https://github.com/ronak-create/Foundation-Cli/wiki\n\n`,
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function writeFile(dir: string, rel: string, content: string): Promise<void> {
  const abs = path.join(dir, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, "utf-8");
  process.stdout.write(`  ${chalk.green("create")}  ${path.join(path.basename(dir), rel)}\n`);
}

function toTitleCase(s: string): string {
  return s
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function buildIndexTemplate(moduleId: string): string {
  const varName = toCamelCase(moduleId) + "Plugin";
  const lines = [
    `import type { PluginDefinition } from "@foundation-cli/plugin-sdk";`,
    `import manifest from "../manifest.json" assert { type: "json" };`,
    ``,
    `// Re-export manifest so the ModuleLoader can discover this plugin`,
    ["export", `const ${varName}: PluginDefinition = {`].join(" "),
    `  manifest: manifest as unknown as PluginDefinition["manifest"],`,
    `  // hooks are loaded from hooks.mjs via sandboxed execution —`,
    `  // do not import hooks directly here.`,
    `};`,
    ``,
    ["export", `default ${varName};`].join(" "),
  ];
  return lines.join("\n") + "\n";
}

/**
 * Returns the hooks.mjs file content as a string.
 * Extracted into a helper so TypeScript does not parse the `export` keywords
 * inside the template literal as real module-level exports.
 */
function buildHooksTemplate(packageName: string, moduleId: string): string {
  const lines = [
    `// ${packageName} lifecycle hooks`,
    `// All hooks receive a frozen CompositionContext and must not call fs directly.`,
    `// Use ctx.projectRoot to locate the output directory.`,
    ``,
    `/** Called after package manager completes. */`,
    `/** @param {import('@foundation-cli/plugin-sdk').PluginHookContext} ctx */`,
    ["export", `async function afterInstall(ctx) {`].join(" "),
    `  // Example: console.log('[${moduleId}] Installation complete.');`,
    `}`,
    ``,
    `/** Called after full success. Print module-specific instructions. */`,
    ["export", `async function onFinalize(ctx) {`].join(" "),
    `  // Example: remind the user to add API keys to .env`,
    `}`,
    ``,
    `/** Called on any pipeline failure. Clean up side effects. */`,
    ["export", `async function onRollback(ctx) {`].join(" "),
    `  // Clean up any external resources created during installation`,
    `}`,
  ];
  return lines.join("\n") + "\n";
}

function toCamelCase(s: string): string {
  const parts = s.split(/[-_]/);
  return (
    (parts[0] ?? "") +
    parts
      .slice(1)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join("")
  );
}
