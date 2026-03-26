---
title: CI Mode
description: Use Foundation CLI in automated environments, CI/CD pipelines, and non-interactive shells
---



Foundation CLI detects CI environments automatically and switches to non-interactive mode when needed.

## Auto-Detection

CI mode activates when any of these are true:

1. `CI=true` or `CI=1` environment variable
2. `NO_TTY=true` or `NO_TTY=1` environment variable
3. `process.stdout.isTTY` is falsy

## Usage with Presets

Use `--preset` to skip all prompts:

```bash
foundation create my-api --preset api-backend
```

### Available Presets

| Preset | Frontend | Backend | Database | ORM | Auth | UI | Deploy |
|--------|----------|---------|----------|-----|------|-----|--------|
| `saas` | Next.js | Express | PostgreSQL | Prisma | JWT | Tailwind | Docker |
| `ai-app` | Next.js | Express | PostgreSQL | Prisma | JWT | Tailwind | Docker |
| `ecommerce` | Next.js | Express | PostgreSQL | Prisma | Session | ShadCN | Docker |
| `api-backend` | — | Express | PostgreSQL | Prisma | JWT | — | Docker |
| `internal-tool` | Next.js | Express | PostgreSQL | Prisma | JWT | Tailwind | — |
| `crm` | Next.js | NestJS | PostgreSQL | Prisma | OAuth | MUI | Docker |
| `dashboard` | Next.js | Express | PostgreSQL | Prisma | JWT | ShadCN | Vercel |

## Environment Variables

### Configuration

| Variable | Description |
|----------|-------------|
| `FOUNDATION_PRESET` | Equivalent to `--preset` flag |
| `FOUNDATION_SKIP_INSTALL` | Skip dependency installation |
| `FOUNDATION_NO_PROMPTS` | Non-interactive mode |

### AI Features (Optional)

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | For `foundation ai` command |
| `OPENAI_API_KEY` | Alternative for `foundation ai` |

## CI Examples

### GitHub Actions

```yaml
- name: Create project
  run: |
    npx @systemlabs/foundation-cli create api \
      --preset api-backend \
      --yes
  env:
    CI: true
```

### GitLab CI

```yaml
create-project:
  script:
    - npx @systemlabs/foundation-cli create api --preset api-backend --yes
  variables:
    CI: "true"
```

### Docker

```dockerfile
RUN npx @systemlabs/foundation-cli create app --preset saas --yes
```

## Programmatic Usage

You can also import Foundation CLI as a library:

```typescript
import { createProject } from '@systemlabs/foundation-core';

await createProject({
  name: 'my-app',
  preset: 'saas',
  options: {
    skipInstall: false,
    outputDir: './output',
  },
});
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Error (module not found, conflict, etc.) |

## Related

- [Quick Start](/getting-started/quick-start/) — Interactive mode
- [CLI Overview](/cli/) — All commands
- [Create Command](/cli/create/) — Full create documentation
