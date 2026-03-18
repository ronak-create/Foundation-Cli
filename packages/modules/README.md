# @systemlabs/foundation-modules

> All built-in modules for Foundation CLI — frontend frameworks, backends, databases, ORMs, auth, UI systems, state management, deployment targets, and official add-ons.

This package contains every first-party module that ships with Foundation CLI. Each module is a `PluginDefinition` that contributes files, config patches, and lifecycle hooks to the composition engine. You do not import this package directly — it is loaded automatically by [`@systemlabs/foundation-cli`](https://www.npmjs.com/package/@systemlabs/foundation-cli).

```bash
# Use Foundation CLI — it loads this package automatically
npx @systemlabs/foundation-cli create my-app
```

---

## Available modules

Every module below generates **real, compile-ready files** — not stubs or placeholder comments.

### Frontend

| Module ID | Option | Key files generated |
|-----------|--------|---------------------|
| `frontend-nextjs` | Next.js | App Router layout, page, globals.css, next.config.mjs |
| `frontend-react-vite` | React + Vite | index.html, main.tsx, App.tsx, vite.config.ts |
| `frontend-vue` | Vue 3 | App.vue, main.ts, vite.config.ts |
| `frontend-svelte` | Svelte | App.svelte, main.ts, svelte.config.js, vite.config.ts |

### Backend

| Module ID | Option | Key files generated |
|-----------|--------|---------------------|
| `backend-express` | Express | server.ts with CORS, Helmet, health endpoint |
| `backend-nestjs` | NestJS | AppModule, AppController, AppService, main.ts |
| `backend-fastapi` | FastAPI | app/main.py, requirements.txt, CORS middleware |
| `backend-django` | Django | settings.py, urls.py, DRF views, requirements.txt |

### Database

| Module ID | Option | Key files generated |
|-----------|--------|---------------------|
| `database-postgresql` | PostgreSQL | src/db/client.ts (node-postgres pool), 001_init.sql |
| `database-mysql` | MySQL | src/db/client.ts (mysql2 pool), 001_init.sql |
| `database-mongodb` | MongoDB | src/db/client.ts (native driver), 001_init.js |
| `database-sqlite` | SQLite | src/db/client.ts (better-sqlite3, WAL), 001_init.sql |
| `database-supabase` | Supabase | src/db/client.ts (anon + admin clients), init migration |

### ORM

| Module ID | Option | Key files generated |
|-----------|--------|---------------------|
| `orm-prisma` | Prisma | prisma/schema.prisma, src/lib/db.ts (PrismaClient) |
| `orm-typeorm` | TypeORM | src/data-source.ts, src/entities/User.entity.ts |
| `orm-mongoose` | Mongoose | src/lib/db.ts, src/models/User.model.ts |
| `orm-sqlalchemy` | SQLAlchemy | src/database.py, src/models.py, alembic.ini |

### Authentication

| Module ID | Option | Key files generated |
|-----------|--------|---------------------|
| `auth-jwt` | JWT | auth.service.ts, auth.middleware.ts, auth.router.ts |
| `auth-oauth` | OAuth (Google + GitHub) | oauth.config.ts, oauth.router.ts (Passport.js) |
| `auth-session` | Session-based | session.config.ts, session.middleware.ts, session.router.ts |
| `auth-clerk` | Clerk | clerk.middleware.ts, clerk.router.ts, AuthProvider.tsx |
| `auth-auth0` | Auth0 | auth0.config.ts, auth0.middleware.ts, AuthProvider.tsx |

### UI

| Module ID | Option | Key files generated |
|-----------|--------|---------------------|
| `ui-tailwind` | Tailwind CSS | tailwind.config.js, postcss.config.js, globals.css |
| `ui-shadcn` | ShadCN/UI | tailwind.config.ts with CSS variables, components.json, utils.ts |
| `ui-mui` | Material UI | theme.ts, MuiProvider.tsx with AppRouterCacheProvider |
| `ui-chakra` | Chakra UI | ChakraProvider.tsx with extended theme |
| `ui-bootstrap` | Bootstrap | layout.tsx with Bootstrap import, custom.scss |

### State management

| Module ID | Option | Key files generated |
|-----------|--------|---------------------|
| `state-zustand` | Zustand | src/store/index.ts with devtools + persistence |
| `state-redux` | Redux Toolkit | store/index.ts, counterSlice.ts, ReduxProvider.tsx |
| `state-tanstack-query` | TanStack Query | query-client.ts, QueryProvider.tsx, example hooks |

### Deployment

| Module ID | Option | Key files generated |
|-----------|--------|---------------------|
| `deployment-docker` | Docker | Multi-stage Dockerfile, docker-compose.yml with Postgres |
| `deployment-vercel` | Vercel | vercel.json with CORS headers, .vercelignore |
| `deployment-render` | Render | render.yaml Blueprint with managed PostgreSQL |
| `deployment-aws` | AWS ECS | ECS task definition, GitHub Actions CI/CD workflow |

### Official add-on plugins

| Plugin | Install command | What it adds |
|--------|----------------|--------------|
| Stripe | `foundation add stripe` | Stripe client singleton, webhook handler with event routing, type exports |
| Redis | `foundation add redis` | Redis client with connection helpers |
| OpenAI | `foundation add openai` | OpenAI client with typed completions helper |

---

## Project archetypes

Pick an archetype with `--preset` and every module is pre-selected with battle-tested defaults. You can still override any selection interactively.

| Archetype | Frontend | Backend | Database | Auth | UI | Deploy |
|-----------|----------|---------|----------|------|----|--------|
| `saas` | Next.js | Express | PostgreSQL | JWT | Tailwind | Docker |
| `ai-app` | Next.js | Express | PostgreSQL | JWT | Tailwind + TanStack Query | Docker |
| `ecommerce` | Next.js | Express | PostgreSQL | Session | ShadCN + Zustand | Docker |
| `api-backend` | None | Express | PostgreSQL | JWT | None | Docker |
| `internal-tool` | Next.js | Express | PostgreSQL | JWT | Tailwind | None |

```bash
foundation create my-app --preset saas
```

---

## Module contract

Every module in this package exports a `PluginDefinition` and conforms to the `ModuleManifest` schema defined in `@systemlabs/foundation-plugin-sdk`. Modules declare capability tokens via `provides` and `requires`, enabling the dependency resolver in `@systemlabs/foundation-core` to detect conflicts and wire modules together without hard-coded pairings.

ORM modules additionally implement `ORMProvider.buildSchemaFiles()`, which translates portable `ORMModelDefinition[]` objects (including relation definitions) into provider-specific `FileEntry[]`. This means any module in any category can register a model and have it rendered correctly regardless of which ORM the user selected.

---

## Adding a custom module

If you want to contribute a new built-in module, see [CONTRIBUTING.md](https://github.com/ronak-create/Foundation-Cli/blob/main/CONTRIBUTING.md) in the monorepo. For third-party plugins, use [`@systemlabs/foundation-plugin-sdk`](https://www.npmjs.com/package/@systemlabs/foundation-plugin-sdk) and publish to npm with the `foundation-plugin` keyword.

---

## Part of the Foundation CLI ecosystem

| Package | Description |
|---------|-------------|
| [`@systemlabs/foundation-cli`](https://www.npmjs.com/package/@systemlabs/foundation-cli) | User-facing CLI — `foundation create`, `add`, `generate`, etc. |
| [`@systemlabs/foundation-core`](https://www.npmjs.com/package/@systemlabs/foundation-core) | Engine: dependency resolver, composition planner, file transaction |
| **`@systemlabs/foundation-modules`** | ← **you are here** — all built-in modules |
| [`@systemlabs/foundation-plugin-sdk`](https://www.npmjs.com/package/@systemlabs/foundation-plugin-sdk) | Plugin contract, types, manifest schema |
| [`@systemlabs/foundation-testing`](https://www.npmjs.com/package/@systemlabs/foundation-testing) | Test utilities for module and plugin authors |

---

## License

MIT — see [LICENSE](https://github.com/ronak-create/Foundation-Cli/blob/main/LICENSE)