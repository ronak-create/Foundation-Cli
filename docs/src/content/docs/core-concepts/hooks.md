---
title: Hooks
description: Lifecycle hooks - 14 stages where modules and plugins can execute custom logic during project creation
---



Lifecycle hooks let modules and plugins execute custom logic at specific stages during project creation.

## All 14 Hooks

| # | Hook | Stage | Description |
|---|------|-------|-------------|
| 1 | `onRegister` | Registry load | ORM providers register here; abort by throwing |
| 2 | `onBeforeCompose` | Before template render | Inject dynamic template variables |
| 3 | `onAfterTemplate` | After render, before merge | Post-process rendered file content |
| 4 | `onMerge` | During config merge | Custom merge logic for non-standard files |
| 5 | `onAfterCompose` | After all files staged | Cross-module wiring |
| 6 | `beforeWrite` | Before `FileTransaction.commit()` | Final modifications |
| 7 | `afterWrite` | After file commit | Post-write operations |
| 8 | `beforeInstall` | Before package manager | Modify install plan |
| 9 | `afterInstall` | After package manager | Run post-install scripts |
| 10 | `onFinalize` | After success | Print post-install instructions |
| 11 | `onRollback` | On failure | Cleanup side-effects |
| 12 | `onGenerate` | Before generator writes | Extend generated output |
| 13 | `onStart` | When `foundation dev` runs | Dev-time setup |
| 14 | `onBuild` | When `foundation build` runs | Build-time steps |

## Hook Context

Each hook receives a `PluginHookContext`:

```typescript
interface PluginHookContext {
  config: {
    projectName: string;
    projectRoot: string;
    selections: SelectionMap;
    packageManager: 'npm' | 'pnpm' | 'yarn';
  };
  logger?: {
    info(msg: string): void;
    warn(msg: string): void;
    error(msg: string): void;
  };
  // For plugins: limited registry access via __registry
}
```

## Example: onRegister

```typescript
import type { PluginDefinition } from '@systemlabs/foundation-plugin-sdk';

const prismaModule: PluginDefinition = {
  manifest: { /* ... */ },
  hooks: {
    onRegister: async (ctx) => {
      // Register ORM provider
      const orm = ctx.config.__registry?.orm;
      orm?.registerProvider(prismaProvider);
    },
  },
};
```

## Example: onFinalize

```typescript
hooks: {
  onFinalize: async (ctx) => {
    ctx.logger?.info('Project ready!');
    ctx.logger?.info('Run: cd ' + ctx.config.projectName + ' && npm run dev');
  },
}
```

## Built-in vs Plugin Hooks

- **Built-in modules**: Hooks run directly as functions
- **Community plugins**: Hooks run in sandboxed `worker_threads` for security

## Related

- [Execution Pipeline](/core-concepts/execution-pipeline/) — Pipeline flow
- [Writing a Plugin](/plugins/writing/) — How to use hooks in plugins
- [Sandbox Security](/plugins/sandbox/) — Plugin security model
