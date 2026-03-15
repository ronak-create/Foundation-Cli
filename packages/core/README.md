# @systemlabs/foundation-core

> The engine powering Foundation CLI — dependency resolution, composition planning, file transactions, ORM service, and code generation.

This package is the **internal runtime** of Foundation CLI. You do not use it directly to scaffold projects — use [`@systemlabs/foundation-cli`](https://www.npmjs.com/package/@systemlabs/foundation-cli) for that. Import `foundation-core` if you are building tooling on top of the Foundation engine, writing custom runners, or embedding the composition pipeline in another application.

```bash
npm install @systemlabs/foundation-core
```

---

## What's in this package

| Subsystem | What it does |
|-----------|-------------|
| **Dependency Resolver** | Builds a DAG of selected modules, detects conflicts, auto-injects missing capability providers, topologically sorts via Kahn's algorithm |
| **Composition Planner** | Merges file trees, resolves config patches, and produces an ordered execution plan before any file is touched |
| **Execution Pipeline** | Runs the 14 lifecycle hooks, delegates to the template engine, config merger, and dependency installer |
| **ORM Service** (`registry.orm`) | Portable model layer — stores the active `ORMProvider`, translates `ORMModelDefinition[]` into provider-specific `FileEntry[]`, manages seeds |
| **Generator Service** (`registry.generators`) | Registry of code generators; modules register generators in `onRegister`; `foundation generate` invokes them |
| **File Merge Engine** | Type-aware merging: deep merge for `package.json`/`tsconfig.json`, key-dedup for `.env`, semver intersection for `requirements.txt`, service-merge for `docker-compose.yml` |
| **FileTransaction** | Atomic file operations — all writes are staged to a temp directory; on any failure the temp dir is deleted and the output directory is left untouched |
| **Template Engine** | EJS-based renderer; modules supply `.ejs` template files that are rendered with per-module context variables |
| **Plugin Installer** | Fetches third-party plugins from npm, validates their manifest, and registers them into the module registry |
| **Sandbox** | Executes third-party plugin hooks in an isolated context |
| **State / Lockfile** | Reads and writes `.foundation/project.lock` and `.foundation/foundation.config.json` |

---

## Dependency resolution

The resolver works with **capability tokens** rather than direct module IDs. A module declares what it `provides` (e.g. `"orm:client"`) and what it `requires` (e.g. `"database:connection"`). This allows the engine to detect missing providers, suggest alternatives, and wire modules together without hard-coded pairings.

```typescript
import { DependencyResolver } from '@systemlabs/foundation-core';

const resolver = new DependencyResolver(registry);
const result = resolver.resolve(selections);

if (result.type === 'conflict') {
  // result.conflicts — array of ConflictReport
} else {
  // result.plan — topologically sorted ModuleInstance[]
}
```

---

## FileTransaction — atomic writes

No subsystem writes directly to disk. All file operations go through `FileTransaction`:

```typescript
import { FileTransaction } from '@systemlabs/foundation-core';

const tx = new FileTransaction('/output/my-app');

tx.stage([
  { path: 'src/index.ts', content: '...' },
  { path: 'package.json', content: '...' },
]);

try {
  await tx.commit();      // moves staged files to output dir atomically
} catch (e) {
  await tx.rollback();    // deletes temp dir, output dir is untouched
}
```

---

## ORM Service

The ORM layer uses a **provider-agnostic model format**. Feature modules declare models using `ORMModelDefinition`; the active ORM provider translates them to provider-specific output.

```typescript
// Any module's onRegister hook can register a model
registry.orm.registerModel({
  id:   'auth.Session',
  name: 'Session',
  fields: [
    { name: 'id',        type: 'uuid',   primaryKey: true, generated: true },
    { name: 'token',     type: 'string', required: true,   unique: true },
    { name: 'expiresAt', type: 'date',   required: true },
  ],
  relations: [
    { name: 'user', type: 'many-to-one', target: 'User' },
  ],
}, 'auth-jwt');

// The active provider translates this into:
// Prisma    → model Session { ... @relation(...) } in schema.prisma
// TypeORM   → Session.entity.ts with @ManyToOne(() => User)
// Mongoose  → Session.model.ts with userId: { type: ObjectId, ref: 'User' }
// SQLAlchemy → session.py with user = relationship("User")
```

Modules can also register seed functions:

```typescript
registry.orm.registerSeed({
  id: 'auth.adminUser',
  run: async (db) => {
    await db.create('User', { email: 'admin@example.com' });
  },
}, 'auth-jwt');
```

---

## Config merging

The file merge engine is type-aware. It applies different strategies based on the file type:

| File | Strategy |
|------|---------|
| `package.json` | Deep merge — scripts, dependencies, devDependencies are all merged |
| `tsconfig.json` | Deep merge |
| `.env` / `.env.example` | Key deduplication — later module wins on conflicts |
| `requirements.txt` | Semver intersection — takes the most restrictive constraint |
| `docker-compose.yml` | Service-level merge — services are merged by name |
| Everything else | Last-write-wins |

---

## Execution pipeline hooks

The pipeline calls 14 hooks in order. Each hook receives a `HookContext` with access to the registry, logger, and staged file list:

```
onRegister → onBeforeCompose → onAfterTemplate → onMerge →
onAfterCompose → beforeWrite → [FileTransaction.commit()] →
afterWrite → beforeInstall → [npm/pip install] → afterInstall →
onFinalize
```

On failure: `onRollback` is called for each registered module in reverse order.

---

## Part of the Foundation CLI ecosystem

| Package | Description |
|---------|-------------|
| [`@systemlabs/foundation-cli`](https://www.npmjs.com/package/@systemlabs/foundation-cli) | User-facing CLI — `foundation create`, `add`, `generate`, etc. |
| **`@systemlabs/foundation-core`** | ← **you are here** — engine, resolver, planner, ORM service |
| [`@systemlabs/foundation-modules`](https://www.npmjs.com/package/@systemlabs/foundation-modules) | All built-in modules (frontend, backend, database, auth, …) |
| [`@systemlabs/foundation-plugin-sdk`](https://www.npmjs.com/package/@systemlabs/foundation-plugin-sdk) | Plugin contract, types, manifest schema |
| [`@systemlabs/foundation-testing`](https://www.npmjs.com/package/@systemlabs/foundation-testing) | Test utilities for module and plugin authors |

---

## License

MIT — see [LICENSE](https://github.com/ronak-create/Foundation-Cli/blob/main/LICENSE)