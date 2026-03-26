---
title: Tutorial - SaaS Application
description: Build a complete SaaS application from scratch with Next.js, Express, Prisma, and JWT auth
---



This tutorial walks through building a complete SaaS application.

## Goal

Create a production-ready SaaS with:
- Next.js frontend
- Express backend
- PostgreSQL + Prisma ORM
- JWT authentication
- Tailwind CSS

## Step 1: Create the Project

```bash
npx @systemlabs/foundation-cli create my-saas --preset saas
```

Or interactively:
```
? Project name › my-saas
? What are you building? › SaaS Application
```

## Step 2: Start Development

```bash
cd my-saas
npm run dev
```

Frontend at `http://localhost:3000`, Backend at `http://localhost:3001`

## Step 3: Generate a Data Model

```bash
foundation generate model User
# Add fields: email (string, unique), name (string)

foundation generate model Task
# Add fields: title (string), completed (boolean), userId (relation to User)
```

## Step 4: Add Authentication

The `saas` preset already includes JWT auth. Verify routes:
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`

## Step 5: Add Stripe Payments

```bash
foundation add stripe
```

This adds:
- `src/payments/stripe.ts` — Stripe client
- `src/payments/stripe-webhooks.ts` — Webhook handler

## Step 6: Deploy to Docker

```bash
docker-compose up --build
```

## Project Structure

```
my-saas/
├── app/                    # Next.js pages
├── prisma/
│   └── schema.prisma       # User, Task models
├── src/
│   ├── server.ts           # Express API
│   ├── auth/               # JWT auth
│   └── payments/           # Stripe (after add)
├── docker-compose.yml
└── package.json
```

## Related

- [Quick Start](/getting-started/quick-start/)
- [CLI: generate](/cli/generate/)
- [CLI: add](/cli/add/)
- [Modules: Auth](/modules/auth/)
