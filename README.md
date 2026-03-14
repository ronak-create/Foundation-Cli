# Foundation CLI

> **A modular project composition engine with a plugin ecosystem.**

```bash
npx @systemlabs/foundation-cli create .
```

A senior developer should be able to go from zero to a running, linted, type-checked, database-connected app with auth in under 3 minutes — no manual config editing, no missing dependencies, no broken imports.

---

## What Is This?

Foundation CLI is a **dependency-aware project assembler**. You describe your intent — *"I want a SaaS with Next.js, Express, PostgreSQL, and JWT auth"* — and the engine resolves the full dependency graph, merges configurations without conflicts, injects integration code, and produces a working project.

**It is NOT:**
- A static template copier (like `create-next-app` or `degit`)
- A code scaffolding tool (like Yeoman or Hygen)
- A monorepo manager (like Nx or Turborepo) — though it can generate one
- A deployment tool — it generates deployment config, not deploy artifacts

---

## Quick Start

```bash
# One-shot bootstrap (no prior install needed)
npx @systemlabs/foundation-cli

# Or install globally for repeated use
npm install -g @systemlabs/foundation-cli
foundation create my-app
```

### Example Session

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  FOUNDATION CLI  ·  Build your architecture in minutes
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

? Project name › my-saas-app

? What are you building?
❯ SaaS Application       ← loads smart defaults
  AI Application
  E-commerce
  API Backend
  Internal Tool
  Custom (configure everything)

? Frontend framework
❯ Next.js                ← pre-selected from SaaS defaults
  React + Vite
  Vue 3
  Svelte
  None

[ ... Backend, Database, ORM, Auth, UI, Deployment ... ]

┌─ Review & Confirm ────────────────────────────────┐
│  ✔ Frontend:    Next.js                           │
│  ✔ Backend:     Express                           │
│  ✔ Database:    PostgreSQL                        │
│  ✔ Auth:        JWT                               │
│  ✔ UI:          Tailwind CSS                      │
│  ✔ State:       None                              │
│  ✔ Deployment:  Docker                            │
└───────────────────────────────────────────────────┘

? Confirm and generate? › Yes

⠸ Resolving dependencies...
⠸ Rendering templates...
⠸ Merging configurations...
✔ Files staged (47 files)
⠸ Installing packages... [████████░░] 68%

┌─ Success ─────────────────────────────────────────┐
│  🎉 my-saas-app is ready.                         │
│                                                   │
│  cd my-saas-app                                   │
│  npm run dev                                      │
└───────────────────────────────────────────────────┘
```

---

## Commands

```bash
# Create a new project (interactive)
foundation create [project-name]
foundation new [project-name]           # alias for create

# Create with an archetype preset (non-interactive / CI mode)
foundation create my-app --preset saas

# ── Module management ──────────────────────────────────────────────────────────

# Add a built-in module or third-party plugin to an existing project
foundation add orm-prisma               # built-in module by short name
foundation add auth-jwt                 # built-in module
foundation add stripe                   # official add-on plugin
foundation add foundation-plugin-redis  # community plugin from npm

# Switch a category to a different module (safely re-composes project)
foundation switch orm prisma
foundation switch backend nestjs
foundation switch database mongodb

# Search the plugin registry on npm
foundation search <query>

# ── Code generation ────────────────────────────────────────────────────────────

# Generate an ORM model with interactive field prompts
foundation generate model Post

# Generate a full CRUD scaffold (model + service + controller + routes)
foundation generate crud Post

# List all available generators
foundation generate --list

# ── Project inspection ─────────────────────────────────────────────────────────

# Show project info: stack, modules, ORM provider, plugins
foundation info

# Run health checks: Node version, env vars, module compatibility, ORM validity
foundation doctor

# Validate project.lock and foundation.config.json
foundation validate

# ── Dev automation ─────────────────────────────────────────────────────────────

# Start the development server (delegates to npm run dev)
foundation dev

# Run the test suite (delegates to npm run test)
foundation test

