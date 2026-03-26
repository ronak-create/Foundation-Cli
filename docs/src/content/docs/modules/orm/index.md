---
title: ORM Modules
description: ORM providers - Prisma, TypeORM, Mongoose, SQLAlchemy
---



Foundation CLI supports 4 ORM providers. Each integrates with `foundation generate model` and `foundation generate crud`.

## Available Modules

| ID | Name | Provides | Relation Syntax |
|----|------|----------|-----------------|
| `orm-prisma` | Prisma | `orm:client`, `orm:migrations` | `@relation(fields, references)` |
| `orm-typeorm` | TypeORM | `orm:client`, `orm:migrations` | `@ManyToOne`, `@OneToMany`, etc. |
| `orm-mongoose` | Mongoose | `orm:client` | `{ type: ObjectId, ref }` |
| `orm-sqlalchemy` | SQLAlchemy | `orm:client`, `orm:migrations` | `relationship()` |

## Prisma (`orm-prisma`)

The most popular Node.js ORM:
- `prisma/schema.prisma` — Schema with datasource + generator blocks
- `src/lib/db.ts` — Singleton PrismaClient export

```bash
foundation generate model Post
# Creates prisma/schema.prisma model block
```

Runs `prisma generate` in afterInstall hook.

## TypeORM (`orm-typeorm`)

Full-featured ORM with decorators:
- `src/data-source.ts` — TypeORM DataSource with entity discovery
- `src/entities/*.entity.ts` — Entity classes with decorators

## Mongoose (`orm-mongoose`)

MongoDB ODM:
- `src/lib/db.ts` — Mongoose connection helper
- `src/models/*.model.ts` — Schema + Model exports

## SQLAlchemy (`orm-sqlalchemy`)

Python ORM:
- `src/database.py` — SQLAlchemy engine + session factory
- `src/models.py` — Declarative base + example model
- `alembic.ini` — Alembic migration config

## Relations Support

All 4 providers support all relation types:

- `many-to-one`
- `one-to-many`
- `one-to-one`
- `many-to-many`

## ORM + Database Compatibility

| ORM | PostgreSQL | MySQL | MongoDB | SQLite |
|------|------------|-------|---------|--------|
| **Prisma** | ✅ | ✅ | ⚠️ | ✅ |
| **TypeORM** | ✅ | ✅ | ⚠️ | ✅ |
| **Mongoose** | ❌ | ❌ | ✅ | ❌ |
| **SQLAlchemy** | ⚠️ | ⚠️ | ❌ | ✅ |

## Related

- [CLI: generate](/cli/generate/) — Model/CRUD generation
- [ORM Integration](/advanced/orm-integration/) — Deep dive
- [Database Modules](/modules/database/) — Pair with a database
