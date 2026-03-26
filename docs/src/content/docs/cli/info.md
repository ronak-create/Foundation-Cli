---
title: foundation info
description: Display project summary - stack, modules, ORM, plugins
---



Display a summary of the current Foundation project.

## Syntax

```bash
foundation info
```

## Output Example

```
Project: my-saas
├─ Stack
│  ├─ Frontend:   Next.js
│  ├─ Backend:    Express
│  ├─ Database:   PostgreSQL
│  ├─ ORM:        Prisma
│  ├─ Auth:       JWT
│  ├─ UI:         Tailwind CSS
│  ├─ State:      —
│  └─ Deploy:     Docker
├─ Plugins
│  └─ stripe (1.0.0)
├─ CLI Version:   0.3.1
└─ Package Manager: pnpm
```

## Related

- [CLI Overview](/cli/) — All commands
- [foundation doctor](/cli/doctor/) — Health checks
- [foundation validate](/cli/validate/) — Validate state
