# Modules

Foundation CLI ships with 30+ built-in modules across 9 categories. Every module generates **real, compile-ready files** — not stubs or TODO comments. This document is the complete reference for every module, the files it generates, and how it integrates with the rest of the system.

---

## How modules work

A module is a `PluginDefinition` (`@systemlabs/foundation-plugin-sdk`) that declares:
- A unique `id` and `category`
- `files` — EJS templates rendered into the output project
- `configPatches` — deep-merge patches applied to `package.json`, `tsconfig.json`, `.env`, etc.
- `dependencies` — npm/pip packages to install
- `provides` / `requires` — capability tokens used by the dependency resolver
- `compatibility.conflicts` — module IDs that cannot coexist with this one
- `hooks` — up to 14 lifecycle hooks

The dependency resolver uses capability tokens rather than direct module IDs. When you select `orm-prisma`, it declares `provides: ["orm:client"]`. Any module that `requires: ["orm:client"]` will automatically get Prisma injected — even if the user didn't explicitly pick it.

---

## Frontend

### `frontend-nextjs`
**Next.js App Router**

| File | Description |
|------|-------------|
| `app/layout.tsx` | Root layout with metadata |
| `app/page.tsx` | Home page |
| `app/globals.css` | Base global styles |
| `next.config.mjs` | Next.js config |
| `tsconfig.json` | TypeScript config (patched via configPatch) |

Provides: `frontend`  
Compatible with: all backends, all UI modules

---

### `frontend-react-vite`
**React 18 + Vite**

| File | Description |
|------|-------------|
| `index.html` | Entry HTML |
| `src/main.tsx` | React root mount |
| `src/App.tsx` | Root component |
| `vite.config.ts` | Vite config with React plugin |

Provides: `frontend`

---

### `frontend-vue`
**Vue 3 + Vite**

| File | Description |
|------|-------------|
| `src/App.vue` | Root component |
| `src/main.ts` | Vue app mount |
| `vite.config.ts` | Vite config with Vue plugin |

Provides: `frontend`

---

### `frontend-svelte`
**Svelte + Vite**

| File | Description |
|------|-------------|
| `src/App.svelte` | Root component |
| `src/main.ts` | Mount script |
| `svelte.config.js` | Svelte config |
| `vite.config.ts` | Vite config with Svelte plugin |

Provides: `frontend`

---

## Backend

### `backend-express`
**Express with TypeScript**

| File | Description |
|------|-------------|
| `src/server.ts` | Express app with CORS, Helmet, JSON body parsing, and `/health` endpoint |

Provides: `backend`  
Installs: `express`, `cors`, `helmet`, `@types/express`, `@types/cors`

---

### `backend-nestjs`
**NestJS**

| File | Description |
|------|-------------|
| `src/app.module.ts` | Root module |
| `src/app.controller.ts` | Root controller with `/` route |
| `src/app.service.ts` | Root service |
| `src/main.ts` | Bootstrap with CORS |

Provides: `backend`  
Installs: `@nestjs/core`, `@nestjs/common`, `@nestjs/platform-express`, `reflect-metadata`, `rxjs`

---

### `backend-fastapi`
**FastAPI (Python)**

| File | Description |
|------|-------------|
| `app/main.py` | FastAPI app with CORS middleware and `/health` route |
| `requirements.txt` | Base Python dependencies |

Runtime: `python`  
Provides: `backend`

---

### `backend-django`
**Django + Django REST Framework**

| File | Description |
|------|-------------|
| `settings.py` | Django settings with DRF, CORS, database config |
| `urls.py` | URL configuration |
| `views.py` | DRF views |
| `requirements.txt` | Base Python dependencies |

Runtime: `python`  
Provides: `backend`

---

## Database

All database modules generate a typed client with connection pooling and an initial migration script.

### `database-postgresql`
| File | Description |
|------|-------------|
| `src/db/client.ts` | `node-postgres` pool with typed query helper |
| `migrations/001_init.sql` | Initial schema migration |

Provides: `database`  
Installs: `pg`, `@types/pg`

---

### `database-mysql`
| File | Description |
|------|-------------|
| `src/db/client.ts` | `mysql2` promise pool |
| `migrations/001_init.sql` | Initial schema migration |

Provides: `database`  
Installs: `mysql2`

---

### `database-mongodb`
| File | Description |
|------|-------------|
| `src/db/client.ts` | Native MongoDB driver with connection singleton |
| `migrations/001_init.js` | Index creation script |

Provides: `database`  
Installs: `mongodb`

---

### `database-sqlite`
| File | Description |
|------|-------------|
| `src/db/client.ts` | `better-sqlite3` client with WAL mode enabled |
| `migrations/001_init.sql` | Initial schema migration |

Provides: `database`  
Installs: `better-sqlite3`, `@types/better-sqlite3`

---

### `database-supabase`
| File | Description |
|------|-------------|
| `src/db/client.ts` | Supabase JS client with anon + service-role configs |
| `migrations/001_init.sql` | Initial migration for Supabase |

Provides: `database`  
Installs: `@supabase/supabase-js`

