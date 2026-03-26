---
title: foundation generate
description: Generate ORM models and CRUD endpoints automatically
---


Generate ORM-aware code — models, services, controllers, routes.

## Syntax

```bash
foundation generate <type> <name> [options]
```

## Types

| Type | Description |
|------|-------------|
| `model` | Generate ORM schema file |
| `crud` | Generate model + service + controller + routes |
| `--list` | List all available generators |

## Examples

### Generate Model

```bash
foundation generate model Post
# Interactive: prompts for fields (name, type, required, unique)
# Output: prisma/schema.prisma block or entity file
```

### Generate CRUD

```bash
foundation generate crud Post
# Creates: model + service + controller + routes
```

### List Generators

```bash
foundation generate --list
```

## Generated Output by ORM

| ORM | Model Output | CRUD Output |
|-----|--------------|-------------|
| Prisma | `prisma/schema.prisma` | src/services/, src/controllers/, src/routes/ |
| TypeORM | `src/entities/*.entity.ts` | Express/NestJS controllers |
| Mongoose | `src/models/*.model.ts` | Express controllers |
| SQLAlchemy | `src/*.py` | FastAPI router + Pydantic schemas |

## Fields

Interactive prompts for each field:
- Name (PascalCase)
- Type (string, number, boolean, date)
- Required (yes/no)
- Unique (yes/no)

Auto-adds: `id` (PK), `createdAt`, `updatedAt`

## CI Mode

Use `FOUNDATION_AI_FIELDS` for non-interactive generation:

```bash
FOUNDATION_AI_FIELDS="name:string,email:string,password:string" foundation generate model User
```

## Related

- [CLI Overview](/cli/) — All commands
- [Code Generation](/advanced/code-generation/) — Deep dive
- [ORM Modules](/modules/orm/) — ORM providers
