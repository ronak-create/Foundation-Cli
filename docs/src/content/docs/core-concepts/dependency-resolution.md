---
title: Dependency Resolution
description: How Foundation CLI resolves module dependencies using capability tokens and DAG-based topological sorting
---



The dependency resolver uses capability tokens to automatically resolve module dependencies, detect conflicts, and produce a valid execution order.

## Capability Tokens

Modules declare what they **provide** and what they **require**:

```typescript
// Express module
provides: ['backend']

// Prisma module
provides: ['orm:client', 'orm:migrations']

// JWT Auth module
requires: ['orm:client', 'database']
```

When you select an auth module, the resolver automatically injects an ORM provider if none is selected.

## Resolution Steps

1. **Validate IDs** — All selected module IDs must exist in registry
2. **Enforce lifecycle** — `removed` throws error, `deprecated` warns
3. **Build CapabilityMap** — Collect all `provides` tokens from resolved modules
4. **Expand requires** — For each requirement:
   - If token matches a provided capability → skip
   - If it's a known module ID → queue it
   - Otherwise → search registry for a provider by category, then by `provides`
5. **Conflict check** — Verify no `compatibility.conflicts` exist
6. **Compatible warnings** — Check `compatibleWith` matrix (advisory only)
7. **Topological sort** — Order modules via Kahn's algorithm

## Auto-Injection

If you select a module that requires `orm:client` but don't select an ORM, the resolver automatically finds one:

```
User selects: frontend-nextjs + auth-jwt
Resolver adds: backend-express + database-postgresql + orm-prisma
```

Added modules are reported to the user as `result.added`.

## Conflict Detection

### Hard Conflicts

```typescript
// In module manifest
compatibility: {
  conflicts: ['auth-session', 'auth-oauth']
}
```

Selecting conflicting modules throws `ModuleConflictError`.

### Advisory Warnings

```typescript
compatibility: {
  compatibleWith: {
    'database-mongodb': ['experimental']
  }
}
```

These produce warnings but allow the operation.

## Topological Sort

The resolver uses Kahn's algorithm to order modules:

1. Build adjacency list from dependencies
2. Find nodes with no incoming edges
3. Remove them, add to sorted list
4. Repeat until all nodes processed

This ensures files are generated in the right order.

## Error Codes

| Error | Code | Description |
|-------|------|-------------|
| `ModuleNotFoundError` | `ERR_MODULE_NOT_FOUND` | Selected module ID doesn't exist |
| `ModuleConflictError` | `ERR_MODULE_CONFLICT` | Incompatible modules selected |
| `MissingRequiredModuleError` | `ERR_MISSING_REQUIRED_MODULE` | Required capability has no provider |

## Related

- [Module System](/core-concepts/module-system/) — Module structure
- [Architecture](/core-concepts/architecture/) — System overview
- [Error Codes](/reference/error-codes/) — All error types
