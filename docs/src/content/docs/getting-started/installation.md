---
title: Installation
description: How to install Foundation CLI using npx, npm, pnpm, or yarn
---



Foundation CLI works as a standalone binary — no installation required for casual use.

## One-Shot (Recommended for Quick Try)

```bash
npx @systemlabs/foundation-cli create my-app
```

This downloads and runs the CLI on demand.

## Global Install

### npm

```bash
npm install -g @systemlabs/foundation-cli
foundation create my-app
```

### pnpm

```bash
pnpm add -g @systemlabs/foundation-cli
foundation create my-app
```

### yarn

```bash
yarn global add @systemlabs/foundation-cli
foundation create my-app
```

## Verify Installation

```bash
foundation --version
```

Expected output: `0.3.x` (or higher)

## Requirements

| Requirement | Version |
|-------------|---------|
| Node.js | ≥ 18 |
| npm / pnpm / yarn | Latest |

## Local Development

To work on Foundation CLI itself:

```bash
git clone https://github.com/ronak-create/Foundation-Cli.git
cd Foundation-Cli
pnpm install
pnpm turbo build

# Run locally
node packages/cli/dist/bin.js create my-app
```

Or link for easier testing:

```bash
cd packages/cli
npm link
foundation create my-test-app
```

## Related

- [Quick Start](/getting-started/quick-start/) — Get running in 30 seconds
- [Your First Project](/getting-started/first-project/) — Full walkthrough
- [CI Mode](/getting-started/ci-mode/) — Non-interactive usage
