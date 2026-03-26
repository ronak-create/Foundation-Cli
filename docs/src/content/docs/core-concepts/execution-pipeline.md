---
title: Execution Pipeline
description: The 14-stage execution pipeline that scaffolds projects - from prompts to files on disk
---



The execution pipeline transforms a resolved module set into a working project on disk. It handles file rendering, atomic writes, dependency installation, and lifecycle hooks.

## Pipeline Stages

```
runExecutionPipeline(plan, options)
│
├─ 1. beforeWrite hooks
│   │   (strict: false - best effort)
│   │
├─ 2. FileTransaction.open()
│   │   Creates staging dir in os.tmpdir()
│   │
├─ 3. Stage all files
│   │   Write to staging dir
│   │   Snapshot existing files for rollback
│   │
├─ 4. applyAllPatches()
│   │   Config file merges (package.json, tsconfig.json, etc.)
│   │
├─ 5. beforeInstall hooks
│   │   Modify install plan
│   │
├─ 6. writeDepsToPackageJson() + installDependencies()
│   │   Node (npm/pnpm/yarn) + Python (pip) concurrent
│   │
├─ 7. afterInstall hooks
│   │   Run post-install scripts (e.g., prisma generate)
│   │
├─ 8. FileTransaction.commit()
│   │   Atomic rename per file
│   │
├─ 9. afterWrite hooks
│   │
├─ 10. onFinalize hooks
│    │   Print post-install instructions
│    │
├─ 11. writeProjectState()
│    │   .foundation/project.lock + foundation.config.json
│    │
└─ On failure: onRollback hooks → re-throw error
```

## FileTransaction

FileTransaction ensures atomic writes:

```
new FileTransaction({ projectRoot })  → state: "idle"
.open()                                 → state: "open"
.stage(relativePath, content) × N       → writes to staging dir
.commit()                               → state: "committed"
.rollback()                             → state: "rolled-back"
```

On failure, `rollback()` restores any modified files.

## Config Merging

The pipeline applies config patches with type-specific strategies:

| File | Strategy |
|------|----------|
| `package.json` | Deep merge + dependency version guard |
| `tsconfig.json` | Deep merge |
| `.env` / `.env.example` | Key deduplication — later wins |
| `requirements.txt` | Semver intersection |
| `docker-compose.yml` | Service-level merge |
| `README.md` | Section inject |
| `Dockerfile` | Instruction merge |

## Dependency Installation

Node and Python dependencies install concurrently:

```typescript
const [nodeResult, pyResult] = await Promise.all([
  installNodeDependencies(plan.dependencies),
  installPythonDependencies(plan.dependencies),
]);
```

Script collisions are handled via `npm-run-all2` composite scripts.

## Error Handling

- All hooks run in try-catch
- `onRollback` hooks execute on failure (errors swallowed)
- Original error is re-thrown after rollback

## Related

- [Hooks Reference](/core-concepts/hooks/) — All 14 hooks
- [Config Merging](/advanced/config-merging/) — Deep dive
- [State Files](/core-concepts/architecture/) — .foundation/ files
