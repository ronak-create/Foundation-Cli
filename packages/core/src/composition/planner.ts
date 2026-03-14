import type {
  ModuleManifest,
  FileEntry,
  PackageDependency,
  ConfigPatch,
} from "@systemlabs/foundation-plugin-sdk";
import type { CompositionPlan } from "../types.js";
import {
  DuplicateFilePathError,
  ConflictingDependencyVersionError,
} from "../errors.js";
import type { ORMService } from "../orm/orm-service.js";

// ── Conflict types ────────────────────────────────────────────────────────────

/** One module's claim on a specific package version. */
export interface DepClaim {
  readonly moduleId: string;
  readonly version: string;
}

/** All conflicting claims for a single package name+scope. */
export interface DependencyConflict {
  readonly packageName: string;
  readonly scope: string;
  readonly claims: ReadonlyArray<DepClaim>;
}

// ── detectDependencyConflicts ─────────────────────────────────────────────────

/**
 * Scans `orderedModules` and returns every dependency where two or more
 * modules request different version strings. Same-version duplicates are
 * silently ignored (not a conflict).
 *
 * Does NOT throw — consumers decide how to handle conflicts.
 */
export function detectDependencyConflicts(
  orderedModules: ReadonlyArray<ModuleManifest>,
): DependencyConflict[] {
  // key → { version → Set<moduleId> }
  const seen = new Map<string, Map<string, Set<string>>>();

  for (const manifest of orderedModules) {
    for (const dep of manifest.dependencies ?? []) {
      const key = `${dep.scope}::${dep.name}`;
      if (!seen.has(key)) seen.set(key, new Map());
      const byVersion = seen.get(key)!;
      if (!byVersion.has(dep.version)) byVersion.set(dep.version, new Set());
      byVersion.get(dep.version)!.add(manifest.id);
    }
  }

  const conflicts: DependencyConflict[] = [];

  for (const [key, byVersion] of seen) {
    if (byVersion.size <= 1) continue; // no conflict
    const [scope, ...nameParts] = key.split("::");
    const packageName = nameParts.join("::");
    const claims: DepClaim[] = [];
    for (const [version, moduleIds] of byVersion) {
      for (const moduleId of moduleIds) {
        claims.push({ moduleId, version });
      }
    }
    conflicts.push({ packageName, scope: scope!, claims });
  }

  return conflicts;
}

// ── buildCompositionPlan ──────────────────────────────────────────────────────

/**
 * Builds a CompositionPlan from an ordered list of ModuleManifests.
 *
 * Throws `ConflictingDependencyVersionError` if any two modules declare
 * the same package at different versions. Use `detectDependencyConflicts`
 * + `buildCompositionPlanWithOverrides` for interactive conflict resolution.
 *
 * @param orderedModules  Topologically-sorted module manifests.
 * @param orm             Optional ORMService from the active ModuleRegistry.
 *                        When supplied and a provider + models are registered,
 *                        generated schema files are merged into the plan.
 */
export function buildCompositionPlan(
  orderedModules: ReadonlyArray<ModuleManifest>,
  orm?: ORMService,
): CompositionPlan {
  return buildCompositionPlanWithOverrides(orderedModules, new Map(), orm);
}

// ── buildCompositionPlanWithOverrides ─────────────────────────────────────────

/**
 * Like `buildCompositionPlan` but accepts a resolution map that pins specific
 * package names to a chosen version, overriding any conflicting declarations.
 *
 * `versionOverrides` maps `"${scope}::${packageName}"` → chosen version string.
 *
 * When an override is present, all modules' declarations for that package are
 * collapsed to the chosen version — no error is thrown.
 * When no override is present and a conflict exists, throws as before.
 *
 * @param orderedModules   Topologically-sorted module manifests.
 * @param versionOverrides Package version override map.
 * @param orm              Optional ORMService. When provided and a provider +
 *                         models are registered, schema files are injected.
 */
export function buildCompositionPlanWithOverrides(
  orderedModules: ReadonlyArray<ModuleManifest>,
  versionOverrides: ReadonlyMap<string, string>,
  orm?: ORMService,
): CompositionPlan {
  const fileMap = new Map<string, { entry: FileEntry; sourceModuleId: string }>();
  const depMap  = new Map<string, { dep: PackageDependency; sourceModuleId: string }>();
  const configPatches: ConfigPatch[] = [];

  for (const manifest of orderedModules) {
    // ── Files ────────────────────────────────────────────────────────────────
    for (const fileEntry of manifest.files ?? []) {
      const existing = fileMap.get(fileEntry.relativePath);
      if (existing !== undefined) {
        if (fileEntry.overwrite === true) {
          fileMap.set(fileEntry.relativePath, { entry: fileEntry, sourceModuleId: manifest.id });
        } else {
          throw new DuplicateFilePathError(fileEntry.relativePath, existing.sourceModuleId, manifest.id);
        }
      } else {
        fileMap.set(fileEntry.relativePath, { entry: fileEntry, sourceModuleId: manifest.id });
      }
    }

    // ── Dependencies ─────────────────────────────────────────────────────────
    for (const dep of manifest.dependencies ?? []) {
      const key = `${dep.scope}::${dep.name}`;

      // Apply override if present
      const chosenVersion = versionOverrides.get(key) ?? dep.version;
      const resolvedDep: PackageDependency = chosenVersion !== dep.version
        ? { ...dep, version: chosenVersion }
        : dep;

      const existing = depMap.get(key);
      if (existing !== undefined) {
        if (existing.dep.version !== resolvedDep.version) {
          // Override didn't cover this — hard conflict
          throw new ConflictingDependencyVersionError(dep.name, existing.dep.version, resolvedDep.version);
        }
        // Same version after resolution — deduplicate silently
      } else {
        depMap.set(key, { dep: resolvedDep, sourceModuleId: manifest.id });
      }
    }

    // ── Config patches ────────────────────────────────────────────────────────
    for (const patch of manifest.configPatches ?? []) {
      configPatches.push(patch);
    }
  }

  // ── ORM schema file injection ─────────────────────────────────────────────
  // When an ORMService is provided and both a provider and models are
  // registered, merge the provider-generated schema files into the plan.
  // Provider files use implicit overwrite semantics: they supersede any
  // stub file the ORM module declared (e.g. the base prisma/schema.prisma)
  // because they include all registered models.
  if (orm !== undefined) {
    const schemaFiles = orm.buildSchemaFiles();
    const providerId = orm.getProvider()?.id ?? "orm";
    for (const schemaFile of schemaFiles) {
      fileMap.set(schemaFile.relativePath, {
        entry: { ...schemaFile, overwrite: true },
        sourceModuleId: providerId,
      });
    }
  }

  return {
    files:          Array.from(fileMap.values()).map((v) => v.entry),
    dependencies:   Array.from(depMap.values()).map((v) => v.dep),
    configPatches,
    orderedModules,
  };
}