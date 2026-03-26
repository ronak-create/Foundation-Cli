---
title: Adding a Module
description: How to add a new built-in module to Foundation CLI
---



Add new built-in modules to Foundation CLI.

## Steps

### 1. Create Module File

Create `packages/modules/src/<category>/<name>.ts`:

```typescript
import type { PluginDefinition } from '@systemlabs/foundation-plugin-sdk';

const module: PluginDefinition = {
  manifest: {
    id: 'backend-hono',
    name: 'Hono',
    version: '0.1.0',
    category: 'backend',
    description: 'Lightweight web framework',
    runtime: 'node',
    provides: ['backend'],
    requires: [],
    dependencies: [
      { name: 'hono', version: '^4.0.0', scope: 'dependencies' },
    ],
    files: [
      { relativePath: 'src/server.ts', content: '...' },
    ],
    configPatches: [],
    compatibility: { conflicts: [] },
  },
  hooks: {},
};

export default module;
```

### 2. Export from Category Index

```typescript
// packages/modules/src/backend/index.ts
export { default as backendHono } from './hono.js';
```

### 3. Register in Loader

```typescript
// packages/modules/src/registry-loader.ts
import { backendHono } from './backend/index.js';

export const BUILTIN_MODULES = new Map([
  // ... existing
  ['backend-hono', backendHono],
]);

export const SELECTION_TO_MODULE_ID = {
  // ... existing
  'Hono': 'backend-hono',
};
```

### 4. Add Prompt Choice

```typescript
// packages/cli/src/prompt/graph-definition.ts
{
  name: 'backend',
  choices: [
    // ... existing
    { value: 'Hono', name: 'Hono' },
  ],
}
```

### 5. Test

```bash
cd packages/modules && pnpm test
```

### 6. Update Documentation

Add to [Modules](/modules/overview/).

## Rules

- `id` must be unique and kebab-case
- Prefix with category: `backend-hono`, `orm-prisma`
- `files[].relativePath` must use forward slashes

## Related

- [Contributing: Setup](/contributing/setup/)
- [Module Manifest](/reference/module-manifest/)
