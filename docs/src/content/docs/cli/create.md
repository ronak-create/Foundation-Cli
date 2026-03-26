---
title: foundation create
description: Create a new Foundation CLI project - interactive or preset-based scaffolding
---


Create a new Foundation CLI project.

## Syntax

```bash
foundation create [name]
foundation new [name]           # alias
```

## Arguments

| Argument | Description | Required |
|----------|-------------|----------|
| `name` | Project name | No (prompts if omitted) |

## Options

| Option | Description | Default |
|--------|-------------|---------|
| `--preset <preset>` | Use a preset for non-interactive mode | None |
| `--yes` | Skip all confirmations | False |
| `--ci` | Force CI mode | Auto-detect |

## Presets

| Preset | Frontend | Backend | Database | ORM | Auth | UI | Deploy |
|--------|----------|---------|----------|-----|------|-----|--------|
| `saas` | Next.js | Express | PostgreSQL | Prisma | JWT | Tailwind | Docker |
| `ai-app` | Next.js | Express | PostgreSQL | Prisma | JWT | Tailwind | Docker |
| `ecommerce` | Next.js | Express | PostgreSQL | Prisma | Session | ShadCN | Docker |
| `api-backend` | — | Express | PostgreSQL | Prisma | JWT | — | Docker |
| `internal-tool` | Next.js | Express | PostgreSQL | Prisma | JWT | Tailwind | — |
| `crm` | Next.js | NestJS | PostgreSQL | Prisma | OAuth | MUI | Docker |
| `dashboard` | Next.js | Express | PostgreSQL | Prisma | JWT | ShadCN | Vercel |

## Examples

### Interactive

```bash
foundation create my-saas
```

### Non-Interactive (CI)

```bash
foundation create my-api --preset api-backend
```

### With Preset + Auto-Confirm

```bash
foundation create my-saas --preset saas --yes
```

## What Happens

1. **Prompts** — If no preset, asks for stack choices
2. **Resolve** — Validates modules, checks conflicts
3. **Compose** — Merges files and configs
4. **Scaffold** — Writes files atomically
5. **Install** — Installs dependencies
6. **Finalize** — Writes state files to `.foundation/`

## Related

- [Quick Start](/getting-started/quick-start/) — Usage intro
- [CI Mode](/getting-started/ci-mode/) — Automated usage
- [Archetypes](/advanced/archetypes/) — Preset details
