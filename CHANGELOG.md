# Changelog

All notable changes to Foundation CLI are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).  
Versions follow [Semantic Versioning](https://semver.org/).

---
 
## [Unreleased]
 
### Added
<!-- New features and modules go here before they are released -->
 
### Fixed
<!-- Bug fixes -->
 
### Changed
<!-- Changes to existing behaviour -->
 
### Deprecated
<!-- Features that will be removed in a future version -->
 
### Removed
<!-- Features removed in this version -->
 
### Breaking Changes
<!-- Breaking changes with migration instructions -->
 
---

## [0.2.1] — 2025-03-15

### Added

- **ORM Service** — portable model layer; supports Prisma, TypeORM, Mongoose, SQLAlchemy with all four relation types
- **`foundation generate model / crud`** — interactive code generator, ORM-aware output
- **`foundation add`** — add built-in modules or community plugins to an existing project
- **`foundation switch`** — safely swap ORM, backend, or database without manually editing files
- **`foundation info / doctor / validate`** — project health and inspection commands
- **`foundation dev / db / test`** — dev automation delegating to npm/pip scripts
- **`foundation ai`** — opt-in AI assistant (requires `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`)
- **14 lifecycle hooks** — full hook surface for module and plugin authors

### Packages published

- `@systemlabs/foundation-cli@0.2.1`
- `@systemlabs/foundation-core@0.2.1`
- `@systemlabs/foundation-modules@0.2.1`
- `@systemlabs/foundation-plugin-sdk@0.2.1`
- `@systemlabs/foundation-testing@0.2.1`

---

## [0.1.0] - 2025-03-10

### Added
- base project skeleton
- **`foundation create`** — interactive full-stack project scaffolding with archetype presets (`saas`, `ai-app`, `ecommerce`, `api-backend`, `internal-tool`, `crm`, `dashboard`)
- **30+ built-in modules** across 9 categories: frontend, backend, database, ORM, auth, UI, state management, deployment, add-ons
- **Dependency resolver** — capability-based DAG resolution with auto-injection, conflict detection, and topological sort via Kahn's algorithm
- **`foundation eject`** — copy module files into project for full customisation
- **`foundation upgrade`** — upgrade modules via the project lockfile
- **`foundation create-plugin`** — scaffold a new community plugin package
- **FileTransaction** — atomic file writes; rollback on any failure
- **Sandboxed plugin execution** — third-party hooks cannot access paths outside `projectRoot`
- **CI mode** — non-interactive scaffolding via `--preset` flag; auto-detected from `CI`/`NO_TTY` env vars

### Packages published

- `@systemlabs/foundation-cli@0.1.0`
- `@systemlabs/foundation-core@0.1.0`
- `@systemlabs/foundation-modules@0.1.0`
- `@systemlabs/foundation-plugin-sdk@0.1.0`
- `@systemlabs/foundation-testing@0.1.0`

---

[Unreleased]: https://github.com/ronak-create/Foundation-Cli/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/ronak-create/Foundation-Cli/releases/tag/v0.1.0