# Database operations — ORM-aware script delegation
foundation db migrate    # npm run db:migrate  /  alembic upgrade head
foundation db seed       # npm run db:seed
foundation db reset      # npm run db:reset
foundation db studio     # npm run db:studio   (Prisma only)
foundation db push       # npm run db:push     (Prisma only)

# ── Tooling ────────────────────────────────────────────────────────────────────

# Copy module files into your project for full customisation
foundation eject [module-id]

# Upgrade modules using the project lockfile
foundation upgrade [--dry-run]

# Scaffold a new plugin package with full SDK setup
foundation create-plugin [name]

# ── AI assistant (optional — requires API key) ─────────────────────────────────

# Describe your app in natural language; the CLI installs modules and generates
# models automatically. Requires ANTHROPIC_API_KEY or OPENAI_API_KEY.
foundation ai "create a blog system with comments and JWT auth"
```

---

## Available Modules

Every option below has a fully-implemented module that generates real, compile-ready files.

### Frontend
| Option | Module ID | Key Files Generated |
|--------|-----------|---------------------|
| Next.js | `frontend-nextjs` | App Router layout, page, globals.css, next.config.mjs |
| React + Vite | `frontend-react-vite` | index.html, main.tsx, App.tsx, vite.config.ts |
| Vue 3 | `frontend-vue` | App.vue, main.ts, vite.config.ts |
| Svelte | `frontend-svelte` | App.svelte, main.ts, svelte.config.js, vite.config.ts |

### Backend
| Option | Module ID | Key Files Generated |
|--------|-----------|---------------------|
| Express | `backend-express` | server.ts with CORS, Helmet, health endpoint |
| NestJS | `backend-nestjs` | AppModule, AppController, AppService, main.ts |
| FastAPI | `backend-fastapi` | app/main.py, requirements.txt, CORS middleware |
| Django | `backend-django` | settings.py, urls.py, DRF views, requirements.txt |

### Database
| Option | Module ID | Key Files Generated |
|--------|-----------|---------------------|
| PostgreSQL | `database-postgresql` | src/db/client.ts (node-postgres pool), 001_init.sql |
| MySQL | `database-mysql` | src/db/client.ts (mysql2 pool), 001_init.sql |
| MongoDB | `database-mongodb` | src/db/client.ts (native driver), 001_init.js |
| SQLite | `database-sqlite` | src/db/client.ts (better-sqlite3, WAL), 001_init.sql |
| Supabase | `database-supabase` | src/db/client.ts (anon + admin clients), init migration |

### ORM
| Option | Module ID | Key Files Generated |
|--------|-----------|---------------------|
| Prisma | `orm-prisma` | prisma/schema.prisma, src/lib/db.ts (PrismaClient) |
| TypeORM | `orm-typeorm` | src/data-source.ts, src/entities/User.entity.ts |
| Mongoose | `orm-mongoose` | src/lib/db.ts, src/models/User.model.ts |
| SQLAlchemy | `orm-sqlalchemy` | src/database.py, src/models.py, alembic.ini |

ORM modules integrate with `foundation generate model` and `foundation generate crud` — they translate portable model definitions into provider-specific schema files.

### Authentication
| Option | Module ID | Key Files Generated |
|--------|-----------|---------------------|
| JWT | `auth-jwt` | auth.service.ts, auth.middleware.ts, auth.router.ts |
| OAuth (Google + GitHub) | `auth-oauth` | oauth.config.ts, oauth.router.ts (Passport.js) |
| Session-based | `auth-session` | session.config.ts, session.middleware.ts, session.router.ts |
| Clerk | `auth-clerk` | clerk.middleware.ts, clerk.router.ts, AuthProvider.tsx |
| Auth0 | `auth-auth0` | auth0.config.ts, auth0.middleware.ts, AuthProvider.tsx |

### UI
| Option | Module ID | Key Files Generated |
|--------|-----------|---------------------|
| Tailwind CSS | `ui-tailwind` | tailwind.config.js, postcss.config.js, globals.css |
| ShadCN/UI | `ui-shadcn` | tailwind.config.ts with CSS variables, components.json, utils.ts |
| Material UI | `ui-mui` | theme.ts, MuiProvider.tsx with AppRouterCacheProvider |
| Chakra UI | `ui-chakra` | ChakraProvider.tsx with extended theme |
| Bootstrap | `ui-bootstrap` | layout.tsx with Bootstrap import, custom.scss |

### State Management
| Option | Module ID | Key Files Generated |
|--------|-----------|---------------------|
| Zustand | `state-zustand` | src/store/index.ts with devtools + persistence |
| Redux Toolkit | `state-redux` | store/index.ts, counterSlice.ts, ReduxProvider.tsx |
| TanStack Query | `state-tanstack-query` | query-client.ts, QueryProvider.tsx, example hooks |

### Deployment
| Option | Module ID | Key Files Generated |
|--------|-----------|---------------------|
| Docker | `deployment-docker` | Multi-stage Dockerfile, docker-compose.yml with Postgres |
| Vercel | `deployment-vercel` | vercel.json with CORS headers, .vercelignore |
| Render | `deployment-render` | render.yaml Blueprint with managed PostgreSQL |
| AWS | `deployment-aws` | ECS task definition, GitHub Actions CI/CD workflow |

### Official Add-on Plugins
| Plugin | Command | What It Adds |
|--------|---------|--------------|
| Stripe | `foundation add stripe` | Stripe client, webhook handler, env config |
| Redis | `foundation add redis` | Redis client with connection helpers |
| OpenAI | `foundation add openai` | OpenAI client with typed completions helper |

---

## Project Archetypes

Pick an archetype and every downstream question is pre-answered with battle-tested defaults. You can still change any selection.

| Archetype | Frontend | Backend | Database | Auth | UI | Deploy |
|-----------|----------|---------|----------|------|----|--------|
| **SaaS** | Next.js | Express | PostgreSQL | JWT | Tailwind | Docker |
| **AI App** | Next.js | Express | PostgreSQL | JWT | Tailwind | Docker |
| **E-commerce** | Next.js | Express | PostgreSQL | JWT | Tailwind | Docker |
| **API Backend** | None | Express | PostgreSQL | JWT | None | Docker |
| **Internal Tool** | Next.js | Express | PostgreSQL | JWT | Tailwind | None |
| **CRM** | Next.js | Express | PostgreSQL | JWT | Tailwind | Docker |
| **Dashboard** | Next.js | Express | PostgreSQL | JWT | Tailwind | Docker |

---

## Code Generation

Foundation CLI includes a built-in code generator that integrates with your active ORM.

```bash
# Interactively define fields and generate ORM schema files
foundation generate model Post

