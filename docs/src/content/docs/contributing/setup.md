---
title: Development Setup
description: How to set up Foundation CLI for local development
---



Get Foundation CLI running locally for development.

## Prerequisites

- Node.js ≥ 18
- pnpm ≥ 9
- Git

## Clone and Install

```bash
git clone https://github.com/ronak-create/Foundation-Cli.git
cd Foundation-Cli
pnpm install
```

## Build

```bash
pnpm turbo build
```

Build order: `plugin-sdk → core → modules → cli`

## Run Locally

```bash
# Using node directly
node packages/cli/dist/bin.js create my-app

# Or link for easier testing
cd packages/cli
npm link
foundation create my-test-app
```

## Development Commands

```bash
pnpm turbo build       # Build all (cached)
pnpm turbo dev         # Watch mode
pnpm turbo typecheck   # Type-check without emitting
pnpm turbo test        # All tests
pnpm turbo lint        # Lint all packages
```

## Running Tests

```bash
# All packages
pnpm turbo test

# Single package
cd packages/core && pnpm test
cd packages/modules && pnpm test
cd packages/cli && pnpm test
```

## Package Structure

```
packages/
├── plugin-sdk/   # Public plugin contract
├── core/         # Engine
├── modules/      # Built-in modules
├── testing/     # Test utilities
└── cli/          # User-facing CLI
```

## Related

- [Contributing](/contributing/) — Full guide
- [Architecture](/core-concepts/architecture/) — System design
- [Adding a Module](/contributing/adding-module/) — Add new modules
