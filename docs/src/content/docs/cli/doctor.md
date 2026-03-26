---
title: foundation doctor
description: Run health checks on a Foundation project - Node version, env vars, compatibility
---



Run health checks on the current Foundation project.

## Syntax

```bash
foundation doctor
```

## Checks Performed

| Check | Description |
|-------|-------------|
| Node.js version | Must be ≥ 18 |
| Project presence | `.foundation/` directory exists |
| Lockfile integrity | `project.lock` is valid JSON |
| Config integrity | `foundation.config.json` is valid |
| CLI version match | Matches lockfile |
| Module registry | All lockfile modules still exist |
| Module lifecycle | No deprecated/removed modules |
| Conflict check | No active conflicts |
| .env completeness | All .env.example keys in .env |
| ORM provider | Valid provider registered |

## Output Example

```
┌─ Foundation Doctor ─────────────────────────────┐
│ ✔ Node.js version (18.17.0 ≥ 18)                │
│ ✔ Project presence (.foundation/ exists)        │
│ ✔ project.lock (valid JSON)                     │
│ ✔ foundation.config.json (valid JSON)            │
│ ✔ CLI version match (0.3.1)                     │
│ ✔ Module registry (all 6 modules exist)          │
│ ⚠ Module lifecycle (auth-jwt is experimental)   │
│ ✔ No conflicts detected                          │
│ ✔ .env complete (all keys present)              │
│ ✔ ORM provider (Prisma)                          │
└─────────────────────────────────────────────────┘
  Passed: 9  Warnings: 1  Failed: 0
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | All checks passed |
| 1 | One or more checks failed |

## Related

- [CLI Overview](/cli/) — All commands
- [foundation info](/cli/info/) — Project summary
- [foundation validate](/cli/validate/) — Validate state
