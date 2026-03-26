---
title: Commit Conventions
description: Conventional commits format for Foundation CLI contributions
---



Foundation CLI uses [Conventional Commits](https://www.conventionalcommits.org/).

## Format

```
<type>(<scope>): <short summary>

[optional body]

[optional footer]
```

## Types

| Type | When to Use |
|------|-------------|
| `feat` | New feature or module |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `test` | Tests only |
| `refactor` | Refactor without behavior change |
| `perf` | Performance improvement |
| `chore` | Build system, dependencies, tooling |
| `ci` | CI/CD pipeline changes |

## Scopes

Optional but encouraged: `cli`, `core`, `modules`, `plugin-sdk`, `testing`, `resolver`, `pipeline`, `orm`, `generator`, `docs`

## Examples

```
feat(modules): add Hono backend module
fix(core): resolver auto-inject fails when capability has no provider
docs(contributing): add ORM module extra steps checklist
test(core): add snapshot tests for Prisma relation generation
chore(deps): bump vitest to 2.0
```

## Breaking Changes

Include `BREAKING CHANGE:` in footer:

```
feat(plugin-sdk)!: rename PluginHookContext.config to PluginHookContext.vars

BREAKING CHANGE: ctx.config is now ctx.vars in all hook implementations.
```

## Related

- [Contributing: Setup](/contributing/setup/)
- [Pull Request Process](/contributing/setup/)
