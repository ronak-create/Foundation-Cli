---
title: Module System
description: How Foundation CLI modules work - PluginDefinition, files, configPatches, capabilities
---



A module is a `PluginDefinition` that declares what it generates and how it integrates with other modules.

## What is a Module?

A module is a self-contained package that generates:
- **Files** — EJS templates rendered into the output project
- **Config patches** — Deep-merge instructions for package.json, tsconfig.json, .env, etc.
- **Dependencies** — npm/pip packages to install
- **Capabilities** — What it provides and what it requires

## PluginDefinition Structure

```typescript
import type { PluginDefinition } from '@systemlabs/foundation-plugin-sdk';

const module: PluginDefinition = {
  manifest: {
    id: 'backend-express',
    name: 'Express',
    version: '0.1.0',
    category: 'backend',
    description: 'Fast, unopinionated web framework',
    runtime: 'node',
    provides: ['backend'],
    requires: [],
    dependencies: [
      { name: 'express', version: '^4.18.0', scope: 'dependencies' },
    ],
    files: [
      { relativePath: 'src/server.ts', content: '...' },
    ],
    configPatches: [
      { file: 'package.json', patch: { scripts: { dev: 'ts-node src/server.ts' } } },
    ],
    compatibility: {
      conflicts: [],
      requires: [],
      compatibleWith: {},
    },
  },
  hooks: {
    onFinalize: async (ctx) => {
      ctx.logger?.info('Express server ready');
    },
  },
};
```

## Key Fields

### id
- Unique identifier in kebab-case
- Prefixed with category: `backend-express`, `orm-prisma`, `auth-jwt`

### provides
- Capability tokens this module satisfies
- Example: `['backend']`, `['orm:client', 'orm:migrations']`

### requires
- Capabilities this module needs
- Can be a token (`'orm:client'`) or category name (`'database'`)

### files
- Array of `FileEntry` objects
- `relativePath`: where to write (relative to project root)
- `content`: EJS template string
- `when`: optional condition (e.g., `'deployment.docker'`)

### configPatches
- Merge instructions for config files
- Supports: package.json, tsconfig.json, .env, requirements.txt, docker-compose.yml

## Module Categories

| Category | Example Modules |
|----------|-----------------|
| `frontend` | nextjs, react-vite, vue, svelte |
| `backend` | express, nestjs, fastapi, django |
| `database` | postgresql, mysql, mongodb, sqlite, supabase |
| `orm` | prisma, typeorm, mongoose, sqlalchemy |
| `auth` | jwt, oauth, session, clerk, auth0 |
| `ui` | tailwind, shadcn, mui, chakra, bootstrap |
| `state` | zustand, redux, tanstack-query |
| `deployment` | docker, vercel, render, aws |

## Capability-Based Resolution

Instead of hardcoding dependencies, modules declare capabilities:

```typescript
// Prisma module
provides: ['orm:client', 'orm:migrations']

// Auth module
requires: ['orm:client']
```

The resolver automatically finds a provider for `orm:client` — you don't need to explicitly select an ORM.

## Related

- [Modules Overview](/modules/overview/) — All available modules
- [Dependency Resolution](/core-concepts/dependency-resolution/) — How capabilities resolve
- [Module Manifest Reference](/reference/module-manifest/) — Full schema
