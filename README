# Foundation CLI

> **A modular project composition engine. Not a template copier.**

```bash
npx create-foundation-app
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
npx create-foundation-app

# Or install globally for repeated use
npm install -g @foundation-cli/cli
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

[ ... Backend, Database, Auth, UI, Deployment ... ]

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
│  cp .env.example .env                             │
│  docker-compose up -d                             │
│  npm run dev                                      │
└───────────────────────────────────────────────────┘
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

## Commands

```bash
# Create a new project (interactive)
foundation create [project-name]

# Create with an archetype preset (non-interactive)
foundation create my-app --preset saas

# Install an add-on plugin into an existing Foundation project
foundation add stripe
foundation add redis
foundation add openai

# Search the plugin registry
foundation search <query>

# Copy module files into your project for full customisation
foundation eject [module-id]

# Upgrade modules using the project lockfile
foundation upgrade

# Scaffold a new plugin with SDK setup
foundation create-plugin

# Validate your project's foundation.config.json and lock file
foundation validate
```

---

## Monorepo Structure

```
foundation-cli/                         ← pnpm workspace root
│
├── packages/
│   ├── cli/                            ← @foundation-cli/cli
│   │   └── src/
│   │       ├── bin.ts                  ← executable entry point
│   │       ├── commands/               ← create, add, eject, search, upgrade, validate
│   │       ├── prompt/                 ← PromptGraph engine, archetypes, question DAG
│   │       ├── generator/              ← orchestrates core pipeline
│   │       ├── conflict-resolver.ts
│   │       └── ui/renderer.ts          ← terminal output (Chalk, Ora)
│   │
│   ├── core/                           ← @foundation-cli/core  (no CLI deps)
│   │   └── src/
│   │       ├── composition/            ← CompositionPlanner
│   │       ├── dependency-resolver/    ← graph.ts, resolver.ts
│   │       ├── execution/              ← pipeline, hook-runner, config-merger,
│   │       │                               dependency-installer, project-writer
│   │       ├── file-merger/            ← json-merge.ts, requirements-merge.ts
│   │       ├── file-transaction.ts     ← atomic stage → commit / rollback
│   │       ├── installer/              ← npm / pip detection + install
│   │       ├── manifest-validator/     ← AJV JSON Schema validation
│   │       ├── module-registry/        ← registry, loader, dynamic discovery
│   │       ├── plugin-installer/       ← npm-fetcher, plugin-installer
│   │       ├── registry-search/        ← npm registry search
│   │       ├── sandbox/                ← plugin-sandbox, safe-path
│   │       ├── state/                  ← lockfile, project-state
│   │       ├── templating/render.ts    ← EJS template engine
│   │       ├── path-utils.ts
│   │       ├── errors.ts
│   │       └── types.ts
│   │
│   ├── modules/                        ← @foundation-cli/modules  (all built-in modules)
│   │   └── src/
│   │       ├── frontend/               ← nextjs, react-vite, vue, svelte
│   │       ├── backend/                ← express, nestjs, fastapi, django
│   │       ├── database/               ← postgresql, mysql, mongodb, sqlite, supabase
│   │       ├── auth/                   ← jwt, oauth, session, clerk, auth0
│   │       ├── ui/                     ← tailwind, shadcn, mui, chakra, bootstrap
│   │       ├── state/                  ← zustand, redux, tanstack-query
│   │       ├── deployment/             ← docker, vercel, render, aws
│   │       ├── addon/                  ← stripe, redis, openai (official plugins)
│   │       ├── index.ts                ← all module exports
│   │       └── registry-loader.ts      ← static + dynamic module registration
│   │
│   ├── plugin-sdk/                     ← @foundation-cli/plugin-sdk
│   │   └── src/
│   │       ├── types.ts                ← PluginDefinition, ModuleManifest, hooks
│   │       ├── schema.ts               ← JSON Schema for manifest validation
│   │       └── validate.ts             ← validateManifest()
│   │
│   └── testing/                        ← @foundation-cli/testing
│       └── src/
│           ├── fixtures.ts             ← mock manifests, mock file trees
│           └── index.ts                ← scaffold harness, snapshot utils
│
├── pnpm-workspace.yaml
└── turbo.json                          ← Turborepo task graph
```

---

## Architecture

Foundation CLI is built around five subsystems that communicate through typed interfaces. No subsystem writes directly to disk — all file operations go through the `FileTransaction` model.

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
      │
      ├──► Template Engine ──► RenderedFiles  (EJS)
      │
      └──► Merge Engine ──► MergedConfigs
                │
                ▼
         FileTransaction.stage(files)
                │
                ▼  (all hooks passed? post-validate?)
         FileTransaction.commit() ──► Output Directory
                │
                ▼
         Installer ──► npm install / pip install
                │
                ▼
         CLI Output: Summary Screen
```

