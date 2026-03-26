---
title: Archetypes
description: Project presets - pre-configured stacks for common use cases
---



Archetypes are pre-configured module combinations optimized for specific use cases.

## Available Archetypes

| Archetype | Frontend | Backend | Database | ORM | Auth | UI | State | Deploy |
|-----------|----------|---------|----------|-----|------|-----|-------|--------|
| `saas` | Next.js | Express | PostgreSQL | Prisma | JWT | Tailwind | — | Docker |
| `ai-app` | Next.js | Express | PostgreSQL | Prisma | JWT | Tailwind | TanStack Query | Docker |
| `ecommerce` | Next.js | Express | PostgreSQL | Prisma | Session | ShadCN | Zustand | Docker |
| `api-backend` | — | Express | PostgreSQL | Prisma | JWT | — | — | Docker |
| `internal-tool` | Next.js | Express | PostgreSQL | Prisma | JWT | Tailwind | — | — |
| `crm` | Next.js | NestJS | PostgreSQL | Prisma | OAuth | MUI | Redux | Docker |
| `dashboard` | Next.js | Express | PostgreSQL | Prisma | JWT | ShadCN | TanStack Query | Vercel |

## How Archetypes Work

1. Pre-fill `SelectionMap` before prompts run
2. `onAnswer` hooks in PromptGraph inject defaults based on archetype
3. User sees only un-answered questions

## Using Archetypes

### Non-Interactive (CI)

```bash
foundation create my-app --preset saas
```

### Interactive

```
? Project name › my-saas
? What are you building? › SaaS Application
# Remaining questions pre-filled based on saas preset
```

## Related

- [CLI: create](/cli/create/)
- [Getting Started](/getting-started/first-project/)
- [PromptGraph](/core-concepts/architecture/)
