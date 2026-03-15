# @systemlabs/foundation-testing

> Shared test utilities and fixtures for Foundation CLI module and plugin authors.

This package provides helpers for writing unit and integration tests against Foundation modules and plugins. It is a `devDependency` / `peerDependency` — it is never included in generated project output.

```bash
npm install --save-dev @systemlabs/foundation-testing
```

---

## What's in this package

| Export | Description |
|--------|-------------|
| `makeManifestFixture(overrides?)` | Creates a valid `ModuleManifest` with sensible defaults — override any field |
| `createTempDir()` | Creates a unique temporary directory for a test; returns its path and a `cleanup()` function |
| `makeRegistryFixture(modules?)` | Creates a minimal module registry pre-loaded with the provided modules |
| `makeContextFixture(overrides?)` | Creates a `HookContext` suitable for passing into hook tests |

---

## Usage

### Testing a manifest

```typescript
import { makeManifestFixture } from '@systemlabs/foundation-testing';
import { validateManifest } from '@systemlabs/foundation-plugin-sdk';
import { describe, it, expect } from 'vitest';

describe('my-plugin manifest', () => {
  it('passes schema validation', () => {
    const manifest = makeManifestFixture({
      id:       'my-plugin',
      name:     'My Plugin',
      category: 'addon',
    });

    const result = validateManifest(manifest);
    expect(result.valid).toBe(true);
  });
});
```

### Testing file output

```typescript
import { createTempDir } from '@systemlabs/foundation-testing';
import { FileTransaction } from '@systemlabs/foundation-core';
import { readFileSync } from 'node:fs';
import { describe, it, expect, afterEach } from 'vitest';

describe('my-plugin file output', () => {
  const { dir, cleanup } = createTempDir();
  afterEach(cleanup);

  it('writes client.ts to src/my-plugin/', async () => {
    const tx = new FileTransaction(dir);
    tx.stage([{ path: 'src/my-plugin/client.ts', content: 'export {}' }]);
    await tx.commit();

    const content = readFileSync(`${dir}/src/my-plugin/client.ts`, 'utf8');
    expect(content).toBe('export {}');
  });
});
```

### Testing lifecycle hooks

```typescript
import { makeContextFixture, makeRegistryFixture } from '@systemlabs/foundation-testing';
import myPlugin from '../src/index.js';
import { describe, it, expect } from 'vitest';

describe('my-plugin onFinalize hook', () => {
  it('logs a setup message', async () => {
    const messages: string[] = [];
    const ctx = makeContextFixture({
      logger: { info: (m: string) => messages.push(m) },
      registry: makeRegistryFixture(),
    });

    await myPlugin.hooks?.onFinalize?.(ctx);

    expect(messages.some(m => m.includes('MY_API_KEY'))).toBe(true);
  });
});
```

---

## Test strategy for Foundation modules

The Foundation CLI test suite uses four layers. When writing tests for your own modules, follow the same pattern:

**Unit tests** (Vitest) — test the resolver, merger strategies, manifest validation, ORM service, and generator service in isolation.

**Integration tests** — compose 2–5 modules together, validate the output file structure against expected paths and content.

**Snapshot tests** — lock in generated file content for known-good module combinations. Run `vitest --update-snapshots` intentionally when output changes.

**Compilation tests** — pipe the generated TypeScript/Python through the compiler and assert zero errors.

---

## Requirements

- Node.js ≥ 18
- Vitest ≥ 1.6 (peer dependency)

---

## Part of the Foundation CLI ecosystem

| Package | Description |
|---------|-------------|
| [`@systemlabs/foundation-cli`](https://www.npmjs.com/package/@systemlabs/foundation-cli) | User-facing CLI — `foundation create`, `add`, `generate`, etc. |
| [`@systemlabs/foundation-core`](https://www.npmjs.com/package/@systemlabs/foundation-core) | Engine: dependency resolver, composition planner, file transaction |
| [`@systemlabs/foundation-modules`](https://www.npmjs.com/package/@systemlabs/foundation-modules) | All built-in modules (frontend, backend, database, auth, …) |
| [`@systemlabs/foundation-plugin-sdk`](https://www.npmjs.com/package/@systemlabs/foundation-plugin-sdk) | Plugin contract, types, manifest schema |
| **`@systemlabs/foundation-testing`** | ← **you are here** — test utilities |

---

## License

MIT — see [LICENSE](https://github.com/ronak-create/Foundation-Cli/blob/main/LICENSE)