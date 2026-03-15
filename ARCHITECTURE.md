# Architecture

Foundation CLI is a **dependency-aware project assembler** built as a pnpm monorepo of five packages. This document describes how they fit together, how data flows from a CLI invocation to a working project on disk, and the design contracts that each subsystem must honour.

---

## Package topology

```
foundation-cli/
├── packages/
│   ├── plugin-sdk/   @systemlabs/foundation-plugin-sdk   (zero runtime deps)
│   ├── core/         @systemlabs/foundation-core
│   ├── modules/      @systemlabs/foundation-modules
│   ├── testing/      @systemlabs/foundation-testing
│   └── cli/          @systemlabs/foundation-cli
├── pnpm-workspace.yaml
└── turbo.json
```

Build order enforced by turbo `dependsOn: ["^build"]`:

```
plugin-sdk → core → modules → cli
```

`testing` depends on `core` and `plugin-sdk`; it is a devDependency of `modules` and `cli`.

---

## Package responsibilities

### `@systemlabs/foundation-plugin-sdk`

The **public plugin contract**. This is the only package a third-party plugin author imports. It has zero runtime dependencies (AJV is a dev dependency used only in `validate.ts`).

Key exports:

| File | Exports |
|------|---------|
| `types.ts` | `PluginDefinition`, `ModuleManifest`, `PluginHooks`, `PluginHookContext`, all ORM types |
| `schema.ts` | AJV-compiled JSON Schema for manifest validation |
| `validate.ts` | `validateManifest(manifest): ValidationResult` |

Anything in this package is part of the **public API surface** and must be changed only with a major version bump.

---

### `@systemlabs/foundation-core`

The **engine**. No CLI dependencies — it can be embedded in other tools. Contains six subsystems:

| Subsystem | Location | Role |
|-----------|----------|------|
| Module Registry | `src/module-registry/` | Loads, validates, and indexes modules |
| Dependency Resolver | `src/dependency-resolver/` | Capability-based DAG resolution + topological sort |
| Composition Planner | `src/composition/` | Merges file trees, produces an `ExecutionPlan` |
| Execution Pipeline | `src/execution/` | Runs 14 hooks, writes files, installs packages |
| ORM Service | `src/orm/` | Portable model layer; provider-specific code generation |
| Generator Service | `src/generator/` | Registry of code generators invoked by `foundation generate` |

Also contains cross-cutting utilities: `FileTransaction` (atomic writes), `PluginInstaller` (npm fetcher + sandbox), `Lockfile`/`ProjectState` (`.foundation/` state), and the EJS template engine (`src/templating/render.ts`).

---

### `@systemlabs/foundation-modules`

Every first-party module as a `PluginDefinition`. Organised by category under `src/`:

```
src/
├── frontend/     nextjs · react-vite · vue · svelte
├── backend/      express · nestjs · fastapi · django
├── database/     postgresql · mysql · mongodb · sqlite · supabase
├── orm/          prisma · typeorm · mongoose · sqlalchemy
├── auth/         jwt · oauth · session · clerk · auth0
├── ui/           tailwind · shadcn · mui · chakra · bootstrap
├── state/        zustand · redux · tanstack-query
├── deployment/   docker · vercel · render · aws
└── addon/        stripe · redis · openai
```

The `registry-loader.ts` file exports two maps that the CLI uses:

- `BUILTIN_MODULES` — `Map<string, PluginDefinition>`
- `SELECTION_TO_MODULE_ID` — maps user prompt choices to canonical module IDs

---

### `@systemlabs/foundation-cli`

The **user-facing layer**. Registers one Commander command per CLI verb. Does not contain business logic — all heavy lifting is delegated to `foundation-core`.

```
src/
├── commands/        create · new · add · switch · generate · info · doctor
│                    dev · db · test · eject · upgrade · validate
│                    search · create-plugin · ai
├── prompt/          PromptGraph engine · archetypes · graph-definition.ts
├── execution/       env-writer.ts
├── conflict-resolver.ts
└── ui/renderer.ts   (Chalk + Ora output)
```

---

## Data flow: `foundation create`