### Key Subsystems

**PromptGraph Engine** — A directed acyclic graph of prompt nodes. Questions only appear when their `when` predicate is satisfied (e.g., the "UI framework" question is hidden if `frontend = none`). Each node can inject defaults into downstream nodes via `onAnswer` hooks, which powers the archetype system.

**Dependency Resolver** — Resolves the full module graph using capability tokens, not module names directly. Detects conflicts (two auth modules), performs topological sort via Kahn's algorithm, and builds separate package install trees per runtime (Node.js vs Python). Hard conflicts block generation; advisory conflicts show warnings.

**Composition Engine** — Executes modules in dependency-safe order. For each module it calls the Template Engine, feeds results to the Merge Engine, and runs lifecycle hooks at each stage.

**File Merge Engine** — Type-aware merging per file format: deep merge for `package.json` and `tsconfig.json`, key-deduplication for `.env`, semver intersection for `requirements.txt`, and service-merge for `docker-compose.yml`. Conflicts that can't be auto-resolved are escalated as structured errors.

**FileTransaction** — Atomic file operations. All writes are staged to a temp directory. On any failure the temp dir is deleted and the output directory is left untouched. No partial scaffolds.

---

## Module Manifest Contract

Every module — first-party or third-party plugin — must conform to this schema. Non-conforming modules are rejected at registry load time by the AJV validator.

```typescript
interface ModuleManifest {
  id:          string;            // kebab-case, unique
  name:        string;            // display name
  version:     string;            // semver
  category:    "frontend" | "backend" | "database" | "auth"
               | "ui" | "state" | "deployment" | "addon";
  description: string;
  dependencies: PackageDependency[];   // npm / pip packages
  files:        FileEntry[];           // content to write
  configPatches: ConfigPatch[];        // package.json, tsconfig, .env merges
  compatibility: {
    conflicts: string[];               // module IDs that cannot coexist
  };
}
```

Modules may also export lifecycle hooks:

| Hook | When | Can Abort? |
|------|------|-----------|
| `onRegister` | Registry load time | Yes |
| `onBeforeCompose` | Before template render | Yes |
| `onAfterTemplate` | After render, before merge | No |
| `onAfterCompose` | After all files staged | Yes |
| `onBeforeInstall` | Before package manager | Yes |
| `onAfterInstall` | After install completes | No |
| `onFinalize` | After full success | No |
| `onRollback` | On any failure | No |

---

## Plugin System

Foundation CLI is designed to grow through community plugins. A plugin is just a module published to npm with the `foundation-plugin` keyword — there is no second-class API.

### Install a Plugin

```bash
foundation add stripe
foundation add redis
foundation add openai
```

### Build a Plugin

```bash
# Scaffold a new plugin with full SDK setup
foundation create-plugin my-plugin-name
```

A plugin package looks like:

