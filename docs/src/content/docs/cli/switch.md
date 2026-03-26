---
title: foundation switch
description: Swap a module in an existing Foundation project (e.g., change ORM from TypeORM to Prisma)
---



Swap a module in an existing project (e.g., change ORM from TypeORM to Prisma).

## Syntax

```bash
foundation switch <category> <module>
```

## Arguments

| Argument | Description | Required |
|----------|-------------|----------|
| `category` | Category to switch (`orm`, `backend`, `database`, `frontend`, `auth`, `ui`, `state`, `deployment`) | Yes |
| `module` | Target module ID or name | Yes |

## Examples

### Switch ORM

```bash
foundation switch orm prisma
foundation switch orm typeorm
```

### Switch Backend

```bash
foundation switch backend nestjs
```

### Switch Database

```bash
foundation switch database mongodb
```

## What Happens

1. **Resolve** — Finds current module in that category
2. **Build Set** — Creates new module ID set (remove old, add new)
3. **Validate** — Checks compatibility
4. **Re-compose** — Creates new composition plan
5. **Scaffold** — Writes updated files
6. **Update** — Updates lockfile and config

## Use Cases

- Migrate from Prisma to TypeORM
- Switch from Express to NestJS
- Change from PostgreSQL to MongoDB

## Related

- [CLI Overview](/cli/) — All commands
- [Modules](/modules/orm/) — ORM modules
- [Migration Tutorial](/tutorials/migration/) — Full migration guide