```
CLI Args + ENV
      │
      ▼
PromptGraph Engine ─────────────────► SelectionMap
      │                                (frontend, backend, database, orm, auth, ui, state, deployment)
      ▼
Module Registry.resolve(selections) ──► ModuleInstance[]
      │
      ▼
Dependency Resolver ─────────────────► ResolutionResult
      │    resolveModules(selectedIds, registry)
      │    ① validate all IDs exist
      │    ② enforce lifecycle status (removed=error, deprecated/experimental=warning)
      │    ③ build CapabilityMap from `provides` tokens
      │    ④ transitively expand `requires` (capability → auto-inject provider)
      │    ⑤ conflict check across resolved set
      │    ⑥ compatibleWith matrix advisory warnings
      │    ⑦ topological sort via Kahn's algorithm
      │
      ▼
Composition Planner ─────────────────► CompositionPlan
      │    Merges: file trees, configPatches, dependencies
      │    ORM Service.buildSchemaFiles() ──► schema FileEntries injected here
      │
      ▼
Execution Pipeline ──────────────────► ExecutionPipelineResult
      │    runExecutionPipeline(plan, options)
      │
      ├─ ① beforeWrite hooks
      ├─ ② FileTransaction.open() → stage all files → commit()  [atomic]
      ├─ ③ applyAllPatches()  (config merges)
      ├─ ④ beforeInstall hooks
      ├─ ⑤ writeDepsToPackageJson() + installDependencies()     [node + python concurrent]
      ├─ ⑥ afterInstall hooks
      ├─ ⑦ afterWrite hooks
      ├─ ⑧ onFinalize hooks  → print post-install instructions
      └─ ⑨ writeProjectState()  → .foundation/project.lock + foundation.config.json

      On any failure:
      └─ onRollback hooks (best-effort, errors swallowed) → re-throw original error
```

---

## Dependency resolver in detail

The resolver (`core/src/dependency-resolver/resolver.ts`) works with **capability tokens**, not direct module IDs. This decouples feature modules from each other.

A module declares:
- `provides: ["orm:client", "orm:migrations"]` — what it can satisfy
- `requires: ["database"]` — what it needs (can be a token or a category name)

Resolution steps (implemented in `resolveModules()`):

1. All explicitly selected IDs are validated against the registry.
2. Lifecycle status is enforced: `removed` → hard error with migration URL; `deprecated` / `experimental` → stderr warning.
3. A `CapabilityMap` is built from the `provides` arrays of all resolved modules.
4. `requires` entries are expanded transitively: if a token matches a resolved capability, it is skipped; if it is a known module ID, it is queued; otherwise the registry is searched for a provider (by category first, then by `provides` list). Unresolvable tokens throw `MissingRequiredModuleError`.
5. The resolved set is checked for conflicts (`compatibility.conflicts`).
6. The `compatibleWith` matrix is checked — advisory warnings only, no errors.
7. The `DependencyGraph` is topologically sorted via Kahn's algorithm.

Auto-injected modules (step 4) are reported back to the CLI as `result.added` so the user can see what was pulled in automatically.

---

## FileTransaction — atomic writes

`FileTransaction` (`core/src/file-transaction.ts`) ensures no partial scaffolds reach disk.

**Lifecycle:**
```
new FileTransaction({ projectRoot, stagingDir? })  → state: "idle"
.open()                                             → state: "open"   (creates staging dir in os.tmpdir())
.stage(relativePath, content) × N                  →  writes to staging dir; snapshots existing file for rollback
.commit()                                           → state: "committed"  (atomic rename per file)
.rollback()                                         → state: "rolled-back" (restores snapshots; deletes new files)
```

Path traversal is prevented by `safeResolve()` in `core/src/path-utils.ts` — any path that would escape `projectRoot` throws immediately.

---

## ORM Service

`ORMService` (`core/src/orm/orm-service.ts`) is the portable model layer. It has four responsibilities:

1. **Provider registration** — ORM modules call `registerProvider()` in their `onRegister` hook. Only one provider may be active at a time; a second registration throws `ORMProviderAlreadyRegisteredError`.

2. **Model registration** — Any module (auth, feature modules, etc.) calls `registerModel()` with an `ORMModelDefinition`. The model is stored in an ordered map keyed by `model.id`.

3. **Schema file generation** — `buildSchemaFiles()` is called by the composition planner. It delegates to the active `ORMProvider` which translates all registered `ORMModelDefinition[]` (including `ORMRelationDefinition`) into provider-specific `FileEntry[]`.

4. **Seed registration** — Modules call `registerSeed()` to declare seed functions. `foundation db seed` invokes them via `runSeeds()`.

The four ORM providers and their translation targets:

| Provider | Model output | Relation syntax |
|----------|-------------|----------------|
| Prisma | `schema.prisma` model blocks | `@relation(...)` |
| TypeORM | `*.entity.ts` with decorators | `@ManyToOne(() => Target)` |
| Mongoose | `*.model.ts` Schema objects | `{ type: ObjectId, ref: "Target" }` |
| SQLAlchemy | `*.py` mapped classes | `relationship("Target")` |

---

## Execution pipeline hooks

All 14 hooks defined in `PluginHooks` (`plugin-sdk/src/types.ts`):

