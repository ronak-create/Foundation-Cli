---
title: Plugins Overview
description: Foundation CLI plugin ecosystem - trust tiers, community plugins, official add-ons
---



Foundation CLI extends through plugins — npm packages that add modules, hooks, or integrations.

## Plugin Types

| Type | Source | Installation |
|------|--------|--------------|
| Built-in | Core packages | Pre-installed |
| Official Add-ons | Foundation CLI team | `foundation add stripe` |
| Community | npm (foundation-plugin keyword) | `foundation add <package>` |

## Trust Tiers

| Tier | Requirements | Badge |
|------|--------------|-------|
| Community | Published to npm with `foundation-plugin` keyword | None |
| Verified | Security audit passed | 🟢 Verified |
| Official | Maintained by Foundation CLI org | 🟣 Official |

## Official Add-ons

Pre-installed add-ons available via `foundation add`:

- [Stripe](/modules/addons/) — Payments
- [Redis](/modules/addons/) — Caching
- [OpenAI](/modules/addons/) — AI integration

## Finding Plugins

```bash
# Search npm
foundation search stripe

# Or browse
# https://www.npmjs.com/search?q=foundation-plugin
```

## Installing Plugins

```bash
# Add official
foundation add stripe

# Add community
foundation add foundation-plugin-sentry
```

## Related

- [CLI: add](/cli/add/)
- [CLI: search](/cli/search/)
- [CLI: plugins](/cli/plugins/)
- [Writing a Plugin](/plugins/writing/)
