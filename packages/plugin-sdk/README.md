# @systemlabs/foundation-plugin-sdk

> The public contract for building Foundation CLI plugins and modules.

This package contains **zero runtime dependencies** beyond AJV for schema validation. It is the only package you need to import when authoring a plugin — it defines all types, the manifest schema, and the `validateManifest()` helper.

```bash
npm install @systemlabs/foundation-plugin-sdk
```

---

## What's in this package

| Export | Description |
|--------|-------------|
| `PluginDefinition` | Top-level type you export from your plugin entry point |
| `ModuleManifest` | Full manifest schema interface |
| `validateManifest()` | Validates a manifest object against the JSON Schema |
| All hook types | `OnRegisterHook`, `OnFinalizeHook`, `OnGenerateHook`, etc. |
| `ORMModelDefinition` | Provider-agnostic model format for ORM integration |
| `ORMRelationDefinition` | Relation type (`many-to-one`, `one-to-many`, etc.) |
| `FileEntry`, `ConfigPatch` | File and config contribution types |

---

## Defining a plugin

```typescript
import type { PluginDefinition } from '@systemlabs/foundation-plugin-sdk';

const plugin: PluginDefinition = {
  manifest: {
    id:          'my-plugin',
    name:        'My Plugin',
    version:     '1.0.0',
    category:    'addon',
    description: 'Does something useful.',
    runtime:     'node',
    provides:    ['my-plugin:client'],
    requires:    [],
    dependencies: [
      { name: 'some-package', version: '^2.0.0', dev: false }
    ],
    files: [
      { path: 'src/my-plugin/client.ts', template: 'client.ts.ejs' }
    ],
    configPatches: [],
    compatibility: {},
  },

  hooks: {
    onFinalize: async (ctx) => {
      ctx.logger.info('my-plugin installed — add YOUR_API_KEY to .env');
    },
  },
};

export default plugin;
```

---

## Manifest fields

```typescript
interface ModuleManifest {
  id:          string;                  // unique, kebab-case
  name:        string;                  // human-readable
  version:     string;                  // semver
  category:    ModuleCategory;          // see below
  description: string;
  runtime?:    'node' | 'python' | 'multi';
  provides?:   string[];               // capability tokens this module satisfies
  requires?:   string[];               // capability tokens this module needs
  dependencies:   PackageDependency[];
  files:          FileEntry[];
  configPatches:  ConfigPatch[];
  compatibility: {
    conflicts?:       string[];         // module IDs that cannot coexist
    compatibleWith?:  Record<string, string[]>;
    peerFrameworks?:  Record<string, string>;
  };
}

type ModuleCategory =
  | 'frontend' | 'backend' | 'database' | 'orm'
  | 'auth'     | 'ui'      | 'state'    | 'deployment'
  | 'addon'    | 'generate'| 'testing'  | 'tooling';
```

---

## Lifecycle hooks

Your plugin can export any of these hooks from the `hooks` key:

| Hook | Fires when |
|------|-----------|
| `onRegister` | Registry loads your plugin — register ORM providers here |
| `onBeforeCompose` | Before template rendering — inject dynamic template variables |
| `onAfterTemplate` | After render, before file merge — post-process rendered files |
| `onMerge` | During config merge — supply custom merge logic |
| `onAfterCompose` | After all files are staged — cross-module wiring |
| `beforeWrite` | Before the file-write transaction commits |
| `afterWrite` | After the file-write transaction commits |
| `beforeInstall` | Before the package manager runs |
| `afterInstall` | After package installation completes |
| `onFinalize` | After full success — print post-install instructions |
| `onRollback` | On any failure — clean up side-effects |
| `onGenerate` | Before generator writes files — extend generated output |
| `onStart` | When `foundation dev` is invoked |
| `onBuild` | When `foundation build` is invoked |

---

## Validating a manifest

```typescript
import { validateManifest } from '@systemlabs/foundation-plugin-sdk';

const result = validateManifest(myManifest);
if (!result.valid) {
  console.error(result.errors);
}
```

---

## ORM integration

If your plugin contributes a model to the active ORM, use the portable model format — the active ORM provider will translate it to provider-specific output automatically:

```typescript
hooks: {
  onRegister: async (ctx) => {
    ctx.registry.orm.registerModel({
      id:   'my-plugin.Record',
      name: 'Record',
      fields: [
        { name: 'id',        type: 'uuid',   primaryKey: true, generated: true },
        { name: 'payload',   type: 'string', required: true },
        { name: 'createdAt', type: 'date',   generated: true },
      ],
      relations: [],
    }, 'my-plugin');
  },
}
```

---

## Publishing a plugin to npm

Your plugin package must include `foundation-plugin` in its `keywords` array so `foundation search` can discover it:

```json
{
  "name": "foundation-plugin-my-plugin",
  "keywords": ["foundation-plugin"]
}
```

Install it in any Foundation project with:

```bash
foundation add foundation-plugin-my-plugin
```

---

## Part of the Foundation CLI ecosystem

| Package | Description |
|---------|-------------|
| [`@systemlabs/foundation-cli`](https://www.npmjs.com/package/@systemlabs/foundation-cli) | User-facing CLI — `foundation create`, `add`, `generate`, etc. |
| [`@systemlabs/foundation-core`](https://www.npmjs.com/package/@systemlabs/foundation-core) | Engine: dependency resolver, composition planner, file transaction |
| [`@systemlabs/foundation-modules`](https://www.npmjs.com/package/@systemlabs/foundation-modules) | All built-in modules (frontend, backend, database, auth, …) |
| **`@systemlabs/foundation-plugin-sdk`** | ← **you are here** — plugin contract, types, manifest schema |
| [`@systemlabs/foundation-testing`](https://www.npmjs.com/package/@systemlabs/foundation-testing) | Test utilities for module and plugin authors |

---

## License

MIT — see [LICENSE](https://github.com/ronak-create/Foundation-Cli/blob/main/LICENSE)