---

## ORM

ORM modules implement `ORMProvider` and register themselves via `registry.orm.registerProvider()` in their `onRegister` hook. They receive portable `ORMModelDefinition[]` objects and translate them into provider-specific files.

All four ORM modules integrate with `foundation generate model` and `foundation generate crud`.

### `orm-prisma`
| File | Description |
|------|-------------|
| `prisma/schema.prisma` | Prisma schema with datasource + generator blocks |
| `src/lib/db.ts` | Singleton `PrismaClient` export |

Provides: `orm:client`, `orm:migrations`  
Relation support: `@relation(fields: [...], references: [...])`  
Post-install: runs `prisma generate` in `afterInstall` hook

---

### `orm-typeorm`
| File | Description |
|------|-------------|
| `src/data-source.ts` | TypeORM `DataSource` with entity discovery |
| `src/entities/User.entity.ts` | Example entity with `@Entity`, `@Column` decorators |

Provides: `orm:client`, `orm:migrations`  
Relation support: `@ManyToOne`, `@OneToMany`, `@OneToOne`, `@ManyToMany` decorators

---

### `orm-mongoose`
| File | Description |
|------|-------------|
| `src/lib/db.ts` | Mongoose connection helper |
| `src/models/User.model.ts` | Example Schema + Model export |

Provides: `orm:client`  
Relation support: `{ type: Schema.Types.ObjectId, ref: "Target" }`

---

### `orm-sqlalchemy`
| File | Description |
|------|-------------|
| `src/database.py` | SQLAlchemy engine + session factory |
| `src/models.py` | Declarative base + example model |
| `alembic.ini` | Alembic migration config |

Runtime: `python`  
Provides: `orm:client`, `orm:migrations`  
Relation support: `relationship("Target")`

---

## Authentication

All auth modules generate a service, middleware, and router that wire into the selected backend.

### `auth-jwt`
| File | Description |
|------|-------------|
| `src/auth/auth.service.ts` | JWT sign + verify with refresh token support |
| `src/auth/auth.middleware.ts` | Express middleware — attaches `req.user` |
| `src/auth/auth.router.ts` | `/auth/login`, `/auth/refresh`, `/auth/logout` routes |

Installs: `jsonwebtoken`, `@types/jsonwebtoken`  
ORM model registered: `User` (id, email, passwordHash), `RefreshToken` (token, expiresAt, user relation)

---

### `auth-oauth`
**Google + GitHub via Passport.js**

| File | Description |
|------|-------------|
| `src/auth/oauth.config.ts` | Passport strategy configuration |
| `src/auth/oauth.router.ts` | OAuth callback routes |

Installs: `passport`, `passport-google-oauth20`, `passport-github2`

---

### `auth-session`
**Cookie-based sessions**

| File | Description |
|------|-------------|
| `src/auth/session.config.ts` | `express-session` config with secure cookies |
| `src/auth/session.middleware.ts` | Session middleware mount |
| `src/auth/session.router.ts` | Login / logout routes |

Installs: `express-session`, `connect-pg-simple` (when PostgreSQL is selected)

---

### `auth-clerk`
**Clerk hosted auth**

| File | Description |
|------|-------------|
| `src/auth/clerk.middleware.ts` | `clerkMiddleware()` mount |
| `src/auth/clerk.router.ts` | Protected route example |
| `src/components/AuthProvider.tsx` | `ClerkProvider` wrapper (Next.js / React) |

Installs: `@clerk/nextjs` or `@clerk/react` (selected based on frontend)  
Conflicts with: `auth-jwt`, `auth-oauth`, `auth-session`, `auth-auth0`

---

### `auth-auth0`
**Auth0 hosted auth**

| File | Description |
|------|-------------|
| `src/auth/auth0.config.ts` | Auth0 client config |
| `src/auth/auth0.middleware.ts` | JWT verification via JWKS |
| `src/components/AuthProvider.tsx` | `Auth0Provider` wrapper |

Installs: `@auth0/auth0-react` or `express-oauth2-jwt-bearer`  
Conflicts with: `auth-jwt`, `auth-oauth`, `auth-session`, `auth-clerk`

---

## UI Systems

### `ui-tailwind`
| File | Description |
|------|-------------|
| `tailwind.config.js` | Content paths, theme extension |
| `postcss.config.js` | PostCSS with Tailwind + Autoprefixer |
| `src/app/globals.css` | `@tailwind base/components/utilities` directives |

---

### `ui-shadcn`
Extends `ui-tailwind` (auto-injected as a dependency).

| File | Description |
|------|-------------|
| `tailwind.config.ts` | CSS variable-based color system |
| `components.json` | ShadCN/UI component config |
| `src/lib/utils.ts` | `cn()` helper using `clsx` + `tailwind-merge` |

Installs: `clsx`, `tailwind-merge`  
Requires: `ui-tailwind`

---

### `ui-mui`
| File | Description |
|------|-------------|
| `src/theme.ts` | MUI `createTheme()` with palette and typography |
| `src/components/MuiProvider.tsx` | `ThemeProvider` + `AppRouterCacheProvider` for Next.js |