# Generate full CRUD: model + service + controller + routes
foundation generate crud Post

# List all available generators (including those from installed modules)
foundation generate --list
```

The generator prompts for field definitions interactively:

```
  Define fields for Post
────────────────────────────────────────────────────
  ℹ  "id" (uuid, primaryKey) added automatically

? Field name (empty to finish): title
? Type for "title": string  — text / varchar
? Is "title" required (non-nullable)? yes
? Is "title" unique? no
  ✔  Added: title (string)

? Field name (empty to finish):
  ℹ  "createdAt" and "updatedAt" (date, generated) added automatically
```

Generated files are ORM-aware:

| Active ORM | Model output | CRUD output |
|------------|-------------|-------------|
| Prisma | `prisma/schema.prisma` (model block appended) | `src/services/`, `src/controllers/`, `src/routes/` |
| TypeORM | `src/entities/Post.entity.ts` | Express or NestJS controllers |
| Mongoose | `src/models/Post.model.ts` | Express controllers |
| SQLAlchemy | `src/post.py` (mapped class) | FastAPI router + Pydantic schemas |

Relations between models are supported via `ORMRelationDefinition` — providers translate `many-to-one`, `one-to-many`, `one-to-one`, and `many-to-many` into provider-specific syntax.

---

## ORM Integration

The ORM layer uses a **portable model system** — feature modules declare models using a provider-agnostic format, and the active ORM provider generates the correct output.

```typescript
// Any module's onRegister hook can register a model
registry.orm.registerModel({
  id:     "auth.Session",
  name:   "Session",
  fields: [
    { name: "id",        type: "uuid",   primaryKey: true, generated: true },
    { name: "token",     type: "string", required: true, unique: true },
    { name: "expiresAt", type: "date",   required: true },
  ],
  relations: [
    { name: "user", type: "many-to-one", target: "User" },
  ],
}, "auth-jwt");
```

This model is then translated by the active provider into:
- **Prisma** → `model Session { ... @relation(...) }` block in `schema.prisma`
- **TypeORM** → `Session.entity.ts` with `@ManyToOne(() => User)` decorator
- **Mongoose** → `Session.model.ts` with `userId: { type: ObjectId, ref: "User" }`
- **SQLAlchemy** → `session.py` with `user = relationship("User")`

Modules can also register seed functions:

```typescript
registry.orm.registerSeed({
  id: "auth.adminUser",
  run: async (db) => {
    await db.create("User", { email: "admin@example.com" });
  },
}, "auth-jwt");

