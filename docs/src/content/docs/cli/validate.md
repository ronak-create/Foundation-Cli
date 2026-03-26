---
title: foundation validate
description: Validate project.lock and foundation.config.json consistency
---



Validate project state files for consistency.

## Syntax

```bash
foundation validate
```

## Checks

- CLI version matches lockfile
- All modules in lockfile exist in registry
- All plugins in lockfile exist in registry
- Config selections match lockfile modules
- No deprecated/removed modules

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Valid |
| 1 | Invalid |

## Related

- [CLI Overview](/cli/) — All commands
- [foundation info](/cli/info/) — Project summary
- [foundation doctor](/cli/doctor/) — Health checks
