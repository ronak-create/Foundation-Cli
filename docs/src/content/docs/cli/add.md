---
title: foundation add
description: Add modules or plugins to an existing Foundation project
---


Add a built-in module or community plugin to an existing project.

## Syntax

```bash
foundation add <module> [options]
```

## Arguments

| Argument | Description | Required |
|----------|-------------|----------|
| `module` | Module name, addon, or npm package | Yes |

## Module Types

### Built-in Modules
```bash
foundation add orm-prisma
foundation add auth-jwt
foundation add ui-shadcn
```

### Official Add-ons
```bash
foundation add stripe
foundation add redis
foundation add openai
```

### Community Plugins (npm)
```bash
foundation add foundation-plugin-my-plugin
foundation add @myorg/foundation-plugin-custom
```

## Options

| Option | Description |
|--------|-------------|
| `--yes` | Skip confirmations |
| `--ci` | Force CI mode |

## Examples

### Add an ORM

```bash
foundation add orm-prisma
```

### Add an Add-on

```bash
foundation add stripe
# Adds payment files to src/payments/
```

### Add Community Plugin

```bash
foundation add foundation-plugin-sentry
```

## What Happens

1. **Resolve** — Finds module in registry or npm
2. **Conflict Check** — Validates compatibility
3. **Plan** — Creates composition plan
4. **Scaffold** — Writes new files
5. **Install** — Installs dependencies
6. **Update** — Updates lockfile and config

## Related

- [CLI Overview](/cli/) — All commands
- [Modules](/modules/addons/) — Official add-ons
- [foundation switch](/cli/switch/) — Swap modules
