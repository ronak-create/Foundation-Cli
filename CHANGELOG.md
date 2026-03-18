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

## [0.3.0] — 2026-03-18

### Security

- **Plugin sandbox replaced** — `vm.Script` execution swapped for `worker_threads` Worker isolation. Eliminates the `Promise.constructor.constructor("return process")()` escape path; worker context is physically separate from the parent V8 realm.
- **Shell injection closed** — `execaCommand` string interpolation in `npm-fetcher` replaced with `execa` array-args; user-supplied plugin names/versions are never shell-parsed.
- **Path traversal guard** — `fetchPluginFromDirectory` now validates `file:` plugin paths are within the project root before opening any file.
- **EJS output encoding** — Identity escape function injected into `renderTemplate`; generated `.ts`/`.py` files no longer HTML-encode apostrophes (`o'reilly` → was `o&#39;reilly`).
- **Hook context hardened** — `ctx.config.__registry` now exposes a `RegistryAccessor` (ORM/generator surface only) instead of the raw `ModuleRegistry`. `ctx.config` is `Object.freeze`d.

### Fixed

- **ORM schema files now appear in scaffolded projects** — `create` bootstraps ORM `onRegister` hooks before calling `buildCompositionPlan`, so `registry.orm.buildSchemaFiles()` has an active provider.
- **`foundation generate crud` no longer crashes** — `tsType`/`pyType` were called as EJS variables but never injected into scope (ReferenceError). Both functions are now in the template variable map.
- **`FileEntry.when` conditions evaluated** — `{ when: "deployment.docker" }` now correctly gates file inclusion against user selections. Previously all files were always included.
- **`foundation generate` ORM bootstrap scoped** — Only `orm`-category modules fire `onRegister` during generate. Previously all installed modules re-fired hooks, risking double-execution of non-idempotent hooks.
- **`globals.css` duplicate path** — `ui-shadcn` now declares `overwrite: true` on `src/app/globals.css`, resolving the `DuplicateFilePathError` when combining Next.js + ShadCN.
- **Python install on 3.11+** — `installPythonDependencies` creates a `.venv` before running pip, fixing PEP 668 "externally-managed-environment" errors.
- **`FOUNDATION_CLI_VERSION`** — Read from `package.json` at runtime instead of hardcoded `"0.0.1"`.
- **Dropped selections now warn** — `selectionsToModuleIds` writes a `stderr` warning instead of silently omitting a module with no match.

### Changed

- **Archetypes differentiated** — `ai-app` (TanStack Query), `ecommerce` (session auth, ShadCN, Zustand), `crm` (NestJS, OAuth, MUI, Redux), `dashboard` (ShadCN, TanStack Query, Vercel) now have distinct stacks.
- **Stripe plugin populated** — `foundation add stripe` now writes real webhook handler, client, and type files instead of empty stubs.
- **`parseLockfile` hardened** — Per-field type guards on `modules[].id` and `modules[].version`; malformed entries are skipped rather than poisoning the array.
- **`requiremenets-merge.ts` renamed** — Corrected to `requirements-merge.ts`.
- **`tsup.config.ts`** — `worker-host.ts` added as a separate build entry so it emits as `dist/sandbox/worker-host.js`.

### Breaking Changes

- `SandboxLogger` type removed from `@systemlabs/foundation-core` exports (was unused by all built-in modules).
- `buildCompositionPlan(orderedModules, orm?)` signature extended to `buildCompositionPlan(orderedModules, orm?, selections?)`. Existing callers with two args are unaffected.

### Packages published

- `@systemlabs/foundation-cli@0.3.0`
- `@systemlabs/foundation-core@0.3.0`
- `@systemlabs/foundation-modules@0.3.0`
- `@systemlabs/foundation-plugin-sdk@0.3.0`
- `@systemlabs/foundation-testing@0.3.0`

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

[Unreleased]: https://github.com/ronak-create/Foundation-Cli/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/ronak-create/Foundation-Cli/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/ronak-create/Foundation-Cli/compare/v0.1.0...v0.2.1
[0.1.0]: https://github.com/ronak-create/Foundation-Cli/releases/tag/v0.1.0