```
foundation-plugin-stripe/
├── manifest.json        ← validated against ModuleManifest schema
├── hooks.mjs            ← lifecycle hooks (sandboxed execution)
├── files/               ← EJS template files
├── patches/             ← config patch files
└── package.json         ← must include 'foundation-plugin' keyword
```

Plugins use `@foundation-cli/plugin-sdk` for full TypeScript types, manifest validation, and a test harness that lets you develop against a mock context without a full CLI install.

### Plugin Trust Tiers

| Tier | Requirements | Benefit |
|------|-------------|---------|
| Community | Published to npm with `foundation-plugin` keyword | Full plugin API |
| Verified | Passed security audit; pinned manifest hash | Shown first in `foundation search` |
| Official | Maintained by Foundation CLI org | Extended API surface; bundled with CLI |

---

## Generated Project Quality

Every generated project is held to these standards before the CLI exits with success:

- TypeScript compiles with `tsc --noEmit` (zero errors)
- Python files pass `mypy` where applicable
- `.env.example` is populated with all required environment keys
- `package.json` scripts are fully wired (`dev`, `build`, `start`)
- `docker-compose.yml` is valid when Docker is selected
- Initial SQL migration is included for all SQL databases
- No broken imports, no missing peer dependencies

---

## Testing

```bash
# Run all tests across the monorepo
pnpm turbo test

# Run tests for a specific package
cd packages/core && pnpm test
cd packages/modules && pnpm test
cd packages/cli && pnpm test
```

The test strategy covers:

- **Unit tests** (Vitest) — resolver, merger strategies, manifest validation, transaction model
- **Integration tests** — compose 2–5 modules and validate output file structure
- **Snapshot tests** — generated file content for all 20+ known-good combinations
- **Compilation tests** — generated TypeScript/Python compiles with zero errors
- **Regression tests** — known-conflict combinations produce correct error messages

---

## Development

### Prerequisites

- Node.js ≥ 20
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

# Run the CLI locally
node packages/cli/dist/bin.js create
```

### Adding a New Module

1. Create `packages/modules/src/<category>/<name>.ts` following an existing module as a template
2. Export a `PluginDefinition` with a unique `id`, `category`, and all required manifest fields
3. Add the export to `packages/modules/src/index.ts`
4. Add the import + entry to `BUILTIN_MODULES` in `packages/modules/src/registry-loader.ts`
5. Add the selection → module ID mapping to `SELECTION_TO_MODULE_ID`
6. Add a choice entry to the appropriate array in `packages/cli/src/prompt/graph-definition.ts`

---

## Configuration Files

### `.foundation/project.lock`

Generated in every scaffolded project. Records exact module versions, plugin versions, and CLI version used. `foundation upgrade` reads this file to compute a safe upgrade path.

### `.foundation/foundation.config.json`

Stores user choices and installed plugins for an existing Foundation project. Used by `foundation add` and `foundation eject`.

---

## Roadmap

| Phase | Status | Highlights |
|-------|--------|-----------|
| Phase 0 — Skeleton | ✅ Done | Monorepo, all TypeScript interfaces, FileTransaction, CI |
| Phase 1 — MVP | ✅ Done | PromptGraph, DependencyResolver, TemplateEngine, MergeEngine, 6 core modules |
| Phase 2 — Full Coverage | ✅ Done | All 28 built-in modules, 7 categories, state management |
| Phase 3 — Plugin Ecosystem | 🔄 In Progress | `foundation add`, plugin sandbox, `project.lock`, 3 official plugins |
| Phase 4 — Scale | 🗓 Planned | Blueprint system, `foundation eject`, AI suggestion mode (`--idea`), web GUI |

### Phase 4 Targets
- `foundation save-blueprint` / `foundation use-blueprint` — save and share project configurations
- `foundation create --idea "AI CRM for gyms"` — AI-powered architecture suggestion
- Monorepo output mode (Turborepo/Nx workspace)
- Verified plugin program
- Web configuration UI at foundation.build

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