// Then run all seeds:
// foundation db seed
```

---

## Stack Switcher

Switch your active ORM, backend, or database without manually editing files:

```bash
foundation switch orm prisma        # switch from typeorm to prisma
foundation switch backend nestjs    # switch from express to nestjs
foundation switch database mongodb  # switch from postgresql to mongodb
```

The CLI validates compatibility (no conflicts with remaining modules), re-composes only the affected files, and updates `project.lock` and `foundation.config.json`.

---

## AI Assistant (Optional)

Describe your application in plain English and let the CLI install modules, generate models, and scaffold CRUD automatically.

```bash
# Requires ANTHROPIC_API_KEY or OPENAI_API_KEY in your environment
foundation ai "create a blog system with posts, comments, and JWT auth"
```

The CLI sends your prompt to the model with a system prompt that includes the full module catalogue. The model returns a structured plan:

```json
{
  "modules":  ["auth-jwt", "database-postgresql", "orm-prisma"],
  "models":   [{ "name": "Post", "fields": [...] }, { "name": "Comment", "fields": [...] }],
  "generate": ["Post", "Comment"]
}
```

The CLI then runs `foundation add` for each module, `foundation generate model` for each model definition, and `foundation generate crud` for each CRUD resource — in sequence.

**Setup:**

```bash
# Add to your shell profile or .env:
export ANTHROPIC_API_KEY=sk-ant-...
# or
export OPENAI_API_KEY=sk-...
```

If no API key is set, `foundation ai` prints a setup guide and exits cleanly — no error.

---

## Project Health

```bash
# Show project info: stack, modules, ORM provider, plugins
foundation info

# Run diagnostics: Node version, env vars, module compatibility, ORM validity
foundation doctor
```

`foundation doctor` output:

```
  Foundation Doctor
────────────────────────────────────────────────────
  ✔  Node.js version            v20.11.0 (≥ v18 required)
  ✔  Foundation project         .foundation/project.lock found
  ✔  project.lock               Valid
  ✔  foundation.config.json     Valid
  ✔  CLI version                v0.0.1
  ✔  Module registry            All 7 module(s) found
  ✔  Module compatibility       No conflicts detected
  ✔  Environment variables      All 9 key(s) present in .env
  ✔  ORM provider               Prisma (orm-prisma)
  9 passed