Installs: `@mui/material`, `@emotion/react`, `@emotion/styled`

---

### `ui-chakra`
| File | Description |
|------|-------------|
| `src/components/ChakraProvider.tsx` | `ChakraProvider` with extended theme |

Installs: `@chakra-ui/react`, `@emotion/react`, `@emotion/styled`, `framer-motion`

---

### `ui-bootstrap`
| File | Description |
|------|-------------|
| `src/app/layout.tsx` | Bootstrap CSS import |
| `src/styles/custom.scss` | SCSS entry point for customisation |

Installs: `bootstrap`, `sass`

---

## State Management

### `state-zustand`
| File | Description |
|------|-------------|
| `src/store/index.ts` | Zustand store with `devtools` + `persist` middleware |

Installs: `zustand`

---

### `state-redux`
| File | Description |
|------|-------------|
| `src/store/index.ts` | Redux Toolkit `configureStore` |
| `src/store/counterSlice.ts` | Example slice |
| `src/components/ReduxProvider.tsx` | `Provider` wrapper |

Installs: `@reduxjs/toolkit`, `react-redux`

---

### `state-tanstack-query`
| File | Description |
|------|-------------|
| `src/lib/query-client.ts` | `QueryClient` with default stale time |
| `src/components/QueryProvider.tsx` | `QueryClientProvider` wrapper |
| `src/hooks/use-example.ts` | Example `useQuery` hook |

Installs: `@tanstack/react-query`, `@tanstack/react-query-devtools`

---

## Deployment

### `deployment-docker`
| File | Description |
|------|-------------|
| `Dockerfile` | Multi-stage build (deps → builder → runner) |
| `docker-compose.yml` | App + PostgreSQL services with health checks |
| `.dockerignore` | Standard exclusions |

---

### `deployment-vercel`
| File | Description |
|------|-------------|
| `vercel.json` | Functions config + CORS headers |
| `.vercelignore` | Deployment exclusions |

---

### `deployment-render`
| File | Description |
|------|-------------|
| `render.yaml` | Render Blueprint — web service + managed PostgreSQL |

---

### `deployment-aws`
| File | Description |
|------|-------------|
| `infra/ecs-task-definition.json` | ECS task definition |
| `.github/workflows/deploy.yml` | GitHub Actions CI/CD — build, push to ECR, update ECS service |

---

## Official add-on plugins

Add-ons are installed with `foundation add <name>`. They are resolved as built-in short names before hitting npm.

### `stripe`
```bash
foundation add stripe
```
| File | Description |
|------|-------------|
| `src/lib/stripe.ts` | `Stripe` client singleton |
| `src/webhooks/stripe.router.ts` | Webhook handler with signature verification |

Env vars added: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`

---

### `redis`
```bash
foundation add redis
```
| File | Description |
|------|-------------|
| `src/lib/redis.ts` | `ioredis` client with connection helpers |

Env vars added: `REDIS_URL`  
Installs: `ioredis`, `@types/ioredis`

---

### `openai`
```bash
foundation add openai
```
| File | Description |
|------|-------------|
| `src/lib/openai.ts` | `OpenAI` client with typed completions helper |

Env vars added: `OPENAI_API_KEY`  
Installs: `openai`

---

## Community plugins

Any npm package with the `foundation-plugin` keyword can be installed:

```bash
foundation add foundation-plugin-<name>
```

Third-party plugin hooks execute in a sandboxed context — they cannot access filesystem paths outside `projectRoot`.

To scaffold a new plugin:

```bash
foundation create-plugin my-plugin-name
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) and [`@systemlabs/foundation-plugin-sdk`](https://www.npmjs.com/package/@systemlabs/foundation-plugin-sdk) for the full plugin authoring guide.

---

## Module compatibility matrix

The table below shows which modules can coexist. ✅ = tested and compatible, ⚠️ = advisory warning, ❌ = hard conflict.

| | Express | NestJS | FastAPI | Django |
|---|---|---|---|---|
| **PostgreSQL** | ✅ | ✅ | ✅ | ✅ |
| **MySQL** | ✅ | ✅ | ✅ | ✅ |
| **MongoDB** | ✅ | ✅ | ⚠️ | ⚠️ |
| **SQLite** | ✅ | ✅ | ✅ | ✅ |
| **Supabase** | ✅ | ✅ | ⚠️ | ⚠️ |

| | Prisma | TypeORM | Mongoose | SQLAlchemy |
|---|---|---|---|---|
| **PostgreSQL** | ✅ | ✅ | ❌ | ⚠️ |
| **MySQL** | ✅ | ✅ | ❌ | ⚠️ |
| **MongoDB** | ⚠️ | ⚠️ | ✅ | ❌ |
| **SQLite** | ✅ | ✅ | ❌ | ✅ |

Auth providers are mutually exclusive: `auth-clerk` and `auth-auth0` each conflict with all other auth modules.

---

## Adding a module

See [CONTRIBUTING.md § Adding a new built-in module](./CONTRIBUTING.md#adding-a-new-built-in-module) for the full step-by-step checklist.