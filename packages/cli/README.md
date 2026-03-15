# @systemlabs/foundation-cli

> Scaffold production-ready full-stack projects in under 3 minutes.

```bash
npx @systemlabs/foundation-cli create my-app
```

Foundation CLI is a **dependency-aware project assembler**. You describe your intent — *"I want a SaaS with Next.js, Express, PostgreSQL, and JWT auth"* — and the engine resolves the full dependency graph, merges configurations without conflicts, injects integration code, and produces a working project.

**It is NOT:**
- A static template copier (like `create-next-app` or `degit`)
- A code scaffolding tool (like Yeoman or Hygen)
- A deployment tool — it generates deployment config, not deploy artifacts

---

## Quick start

```bash
# One-shot, no install needed
npx @systemlabs/foundation-cli

# Or install globally
npm install -g @systemlabs/foundation-cli
foundation create my-app
```

### Example session

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  FOUNDATION CLI  ·  Build your architecture in minutes
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

? Project name › my-saas-app
? What are you building?
❯ SaaS Application
  AI Application
  E-commerce
  API Backend
  Internal Tool

? Frontend framework   › Next.js
? Backend             › Express
? Database            › PostgreSQL
? ORM                 › Prisma
? Auth                › JWT
? UI system           › Tailwind + ShadCN
? Deployment          › Docker

✔ Files staged (47 files)
✔ npm packages installed

🎉 my-saas-app is ready.  cd my-saas-app && npm run dev
```

---

## Commands

### Create

```bash
foundation create [project-name]        # interactive
foundation new [project-name]           # alias
foundation create my-app --preset saas  # non-interactive / CI mode
```

**Available presets:** `saas`, `ai-app`, `ecommerce`, `api-backend`, `internal-tool`

### Module management

```bash
foundation add orm-prisma               # add a built-in module
foundation add stripe                   # add an official add-on
foundation add foundation-plugin-redis  # add a community plugin

foundation switch orm prisma            # swap the active ORM
foundation switch backend nestjs        # swap the active backend
foundation switch database mongodb      # swap the active database

foundation search <query>               # search the plugin registry on npm
```

### Code generation

```bash
foundation generate model Post          # interactive field prompts → ORM schema
foundation generate crud Post           # model + service + controller + routes
foundation generate --list              # list all available generators
```

### Project inspection

```bash
foundation info                         # stack summary, modules, ORM, plugins
foundation doctor                       # health checks: Node version, env vars, compatibility
foundation validate                     # validate project.lock and foundation.config.json
```

### Dev automation

```bash
foundation dev                          # delegates to npm run dev
foundation test                         # delegates to npm run test

foundation db migrate                   # npm run db:migrate / alembic upgrade head
foundation db seed                      # npm run db:seed
foundation db reset                     # npm run db:reset
foundation db studio                    # Prisma Studio (Prisma only)
foundation db push                      # Prisma db push (Prisma only)
```

### Tooling

```bash
foundation eject [module-id]            # copy module files into your project
foundation upgrade [--dry-run]          # upgrade modules via the lockfile
foundation create-plugin [name]         # scaffold a new plugin package
```

### AI assistant *(optional — requires API key)*

```bash
foundation ai "create a blog with posts, comments, and JWT auth"
```

Requires `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` in your environment. The CLI sends your prompt to the model with the full module catalogue, receives a structured plan, and runs `foundation add` + `foundation generate` automatically.

---

## Available modules

### Frontend
`Next.js` · `React + Vite` · `Vue 3` · `Svelte`

### Backend
`Express` · `NestJS` · `FastAPI` · `Django`

### Database
`PostgreSQL` · `MySQL` · `MongoDB` · `SQLite` · `Supabase`

### ORM
`Prisma` · `TypeORM` · `Mongoose` · `SQLAlchemy`

### Auth
`JWT` · `OAuth (Google + GitHub)` · `Session` · `Clerk` · `Auth0`

### UI
`Tailwind CSS` · `ShadCN/UI` · `Material UI` · `Chakra UI` · `Bootstrap`

### State
`Zustand` · `Redux Toolkit` · `TanStack Query`

### Deployment
`Docker` · `Vercel` · `Render` · `AWS ECS`

### Official add-ons
`Stripe` · `Redis` · `OpenAI`

---

## How it works

Every project generation runs through a four-stage pipeline:

1. **Module Registry** — loads, validates, and indexes all built-in and plugin modules
2. **Dependency Resolver** — builds a DAG of selected modules, detects conflicts, topologically sorts
3. **Composition Planner** — merges file trees and config patches before touching disk
4. **Execution Pipeline** — renders EJS templates, writes files atomically via `FileTransaction`, runs 14 lifecycle hooks, installs packages

All file writes are staged to a temp directory and committed atomically. Any failure rolls back completely — no partial scaffolds.

---

## Configuration files

After generation, your project contains:

```
.foundation/
├── project.lock            ← exact module + CLI versions (read by upgrade, switch, info, doctor)
└── foundation.config.json  ← user selections + installed plugins (read by add, switch, generate, eject)
```

---

## Requirements

- Node.js ≥ 18
- npm, pnpm, or yarn

---

## Part of the Foundation CLI ecosystem

| Package | Description |
|---------|-------------|
| **`@systemlabs/foundation-cli`** | ← **you are here** — user-facing CLI |
| [`@systemlabs/foundation-core`](https://www.npmjs.com/package/@systemlabs/foundation-core) | Engine: dependency resolver, composition planner, file transaction |
| [`@systemlabs/foundation-modules`](https://www.npmjs.com/package/@systemlabs/foundation-modules) | All built-in modules (frontend, backend, database, auth, …) |
| [`@systemlabs/foundation-plugin-sdk`](https://www.npmjs.com/package/@systemlabs/foundation-plugin-sdk) | Plugin contract, types, manifest schema |
| [`@systemlabs/foundation-testing`](https://www.npmjs.com/package/@systemlabs/foundation-testing) | Test utilities for module and plugin authors |

---

## License

MIT — see [LICENSE](https://github.com/ronak-create/Foundation-Cli/blob/main/LICENSE)