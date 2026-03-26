---
title: Troubleshooting
description: Common issues and their solutions
---



Solutions to common Foundation CLI issues.

## Installation Issues

### "command not found: foundation"

**Solution:** Ensure CLI is installed globally:

```bash
npm install -g @systemlabs/foundation-cli
# or
pnpm add -g @systemlabs/foundation-cli
```

Or use npx:

```bash
npx @systemlabs/foundation-cli create my-app
```

### "Module not found" during create

**Solution:** Clear cache and retry:

```bash
rm -rf node_modules/.cache
foundation create my-app --yes
```

## Module Issues

### "Module conflicts with..."

**Solution:** Some modules are mutually exclusive:

- Auth modules conflict: JWT, OAuth, Session, Clerk, Auth0 — pick one
- Check [Modules: Auth](/modules/auth/) for conflicts

### "Missing required module"

**Solution:** The resolver auto-injects required modules. If you see this, it's a bug. Report at [GitHub Issues](https://github.com/ronak-create/Foundation-Cli/issues).

## Database Issues

### PostgreSQL connection refused

**Solution:** Ensure database is running:

```bash
docker-compose up -d db
# or
pg_ctl start
```

### Prisma: "Cannot find module"

```bash
cd my-app
npx prisma generate
```

## Dependency Issues

### npm install failed

**Solution:** Delete lockfile and node_modules, retry:

```bash
rm -rf node_modules package-lock.json
npm install
```

### Version conflicts

Foundation CLI uses semver. If you have conflicts:

```bash
foundation upgrade --dry-run
# to see what would change
```

## Development Issues

### Port already in use

```bash
# Find process on port 3000
lsof -i :3000
# Kill it
kill <PID>
```

### TypeScript errors

```bash
npm run typecheck
# Fix errors, then
npm run dev
```

## Docker Issues

### "container not found"

```bash
docker-compose up --build
# Rebuilds all containers
```

## Need More Help?

- [GitHub Issues](https://github.com/ronak-create/Foundation-Cli/issues)
- [GitHub Discussions](https://github.com/ronak-create/Foundation-Cli/discussions)

## Related

- [Error Codes](/reference/error-codes/)
- [CLI: doctor](/cli/doctor/)
- [CLI: validate](/cli/validate/)