```

---

## Plugin System

Foundation CLI is designed to grow through community plugins. A plugin is a module published to npm with the `foundation-plugin` keyword.

### Install a Plugin

```bash
foundation add stripe
foundation add redis
foundation add openai
foundation add foundation-plugin-<name>   # any community plugin
```

`foundation add` resolves built-in module short names first (`auth-jwt`, `orm-prisma`, etc.) before hitting npm, so it works for both built-in modules and third-party plugins with the same command.

### Build a Plugin

```bash
foundation create-plugin my-plugin-name
```

A plugin package:

```
foundation-plugin-stripe/
├── manifest.json        ← validated against ModuleManifest schema
├── hooks.mjs            ← lifecycle hooks (sandboxed execution)
├── files/               ← EJS template files
├── patches/             ← config patch files
└── package.json         ← must include 'foundation-plugin' keyword
```

### Plugin Trust Tiers

| Tier | Requirements | Benefit |
|------|-------------|---------|
| Community | Published to npm with `foundation-plugin` keyword | Full plugin API |
| Verified | Passed security audit; pinned manifest hash | Shown first in `foundation search` |
| Official | Maintained by Foundation CLI org | Extended API surface; bundled with CLI |

---

## Module Manifest Contract

Every module — first-party or third-party plugin — must conform to this schema:

```typescript
interface ModuleManifest {
  id:          string;
  name:        string;
  version:     string;
  category:    "frontend" | "backend" | "database" | "orm" | "auth"
               | "ui" | "state" | "deployment" | "addon" | "generate"
               | "testing" | "tooling";
  description: string;
  runtime?:    "node" | "python" | "multi";
  provides?:   string[];            // capability tokens
  requires?:   string[];            // capability tokens this module needs
  dependencies: PackageDependency[];
  files:        FileEntry[];
  configPatches: ConfigPatch[];
  compatibility: {
    conflicts?:      string[];
    compatibleWith?: Record<string, string[]>;
    peerFrameworks?: Record<string, string>;
  };
}
```

Modules may export lifecycle hooks:

| Hook | When | Notes |
|------|------|-------|
| `onRegister` | Registry load time | ORM providers register here |
| `onBeforeCompose` | Before template render | Inject dynamic variables |
| `onAfterTemplate` | After render, before merge | Post-process rendered files |
| `onMerge` | During config merge | Custom merge logic |
| `onAfterCompose` | After all files staged | Cross-module wiring |
| `beforeWrite` | Before file-write transaction commits | — |
| `afterWrite` | After file-write transaction commits | — |
| `beforeInstall` | Before package manager runs | — |
| `afterInstall` | After package manager completes | Run post-install scripts |
| `onFinalize` | After full success | Print post-install instructions |
| `onRollback` | On any failure | Clean up side-effects |
| `onGenerate` | Before generator writes files | Extend generated output |
| `onStart` | When `foundation dev` is invoked | Dev-time setup |
| `onBuild` | When `foundation build` is invoked | Build-time steps |

---

## Architecture

Foundation CLI is built around six subsystems that communicate through typed interfaces. No subsystem writes directly to disk — all file operations go through the `FileTransaction` model.

### Data Flow

```
CLI Args + ENV
      │
      ▼
PromptGraph Engine ──► SelectionMap
      │
      ▼
Module Registry.resolve(selections) ──► ModuleInstance[]
      │
      ▼
Dependency Resolver ──► ResolvedPlan | ConflictReport
      │  (abort on unresolved conflicts)
      ▼
Composition Engine ──► ExecutionPlan (topological order)
      │        │
      │        └──► ORM Service ──► Schema FileEntries
      │                  (registry.orm.buildSchemaFiles())
      ├──► Template Engine ──► RenderedFiles  (EJS)
      │
      └──► Merge Engine ──► MergedConfigs
                │
                ▼
         FileTransaction.stage(files)
                │
                ▼
         FileTransaction.commit() ──► Output Directory
                │
                ▼
         Installer ──► npm install / pip install
                │
                ▼
         CLI Output: Summary Screen
