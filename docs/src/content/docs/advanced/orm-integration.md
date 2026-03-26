---
title: ORM Integration
description: How ORM modules integrate with Foundation CLI - providers, models, schema generation
---



Foundation CLI's ORM system provides a portable model layer that works across all 4 supported ORMs.

## How ORM Works

1. **Register** — ORM module calls `registerProvider()` in `onRegister` hook
2. **Model** — Any module calls `registerModel()` with portable `ORMModelDefinition`
3. **Generate** — `buildSchemaFiles()` translates to provider-specific schema
4. **Write** — Schema files written during composition

## Provider Interface

```typescript
interface ORMProvider {
  id: string;
  buildSchemaFiles(models: ORMModelDefinition[]): FileEntry[];
}
```

## Model Registration

```typescript
// In any module's hook
ctx.config.__registry?.orm.registerModel({
  id: 'User',
  fields: [
    { name: 'id', type: 'uuid', primary: true },
    { name: 'email', type: 'string', unique: true },
    { name: 'passwordHash', type: 'string' },
  ],
  relations: [
    { type: 'one-to-many', from: 'User', to: 'Post' },
  ],
});
```

## Schema Output by Provider

| Provider | Output File |
|----------|-------------|
| Prisma | `prisma/schema.prisma` |
| TypeORM | `src/entities/*.entity.ts` |
| Mongoose | `src/models/*.model.ts` |
| SQLAlchemy | `src/models.py` |

## Relations

All 4 providers support all relation types:

- `many-to-one`
- `one-to-many`
- `one-to-one`
- `many-to-many`

## Database Compatibility

| ORM | PostgreSQL | MySQL | MongoDB | SQLite |
|-----|------------|-------|---------|--------|
| Prisma | ✅ | ✅ | ⚠️ | ✅ |
| TypeORM | ✅ | ✅ | ⚠️ | ✅ |
| Mongoose | ❌ | ❌ | ✅ | ❌ |
| SQLAlchemy | ⚠️ | ⚠️ | ❌ | ✅ |

## Related

- [Modules: ORM](/modules/orm/)
- [CLI: generate](/cli/generate/)
- [Execution Pipeline](/core-concepts/execution-pipeline/)
