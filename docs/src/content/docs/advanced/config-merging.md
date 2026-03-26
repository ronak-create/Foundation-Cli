---
title: Config Merging
description: How Foundation CLI merges configuration files without conflicts
---



Foundation CLI deep-merges config files from multiple modules without conflicts.

## Merge Strategies

| File Pattern | Strategy |
|--------------|----------|
| `package.json` | Deep merge + dep version guard + script collision handling |
| `tsconfig.json` | Deep merge |
| `.env` / `.env.example` | Key deduplication — later module wins |
| `requirements.txt` | Semver intersection |
| `docker-compose.yml` | Service-level merge |
| `README.md` | Section inject (appends under matching header) |
| `Dockerfile` | Instruction merge (inserts before final CMD/ENTRYPOINT) |

## package.json Details

### Dependencies

```json
{
  "dependencies": {
    "express": "^4.18.0",
    "cors": "^2.8.5"
  }
}
```

Deep merge combines all modules' dependencies. Version conflicts throw errors.

### Scripts

When two modules declare the same script:

```json
{
  "scripts": {
    "dev": "ts-node src/server.ts"
  }
}
```

Collision handling:
1. Each gets namespaced: `dev:server`, `dev:next`
2. Composite script created: `npm-run-all2 --parallel dev:*`
3. `npm-run-all2` auto-injected as devDependency

## .env Details

```bash
# Module A
DATABASE_URL=postgres://localhost:5432/db

# Module B  
DATABASE_URL=postgres://user:pass@localhost:5432/db
```

**INCOMING WINS** — later modules override earlier ones. This ensures credentials override placeholders.

## Custom Merges

Modules can implement `onMerge` hook for custom file types:

```typescript
hooks: {
  onMerge: async (ctx, file, existing) => {
    // Custom merge logic
    return mergeResults;
  },
}
```

## Related

- [Execution Pipeline](/core-concepts/execution-pipeline/)
- [Module Manifest](/reference/module-manifest/)
