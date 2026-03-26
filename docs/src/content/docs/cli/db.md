---
title: foundation db
description: Run database operations - migrate, seed, reset, studio, push
---


Run ORM-aware database operations.

## Syntax

```bash
foundation db <command>
```

## Commands

| Command | Description |
|---------|-------------|
| `migrate` | Run migrations |
| `seed` | Run seeders |
| `reset` | Reset database (drop + migrate + seed) |
| `studio` | Open Prisma Studio (Prisma only) |
| `push` | Push schema to DB (Prisma only) |

## Examples

### Run Migrations

```bash
foundation db migrate
# Prisma: npm run db:migrate
# TypeORM: npm run migration:run
# SQLAlchemy: alembic upgrade head
```

### Seed Database

```bash
foundation db seed
```

### Reset Database

```bash
foundation db reset
```

### Open Prisma Studio

```bash
foundation db studio
```

### Push Schema

```bash
foundation db push
```

## ORM Script Mapping

| ORM | migrate | seed | reset | studio | push |
|-----|---------|------|-------|--------|------|
| Prisma | db:migrate | db:seed | db:reset | db:studio | db:push |
| TypeORM | migration:run | db:seed | db:reset | - | - |
| Mongoose | - | db:seed | db:reset | - | - |
| SQLAlchemy | db:migrate | db:seed | db:reset | - | - |

## Related

- [CLI Overview](/cli/) — All commands
- [ORM Modules](/modules/orm/) — ORM providers
- [Foundation Create](/cli/create/) — Project creation
