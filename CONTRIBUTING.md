# Contributing to Foundation CLI

Thank you for your interest in contributing. This document covers everything you need to go from first clone to merged pull request — development setup, contribution types, code standards, and the review process.

---

## Table of contents

- [Code of conduct](#code-of-conduct)
- [Getting started](#getting-started)
- [Project structure](#project-structure)
- [Development workflow](#development-workflow)
- [Contribution types](#contribution-types)
  - [Bug reports](#bug-reports)
  - [Feature requests](#feature-requests)
  - [Adding a new built-in module](#adding-a-new-built-in-module)
  - [Adding a new CLI command](#adding-a-new-cli-command)
  - [Building a community plugin](#building-a-community-plugin)
  - [Documentation improvements](#documentation-improvements)
- [Testing](#testing)
- [Commit conventions](#commit-conventions)
- [Pull request process](#pull-request-process)
- [Release process](#release-process)

---

## Code of conduct

This project follows the [Contributor Covenant v2.1](https://www.contributor-covenant.org/version/2/1/code_of_conduct/). Be respectful, constructive, and welcoming. Harassment or discrimination of any kind will not be tolerated.

---

## Getting started

### Prerequisites

- **Node.js ≥ 18** — `node --version`
- **pnpm ≥ 9** — `pnpm --version` (install with `npm install -g pnpm`)
- Git

### Clone and install

```bash
git clone https://github.com/ronak-create/Foundation-Cli.git
cd Foundation-Cli
pnpm install
```

### Build all packages

```bash
pnpm turbo build
```

This builds in dependency order: `plugin-sdk → core → modules → cli`. Subsequent builds are cached by turbo — only changed packages rebuild.

### Run the CLI locally

```bash
node packages/cli/dist/bin.js create
```

Or link it globally for a better local DX:

```bash
cd packages/cli
npm link
foundation create my-test-app
```

---

## Project structure

```
foundation-cli/
├── packages/
│   ├── plugin-sdk/   Public plugin contract — types, manifest schema, validateManifest()
│   ├── core/         Engine — resolver, planner, pipeline, ORM service, FileTransaction
│   ├── modules/      All built-in modules (30+ PluginDefinition exports)
│   ├── testing/      Shared test fixtures and utilities
│   └── cli/          User-facing CLI commands and prompt graph
├── ARCHITECTURE.md   Deep-dive into the engine internals
├── MODULES.md        Reference for all built-in modules
├── CONTRIBUTING.md   ← you are here
├── pnpm-workspace.yaml
└── turbo.json
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for a detailed description of each subsystem.

---

## Development workflow

```bash
# Build all packages (cached)
pnpm turbo build

# Watch mode — rebuilds on file change
pnpm turbo dev

# Type-check all packages without emitting
pnpm turbo typecheck

# Run all tests
pnpm turbo test

# Run tests for a single package
cd packages/core && pnpm test
cd packages/modules && pnpm test
cd packages/cli && pnpm test

# Lint
pnpm turbo lint
```

### Environment variables for AI assistant development

```bash
export ANTHROPIC_API_KEY=sk-ant-...
# or
export OPENAI_API_KEY=sk-...
```

---

## Contribution types

### Bug reports

Before opening an issue, check:
1. The [existing issues](https://github.com/ronak-create/Foundation-Cli/issues) — it may already be reported.
2. You are on the latest version: `foundation --version`.

When filing a bug, use the **Bug Report** issue template and include:
- Foundation CLI version
- Node.js version (`node --version`)
- Operating system
- The exact command you ran
- The full error output (copy the terminal, do not screenshot)
- A minimal reproduction if possible

---

### Feature requests

Use the **Feature Request** issue template. Describe:
- What you want to do (the goal, not the implementation)
- Why the current behaviour doesn't work for your use case
- Any alternative approaches you have considered

Large features should be discussed in an issue before a PR is opened — this avoids investing time in work that may not be merged.

---

### Adding a new built-in module

Built-in modules live in `packages/modules/src/<category>/`. Follow these steps exactly.

#### 1. Create the module file

Copy an existing module in the same category as a starting point:

```bash
cp packages/modules/src/backend/express.ts packages/modules/src/backend/hono.ts
```

Your module must export a `PluginDefinition` as the default export:

```typescript
import type { PluginDefinition } from '@systemlabs/foundation-plugin-sdk';

const plugin: PluginDefinition = {
  manifest: {
    id:          'backend-hono',           // unique, kebab-case, prefixed with category
    name:        'Hono',
    version:     '0.1.0',
    category:    'backend',
    description: 'Lightweight Hono web framework.',
    runtime:     'node',
    provides:    ['backend'],
    requires:    [],
    dependencies: [
      { name: 'hono', version: '^4.0.0', scope: 'dependencies' },
    ],
    files: [
      { relativePath: 'src/server.ts', content: serverTemplate },
    ],
    configPatches: [],
    compatibility: {
      conflicts: [],
    },
  },
  hooks: {
    onFinalize: async (ctx) => {
      ctx.logger?.info('Hono server ready. Run: npm run dev');
    },
  },
};

export default plugin;
```

Rules for `id`:
- Must be unique across all modules.
- Must be prefixed with its category: `backend-hono`, `auth-jwt`, `orm-prisma`, etc.
- Kebab-case only.

Rules for `files`:
- `relativePath` must use forward slashes.
- Content is a raw string (EJS templates are supported — use `<%= variable %>`).
- Never hardcode project names or user-specific values — use template variables from `ctx.config`.

#### 2. Export from the category index

Add the export to the category index file (create one if it does not exist):

```typescript
// packages/modules/src/backend/index.ts
export { default as backendHono } from './hono.js';
```

And re-export from the package root:

```typescript
// packages/modules/src/index.ts
export * from './backend/index.js';
```

#### 3. Register in the loader

In `packages/modules/src/registry-loader.ts`, add two entries:

```typescript
// 1. Add to BUILTIN_MODULES map
import { backendHono } from './backend/index.js';

export const BUILTIN_MODULES: Map<string, PluginDefinition> = new Map([
  // ... existing entries
  ['backend-hono', backendHono],
]);

// 2. Add to SELECTION_TO_MODULE_ID map
export const SELECTION_TO_MODULE_ID: Record<string, string> = {
  // ... existing entries
  'Hono': 'backend-hono',
};
```

#### 4. Add the prompt choice

In `packages/cli/src/prompt/graph-definition.ts`, add a choice to the backend question node:

```typescript
{
  name: 'backend',
  message: 'Backend framework',
  type: 'select',
  choices: [
    { value: 'Express', name: 'Express' },
    { value: 'NestJS',  name: 'NestJS'  },
    { value: 'FastAPI', name: 'FastAPI' },
    { value: 'Django',  name: 'Django'  },
    { value: 'Hono',    name: 'Hono'    },  // ← add this
    { value: 'None',    name: 'None'    },
  ],
}
```

#### 5. Write tests

Add a test file alongside your module or in `packages/modules/src/__tests__/`:

```typescript
import { describe, it, expect } from 'vitest';
import { validateManifest } from '@systemlabs/foundation-plugin-sdk';
import backendHono from '../backend/hono.js';

describe('backend-hono', () => {
  it('has a valid manifest', () => {
    const result = validateManifest(backendHono.manifest);
    expect(result.valid).toBe(true);
  });

  it('generates src/server.ts', () => {
    const serverFile = backendHono.manifest.files.find(
      f => f.relativePath === 'src/server.ts'
    );
    expect(serverFile).toBeDefined();
    expect(serverFile!.content).toContain('Hono');
  });
});
```

#### 6. Update MODULES.md

Add a section to [MODULES.md](./MODULES.md) under the correct category heading.

#### ORM modules — extra steps

ORM modules must also:
1. Implement `ORMProvider` from `@systemlabs/foundation-core`.
2. Call `registerProviderFromContext(ctx, provider)` in the `onRegister` hook.
3. Implement `buildSchemaFiles(models: ORMModelDefinition[]): FileEntry[]` — handle all four relation types (`many-to-one`, `one-to-many`, `one-to-one`, `many-to-many`).
4. Add a snapshot test that verifies generated schema output for a known model definition.

---

### Adding a new CLI command

New commands live in `packages/cli/src/commands/`. Each file exports a single Commander command:

```typescript
// packages/cli/src/commands/my-command.ts
import { Command } from 'commander';

export function makeMyCommand(): Command {
  return new Command('my-command')
    .description('Does something useful.')
    .argument('[arg]', 'Optional argument')
    .option('--flag', 'A boolean flag')
    .action(async (arg, options) => {
      // delegate to foundation-core — no business logic here
    });
}
```

Register it in `packages/cli/src/bin.ts`:

```typescript
import { makeMyCommand } from './commands/my-command.js';
program.addCommand(makeMyCommand());
```

Commands must:
- Delegate all business logic to `foundation-core`.
- Use `chalk` for coloured output and `ora` for spinners.
- Handle `--ci` / `NO_TTY` gracefully (no interactive prompts in CI mode).
- Print a clean error message (not a stack trace) for expected failure modes.

---

### Building a community plugin

Community plugins are npm packages with the `foundation-plugin` keyword. They can be installed in any Foundation project:

```bash
foundation add foundation-plugin-my-plugin
```

Bootstrap a new plugin package:

```bash
foundation create-plugin my-plugin-name
```

This scaffolds:
```
foundation-plugin-my-plugin/
├── manifest.json     ← validated against ModuleManifest schema
├── hooks.mjs         ← lifecycle hooks (sandboxed execution)
├── files/            ← EJS template files
├── patches/          ← config patch files
└── package.json      ← must include 'foundation-plugin' keyword
```

Import only `@systemlabs/foundation-plugin-sdk` — it is the sole external dependency you need. See the [plugin-sdk README](https://www.npmjs.com/package/@systemlabs/foundation-plugin-sdk) for the full API.

---

### Documentation improvements

Documentation lives at:

| File | Purpose |
|------|---------|
| `README.md` | Root readme — quick start, commands, module overview |
| `ARCHITECTURE.md` | Engine internals, data flow, subsystem contracts |
| `MODULES.md` | Per-module reference — files generated, deps, compatibility |
| `CONTRIBUTING.md` | This file |
| `packages/*/README.md` | Per-package npm readme |

Fix typos, add examples, improve clarity — these PRs are always welcome and never need an issue first.

---

## Testing

### Test strategy

| Layer | Tool | What it covers |
|-------|------|---------------|
| Unit | Vitest | Resolver logic, merger strategies, manifest validation, ORM service, generator service |
| Integration | Vitest | Compose 2–5 modules, validate output file structure and content |
| Snapshot | Vitest | Generated file content for known-good module combinations |
| Compilation | `tsc --noEmit` | Generated TypeScript/Python compiles with zero errors |

### Running tests

```bash
# All packages
pnpm turbo test

# Single package
cd packages/core && pnpm test

# Watch mode
cd packages/core && pnpm test --watch

# Update snapshots (intentional output changes only)
pnpm turbo test -- --update-snapshots
```

### Test utilities

Use `@systemlabs/foundation-testing` for fixtures:

```typescript
import {
  makeManifestFixture,
  createTempDir,
  makeRegistryFixture,
  makeContextFixture,
} from '@systemlabs/foundation-testing';
```

### Coverage expectations

New modules must include at minimum:
- A manifest validation test (`validateManifest()` returns `valid: true`).
- A file output test (expected `relativePath` values are present).
- A snapshot test for any generated file with non-trivial content.

New core subsystem code must include unit tests with ≥ 80% branch coverage.

---

## Commit conventions

This project uses [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short summary>

[optional body]

[optional footer]
```

**Types:**

| Type | When to use |
|------|-------------|
| `feat` | New feature or module |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `test` | Tests only (no production code) |
| `refactor` | Refactor with no behaviour change |
| `perf` | Performance improvement |
| `chore` | Build system, dependencies, tooling |
| `ci` | CI/CD pipeline changes |

**Scopes** (optional but encouraged):

`cli`, `core`, `modules`, `plugin-sdk`, `testing`, `resolver`, `pipeline`, `orm`, `generator`, `docs`

**Examples:**

```
feat(modules): add Hono backend module
fix(core): resolver auto-inject fails when capability has no provider
docs(contributing): add ORM module extra steps checklist
test(core): add snapshot tests for Prisma relation generation
chore(deps): bump vitest to 2.0
```

Breaking changes must include `BREAKING CHANGE:` in the footer:

```
feat(plugin-sdk)!: rename PluginHookContext.config to PluginHookContext.vars

BREAKING CHANGE: ctx.config is now ctx.vars in all hook implementations.
```

---

## Pull request process

1. **Fork** the repository and create your branch from `main`:
   ```bash
   git checkout -b feat/backend-hono
   ```

2. **Make your changes**, following the guidelines above.

3. **Run the full test suite and typecheck** before pushing:
   ```bash
   pnpm turbo build typecheck test lint
   ```

4. **Write a clear PR description** using the PR template. Include:
   - What the PR does
   - Why it is needed (link the issue: `Closes #123`)
   - How it was tested
   - Any breaking changes

5. **Keep PRs focused.** One feature or fix per PR. Large refactors should be discussed in an issue first.

6. **Respond to review feedback** promptly. PRs with no activity for 14 days may be closed.

### Merge criteria

- All CI checks pass (build, typecheck, test, lint)
- At least one maintainer approval
- No unresolved review comments
- Commits follow the convention (squash-merge is used — your commit messages will be the squash message)

---

## Release process

Releases are managed by maintainers.


Release notes are published on the [GitHub Releases](https://github.com/ronak-create/Foundation-Cli/releases) page. Each release includes:
- A summary of new features
- Bug fixes
- Breaking changes (with migration notes)
- Contributors

---

## Getting help

- **Questions about the codebase** — open a [Discussion](https://github.com/ronak-create/Foundation-Cli/discussions)
- **Bug reports** — open an [Issue](https://github.com/ronak-create/Foundation-Cli/issues)
- **Security vulnerabilities** — email the maintainers directly (do not open a public issue)

---

*Foundation CLI — Designed for longevity. Built for scale.*