```

### Key Subsystems

**PromptGraph Engine** — A DAG of prompt nodes. Questions only appear when their `when` predicate is satisfied. Each node can inject defaults via `onAnswer` hooks, powering the archetype system.

**Dependency Resolver** — Resolves the full module graph using capability tokens. Detects conflicts, performs topological sort via Kahn's algorithm, and auto-injects missing capability providers (with interactive selection prompts for alternatives).

**ORM Service** (`registry.orm`) — Portable model layer. Stores one active `ORMProvider` and an ordered model map. `buildSchemaFiles()` delegates to the provider which translates `ORMModelDefinition[]` (including relation definitions) into provider-specific `FileEntry[]`. Supports seed registration via `registerSeed()` / `runSeeds()`.

**Generator Service** (`registry.generators`) — Registry of code generators. Modules register generators in `onRegister`; `foundation generate <id>` invokes them. Built-in generators: `model` and `crud`.

**File Merge Engine** — Type-aware merging: deep merge for `package.json`/`tsconfig.json`, key-deduplication for `.env`, semver intersection for `requirements.txt`, service-merge for `docker-compose.yml`.

**FileTransaction** — Atomic file operations. All writes are staged to a temp directory. On any failure the temp dir is deleted and the output directory is left untouched. No partial scaffolds.

---

## Monorepo Structure

```
foundation-cli/
├── packages/
│   ├── cli/                            ← user-facing commands + prompts
│   │   └── src/
│   │       ├── commands/               ← create, new, add, switch, generate,
│   │       │                               info, doctor, dev, db, test,
│   │       │                               eject, upgrade, validate,
│   │       │                               search, plugins, create-plugin, ai
│   │       ├── prompt/                 ← PromptGraph engine, archetypes, DAG
│   │       ├── execution/env-writer.ts ← .env / .env.example merge writer
│   │       ├── conflict-resolver.ts    ← interactive version conflict resolution
│   │       └── ui/renderer.ts          ← terminal output (Chalk, Ora)
│   │
│   ├── core/                           ← engine (no CLI deps)
│   │   └── src/
│   │       ├── composition/            ← CompositionPlanner (ORM-aware)
│   │       ├── dependency-resolver/    ← graph.ts, resolver.ts
│   │       ├── execution/              ← pipeline, hook-runner (14 hooks),
│   │       │                               config-merger, dependency-installer
│   │       ├── generator/              ← GeneratorService, GeneratorDefinition
│   │       ├── orm/                    ← ORMService, providers, relations, seeder
│   │       ├── file-merger/            ← json-merge.ts, requirements-merge.ts
│   │       ├── file-transaction.ts     ← atomic stage → commit / rollback
│   │       ├── module-registry/        ← registry (orm + generators), loader
│   │       ├── plugin-installer/       ← npm-fetcher, plugin-installer
│   │       ├── sandbox/                ← sandboxed hook execution
│   │       ├── state/                  ← lockfile, project-state
│   │       └── templating/render.ts    ← EJS template engine
│   │
│   ├── modules/                        ← all built-in modules
│   │   └── src/
│   │       ├── frontend/               ← nextjs, react-vite, vue, svelte
│   │       ├── backend/                ← express, nestjs, fastapi, django
│   │       ├── database/               ← postgresql, mysql, mongodb, sqlite, supabase
│   │       ├── orm/                    ← prisma, typeorm, mongoose, sqlalchemy
│   │       ├── auth/                   ← jwt, oauth, session, clerk, auth0
│   │       ├── ui/                     ← tailwind, shadcn, mui, chakra, bootstrap
│   │       ├── state/                  ← zustand, redux, tanstack-query
│   │       ├── deployment/             ← docker, vercel, render, aws
│   │       └── addon/                  ← stripe, redis, openai
│   │
│   ├── plugin-sdk/                     ← public plugin contract (zero runtime deps)
│   │   └── src/
│   │       ├── types.ts                ← PluginDefinition, ModuleManifest, 14 hooks
│   │       ├── schema.ts               ← JSON Schema for manifest validation
│   │       └── validate.ts             ← validateManifest()
│   │
│   └── testing/                        ← shared test utilities
│       └── src/
│           ├── fixtures.ts             ← makeManifestFixture(), createTempDir()
│           └── index.ts
│
├── pnpm-workspace.yaml
└── turbo.json
```

---

## Development

### Prerequisites

- Node.js ≥ 18
- pnpm ≥ 9

### Setup

```bash
git clone https://github.com/your-org/foundation-cli
cd foundation-cli
pnpm install
pnpm turbo build
```

### Development Workflow

```bash
# Build all packages in dependency order (with caching)
pnpm turbo build

