---
title: Testing
description: Testing strategy and running tests for Foundation CLI
---



Foundation CLI uses Vitest for unit and integration tests.

## Test Strategy

| Layer | Tool | Coverage |
|-------|------|----------|
| Unit | Vitest | Resolver logic, merger strategies, manifest validation |
| Integration | Vitest | Compose 2-5 modules, validate output |
| Snapshot | Vitest | Generated file content |

## Running Tests

```bash
# All packages
pnpm turbo test

# Single package
cd packages/core && pnpm test
cd packages/modules && pnpm test
cd packages/cli && pnpm test

# Watch mode
cd packages/core && pnpm test --watch

# Update snapshots
pnpm turbo test -- --update-snapshots
```

## Test Utilities

Use `@systemlabs/foundation-testing`:

```typescript
import {
  makeManifestFixture,
  createTempDir,
  makeRegistryFixture,
  makeContextFixture,
} from '@systemlabs/foundation-testing';
```

## Coverage Expectations

- New modules: manifest validation test + file output test + snapshot test
- Core subsystems: ≥ 80% branch coverage

## Related

- [Contributing: Setup](/contributing/setup/)
- [Adding a Module](/contributing/adding-module/)
