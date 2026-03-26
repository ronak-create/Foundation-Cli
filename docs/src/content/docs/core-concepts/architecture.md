---
title: Architecture
description: Foundation CLI architecture - package topology, data flow, and system design
---



Foundation CLI is a dependency-aware project assembler built as a pnpm monorepo.

## Package Topology

```
plugin-sdk  →  core  →  modules  →  cli
                    ↑
                testing (devDep)
```

Build order enforced by Turbo `dependsOn: ["^build"]`.

### Packages

| Package | npm | Role |
|---------|-----|------|
| `plugin-sdk` | `@systemlabs/foundation-plugin-sdk` | Public plugin contract — types, schema, validateManifest |
| `core` | `@systemlabs/foundation-core` | Engine — resolver, planner, pipeline, ORM service, sandbox |
| `modules` | `@systemlabs/foundation-modules` | All first-party PluginDefinitions (30+ modules) |
| `testing` | `@systemlabs/foundation-testing` | Test fixtures for module/plugin authors |
| `cli` | `@systemlabs/foundation-cli` | User-facing CLI — commands, prompts, UI |

## Data Flow: `foundation create`

```
CLI Args + ENV
       │
       ▼
PromptGraph Engine ──────────► SelectionMap
       │                        (frontend, backend, database, orm, auth, ui, state, deployment)
       ▼
ModuleRegistry.resolve(selections) ──► ModuleInstance[]
       │
       ▼
Dependency Resolver ──────────► ResolutionResult
       │    - validate IDs
       │    - enforce lifecycle status
       │    - build CapabilityMap
       │    - expand requires (auto-inject)
       │    - conflict check
       │    - topological sort
       ▼
Composition Planner ─────────► CompositionPlan
       │    - merges file trees
       │    - evaluates FileEntry.when
       │    - ORM schema files injected
       ▼
Execution Pipeline ───────────► Project on disk
       │    - beforeWrite hooks
       │    - FileTransaction (atomic write)
       │    - applyAllPatches
       │    - install dependencies
       │    - afterWrite hooks
       │    - writeProjectState()
       ▼
Done
```

## Core Subsystems

### Module Registry
- Loads, validates, indexes modules
- Manages capability tokens

### Dependency Resolver
- DAG-based resolution with capability tokens
- Topological sort via Kahn's algorithm
- Conflict detection

### Composition Planner
- Merges file trees and config patches
- Evaluates conditional files (`FileEntry.when`)
- Generates execution plan

### Execution Pipeline
- 14 lifecycle hooks
- Atomic file writes via FileTransaction
- Dependency installation (Node + Python)

### ORM Service
- Provider registration (Prisma, TypeORM, Mongoose, SQLAlchemy)
- Schema file generation
- Model registration

### Generator Service
- Registry for code generators
- Invoked by `foundation generate`

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Capability tokens instead of direct module IDs | Decouples modules — auth-jwt doesn't need to know which database |
| worker_threads over vm.Script for sandbox | Eliminates Function constructor escape |
| Atomic writes via FileTransaction | No partial scaffolds on failure |
| Credential override-merge (.env) | Real credentials win over placeholders |

## Related

- [Module System](/core-concepts/module-system/) — How modules work
- [Dependency Resolution](/core-concepts/dependency-resolution/) — DAG resolver details
- [Execution Pipeline](/core-concepts/execution-pipeline/) — 14 hooks explained
- [Hooks](/core-concepts/hooks/) — Lifecycle hooks reference