# Watch mode — rebuild on change
pnpm turbo dev

# Type-check all packages
pnpm turbo typecheck

# Run all tests
pnpm turbo test

# Run the CLI locally
node packages/cli/dist/bin.js create
```

### Build Order

Packages must build in this order (enforced by `turbo.json` `dependsOn: ["^build"]`):

```
plugin-sdk → core → modules → cli
```

### Adding a New Module

1. Create `packages/modules/src/<category>/<name>.ts` following an existing module
2. Export a `PluginDefinition` with a unique `id` and `category`
3. Add the export to `packages/modules/src/index.ts`
4. Add the import + entry to `BUILTIN_MODULES` in `packages/modules/src/registry-loader.ts`
5. Add the selection → module ID mapping to `SELECTION_TO_MODULE_ID`
6. Add a choice entry to `packages/cli/src/prompt/graph-definition.ts`

For ORM modules, also implement `ORMProvider.buildSchemaFiles()` including relation support, and register the provider in the `onRegister` hook via `registerProviderFromContext`.

---

## Testing

```bash
pnpm turbo test                  # all packages
cd packages/core && pnpm test    # core only
cd packages/modules && pnpm test
cd packages/cli && pnpm test
```

Test strategy:

- **Unit** (Vitest) — resolver, merger strategies, manifest validation, ORM service, generator service
- **Integration** — compose 2–5 modules, validate output file structure
- **Snapshot** — generated file content for known-good combinations
- **Compilation** — generated TypeScript/Python compiles with zero errors

---

## Configuration Files

### `.foundation/project.lock`

Records exact module versions, plugin versions, and CLI version. Read by `foundation upgrade`, `foundation switch`, `foundation info`, and `foundation doctor`.

### `.foundation/foundation.config.json`

Stores user selections and installed plugins. Read by `foundation add`, `foundation switch`, `foundation generate`, and `foundation eject`.

---

## Roadmap

| Phase | Status | Highlights |
|-------|--------|-----------|
| Phase 0 — Skeleton | ✅ Done | Monorepo, TypeScript interfaces, FileTransaction, CI |
| Phase 1 — Foundation Fixes | ✅ Done | ORMFieldType, build order, relation fields, ORM providers |
| Phase 2 — Observability | ✅ Done | `foundation info`, `foundation doctor` |
| Phase 3 — Dev Automation | ✅ Done | `foundation dev/db/test`, dependency-aware add, conflict detection, recommendations |
| Phase 4 — Code Generators | ✅ Done | GeneratorService, `foundation generate model/crud`, `onGenerate` hook |
| Phase 5 — ORM Extensions | ✅ Done | Relation fields (all 4 providers), SeederService |
| Phase 6 — Ecosystem | ✅ Done | `foundation switch`, built-in module short-name resolution |
| Phase 7 — AI Assistant | ✅ Done | `foundation ai` (opt-in, API key gated) |

---

## Tech Stack

| Purpose | Library | Notes |
|---------|---------|-------|
| Prompts | `@inquirer/prompts` | Interactive terminal prompts |
| Terminal color | `chalk` | Colored output |
| Spinners | `ora` | Progress indicators |
| Templating | `ejs` | File template rendering |
| JSON Schema | `ajv` | Manifest validation |
| YAML | `js-yaml` | docker-compose merge |
| Process execution | `execa` | Package manager invocation |
| Build | `tsup` | Zero-config TypeScript bundler |
| Tests | `vitest` | Unit + integration tests |
| Monorepo | `pnpm` + `turbo` | Workspace + cached builds |

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

*Foundation CLI — Designed for longevity. Built for scale.*