| Hook | Stage | Notes |
|------|-------|-------|
| `onRegister` | Registry load | ORM providers register here; abort by throwing |
| `onBeforeCompose` | Before template render | Inject dynamic template variables |
| `onAfterTemplate` | After render, before merge | Post-process rendered file content |
| `onMerge` | During config merge | Custom merge logic for non-standard file types |
| `onAfterCompose` | After all files staged | Cross-module wiring |
| `beforeWrite` | Before `FileTransaction.commit()` | |
| `afterWrite` | After `FileTransaction.commit()` | |
| `beforeInstall` | Before package manager runs | Modify install plan |
| `afterInstall` | After package manager completes | Run post-install scripts (e.g. `prisma generate`) |
| `onFinalize` | After full success | Print post-install instructions |
| `onRollback` | On any failure | Clean up side-effects; errors are swallowed |
| `onGenerate` | Before generator writes files | Extend generated output |
| `onStart` | When `foundation dev` runs | Dev-time setup |
| `onBuild` | When `foundation build` runs | Build-time steps |

Third-party plugin hooks execute in a sandboxed context (`core/src/sandbox/plugin-sandbox.ts`). Sandboxed hooks cannot access arbitrary filesystem paths outside `projectRoot` (enforced by `safeResolve`).

---

## Config merge strategies

`applyAllPatches()` (`core/src/execution/config-merger.ts`) selects the merge strategy based on filename:

| File pattern | Strategy |
|-------------|---------|
| `package.json` | Deep merge — `scripts`, `dependencies`, `devDependencies` are all merged |
| `tsconfig.json` | Deep merge |
| `.env` / `.env.example` | Key deduplication — later module wins on key conflict |
| `requirements.txt` | Semver intersection — takes the most restrictive constraint |
| `docker-compose.yml` | Service-level merge — services are merged by name |
| All other files | Last-write-wins |

---

## PromptGraph Engine

The prompt layer (`cli/src/prompt/`) is a **DAG of prompt nodes**. Each node has:
- A `when` predicate (receives the current `SelectionMap`) — the question is skipped if `when` returns false.
- An `onAnswer` hook — can inject defaults for downstream nodes (this powers the archetype system).

The graph is defined statically in `graph-definition.ts`. Archetypes pre-fill `SelectionMap` entries before the graph runs, so only questions the user hasn't pre-answered are shown.

---

## State files

After a successful `foundation create` or `foundation add`, two files are written to `.foundation/`:

**`project.lock`** — exact module versions, plugin versions, and CLI version. Read by `foundation upgrade`, `foundation switch`, `foundation info`, and `foundation doctor`. Never edited by hand.

**`foundation.config.json`** — user selections and list of installed plugins. Read by `foundation add`, `foundation switch`, `foundation generate`, and `foundation eject`.

---

## Error types

All errors extend `FoundationError` (`core/src/errors.ts`) and carry a stable `code` string (e.g. `ERR_ORM_PROVIDER_NOT_FOUND`) for programmatic handling:

| Error | Code |
|-------|------|
| `ModuleNotFoundError` | `ERR_MODULE_NOT_FOUND` |
| `ModuleConflictError` | `ERR_MODULE_CONFLICT` |
| `MissingRequiredModuleError` | `ERR_MISSING_REQUIRED_MODULE` |
| `ORMProviderAlreadyRegisteredError` | `ERR_ORM_PROVIDER_ALREADY_REGISTERED` |
| `ORMProviderNotFoundError` | `ERR_ORM_PROVIDER_NOT_FOUND` |
| `TransactionStateError` | `ERR_TRANSACTION_STATE` |
| `TransactionCommitError` | `ERR_TRANSACTION_COMMIT` |
| `TransactionRollbackError` | `ERR_TRANSACTION_ROLLBACK` |

---

## CI mode

The pipeline auto-detects CI environments (`core/src/execution/pipeline.ts → detectCiMode()`):

```
explicit ciMode option → CI=true/1 env var → NO_TTY=true/1 env var → !process.stdout.isTTY
```

In CI mode, interactive prompts are skipped. Pass `--preset <archetype>` to `foundation create` for fully non-interactive scaffolding.

---

## Adding a new module

1. Create `packages/modules/src/<category>/<name>.ts` — copy an existing module as a starting point.
2. Export a `PluginDefinition` with a unique `id` and correct `category`.
3. Add the export to `packages/modules/src/index.ts`.
4. Register it in `BUILTIN_MODULES` in `packages/modules/src/registry-loader.ts`.
5. Add the selection → module ID mapping to `SELECTION_TO_MODULE_ID`.
6. Add a prompt choice to `packages/cli/src/prompt/graph-definition.ts`.

For ORM modules, additionally:
- Implement `ORMProvider.buildSchemaFiles()` including all four relation types.
- Register the provider in the `onRegister` hook via `registerProviderFromContext()`.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full checklist.