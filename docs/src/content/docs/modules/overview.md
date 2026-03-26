---
title: Modules Overview
description: Overview of all Foundation CLI modules - 30+ modules across 9 categories
---



Foundation CLI ships with 30+ built-in modules across 9 categories. Every module generates real, compile-ready files — not stubs or TODO comments.

## How Modules Work

A module is a `PluginDefinition` that declares:
- Unique `id` and `category`
- `files` — EJS templates rendered into output
- `configPatches` — merge instructions for configs
- `dependencies` — npm/pip packages
- `provides` / `requires` — capability tokens
- `compatibility.conflicts` — module IDs that cannot coexist

## Module Categories

| Category | Modules |
|----------|---------|
| [Frontend](/modules/frontend/) | Next.js, React + Vite, Vue 3, Svelte |
| [Backend](/modules/backend/) | Express, NestJS, FastAPI, Django |
| [Database](/modules/database/) | PostgreSQL, MySQL, MongoDB, SQLite, Supabase |
| [ORM](/modules/orm/) | Prisma, TypeORM, Mongoose, SQLAlchemy |
| [Auth](/modules/auth/) | JWT, OAuth, Session, Clerk, Auth0 |
| [UI](/modules/ui/) | Tailwind, ShadCN, MUI, Chakra, Bootstrap |
| [State](/modules/state/) | Zustand, Redux Toolkit, TanStack Query |
| [Deployment](/modules/deployment/) | Docker, Vercel, Render, AWS ECS |
| [Add-ons](/modules/addons/) | Stripe, Redis, OpenAI |

## Capability-Based Resolution

Modules use capability tokens instead of hardcoded dependencies:

```typescript
// When you select auth-jwt, it requires: ['orm:client']
// The resolver automatically injects an ORM if none selected
```

This means you can select `auth-jwt` without explicitly picking Prisma — it gets auto-injected.

## Compatibility Matrix

### Backend + Database

| | PostgreSQL | MySQL | MongoDB | SQLite |
|---|---|---|---|---|
| **Express** | ✅ | ✅ | ✅ | ✅ |
| **NestJS** | ✅ | ✅ | ✅ | ✅ |
| **FastAPI** | ✅ | ✅ | ⚠️ | ✅ |
| **Django** | ✅ | ✅ | ⚠️ | ✅ |

### ORM + Database

| | Prisma | TypeORM | Mongoose | SQLAlchemy |
|---|---|---|---|---|
| **PostgreSQL** | ✅ | ✅ | ❌ | ⚠️ |
| **MySQL** | ✅ | ✅ | ❌ | ⚠️ |
| **MongoDB** | ⚠️ | ⚠️ | ✅ | ❌ |
| **SQLite** | ✅ | ✅ | ❌ | ✅ |

## Adding Modules Later

Use `foundation add` to add modules to existing projects:

```bash
# Add an ORM
foundation add orm-prisma

# Add an addon
foundation add stripe
```

See [CLI: add](/cli/add/) for details.

## Related

- [Module System](/core-concepts/module-system/) — Technical deep-dive
- [Module Manifest](/reference/module-manifest/) — Full schema reference
- [CLI: switch](/cli/switch/) — Swap module categories
