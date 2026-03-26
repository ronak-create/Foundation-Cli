---
title: Your First Project
description: A detailed walkthrough of creating your first Foundation CLI project
---



This guide walks through creating a complete SaaS application step by step.

## Prerequisites

- Node.js ≥ 18
- npm, pnpm, or yarn

## Step 1: Run the CLI

```bash
npx @systemlabs/foundation-cli create my-saas
```

Or with the preset for faster setup:

```bash
foundation create my-saas --preset saas
```

## Step 2: Answer the Prompts

If running interactively:

```
? Project name › my-saas
? What are you building? › SaaS Application
? Frontend  › Next.js
? Backend   › Express
? Database  › PostgreSQL
? ORM       › Prisma
? Auth      › JWT
? UI        › Tailwind CSS
? Deploy    › Docker
```

The `saas` preset pre-fills most answers, so you'll only need to confirm or adjust.

## Step 3: Review the Plan

The CLI shows you what's being resolved:

```
✔ Dependencies resolved   (6 modules, 0 conflicts)
✔ Files staged            (47 files)
```

## Step 4: Installation

Dependencies install automatically:

```
✔ npm packages installed  (12s)
```

## Step 5: Ready to Go

```
🎉 my-saas is ready.

  cd my-saas && npm run dev
  ▸ Frontend   http://localhost:3000
  ▸ Backend    http://localhost:3001
```

## Project Structure

Here's what Foundation CLI generated:

```
my-saas/
├── app/                        # Next.js App Router
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── prisma/
│   └── schema.prisma           # Prisma schema
├── src/
│   ├── server.ts               # Express server
│   ├── db/
│   │   └── client.ts            # PostgreSQL client
│   └── auth/                   # JWT auth files
│       ├── auth.service.ts
│       ├── auth.middleware.ts
│       └── auth.router.ts
├── docker-compose.yml          # PostgreSQL + app
├── package.json                # All deps + scripts
├── .env.example                # Template env vars
├── tailwind.config.js
├── tsconfig.json
└── .foundation/                # Project state
```

## What's Included

| Component | What You Get |
|-----------|--------------|
| **Frontend** | Next.js 14 with App Router, TypeScript |
| **Backend** | Express with CORS, Helmet, JSON parsing |
| **Database** | PostgreSQL with `node-postgres` |
| **ORM** | Prisma with generated client |
| **Auth** | JWT with refresh tokens |
| **UI** | Tailwind CSS with custom config |
| **Docker** | Multi-stage Dockerfile + compose |

## Add Modules Later

Use `foundation add` to add features:

```bash
# Add Stripe payments
foundation add stripe

# Add Redis caching
foundation add redis
```

See [CLI Commands](/cli/add/) for more options.

## Generate Code

Create data models automatically:

```bash
# Create a User model
foundation generate model User

# Create full CRUD
foundation generate crud Post
```

See [generate](/cli/generate/) for details.

## Next Steps

- [Tutorials](/tutorials/saas-app/) — Build a complete SaaS from scratch
- [CLI Overview](/cli/) — All available commands
- [Modules](/modules/overview/) — All available modules
