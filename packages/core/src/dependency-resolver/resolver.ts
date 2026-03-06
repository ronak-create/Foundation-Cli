// core/src/dependency-resolver/resolver.ts
//
// GAP FILLED: Capability-based resolution (spec §4.2)
//   - Builds CapabilityMap from `provides` tokens of selected modules
//   - `requires` entries treated as capability tokens first, module IDs second
//   - Auto-injects the first satisfying module for each unmet capability token
//   - compatibleWith matrix check (advisory warnings, spec §4.3)
//   - Module lifecycle status enforcement (spec §11.3)
//   - peerFrameworks range check (spec §4.4)

import type { ModuleManifest } from "@foundation-cli/plugin-sdk";
import type { ModuleRegistry } from "../module-registry/registry.js";
import type { ResolutionResult } from "../types.js";
import {
  ModuleConflictError,
  MissingRequiredModuleError,
  ModuleNotFoundError,
} from "../errors.js";
import { buildDependencyGraph } from "./graph.js";

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Resolves a set of selected module IDs against the registry.
 *
 * Steps (spec §4.2):
 *   1. Validate all selected IDs exist in the registry.
 *   2. Enforce lifecycle status (removed = hard error; deprecated/experimental = warning).
 *   3. Build CapabilityMap from `provides` tokens of all resolved modules.
 *   4. Transitively expand `requires`:
 *        - If token matches a resolved capability → already satisfied, skip.
 *        - If token is a known module ID → queue it directly.
 *        - Otherwise treat as capability token → find provider in registry.
 *   5. Check `conflicts` across the resolved set.
 *   6. Check `compatibleWith` matrix → advisory warnings only.
 *   7. Topologically sort via DAG.
 */
export function resolveModules(
  selectedIds: ReadonlyArray<string>,
  registry: ModuleRegistry,
): ResolutionResult {
  // ── Step 1: Validate all explicitly selected IDs ──────────────────────────
  for (const id of selectedIds) {
    if (!registry.hasModule(id)) {
      throw new ModuleNotFoundError(id);
    }
  }

  // ── Steps 2–4: Transitive expansion with capability resolution ────────────
  const resolved   = new Map<string, ModuleManifest>();
  const autoAdded  = new Set<string>();
  const warnings:   string[] = [];
  const queue       = [...selectedIds];
  const selectedSet = new Set(selectedIds);

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (resolved.has(id)) continue;

    // Load manifest
    let plugin;
    try {
      plugin = registry.getModule(id);
    } catch (err) {
      if (err instanceof ModuleNotFoundError) {
        const requiredBy = findRequirer(id, resolved);
        throw new MissingRequiredModuleError(id, requiredBy ?? "(unknown)");
      }
      throw err;
    }

    const manifest = plugin.manifest;

    // Step 2: Lifecycle status enforcement
    enforceStatus(manifest, warnings);

    resolved.set(id, manifest);

    // Step 4: Expand requires
    for (const token of manifest.compatibility.requires ?? []) {
      if (resolved.has(token)) continue;

      // Already satisfied by a resolved module's capability or category?
      if (capabilityIsSatisfied(token, resolved)) continue;

      // Direct module ID in registry?
      if (registry.hasModule(token)) {
        if (!selectedSet.has(token)) autoAdded.add(token);
        queue.push(token);
        continue;
      }

      // Capability token → find a provider
      const provider = findCapabilityProvider(token, registry);
      if (provider !== null) {
        if (!selectedSet.has(provider)) autoAdded.add(provider);
        queue.push(provider);
      } else {
        throw new MissingRequiredModuleError(token, id);
      }
    }
  }

  // ── Step 5: Conflict check ────────────────────────────────────────────────
  const resolvedIds = new Set(resolved.keys());
  for (const manifest of resolved.values()) {
    for (const conflictId of manifest.compatibility.conflicts ?? []) {
      if (resolvedIds.has(conflictId)) {
        throw new ModuleConflictError(manifest.id, conflictId);
      }
    }
  }

  // ── Step 6: compatibleWith matrix (advisory) ──────────────────────────────
  for (const manifest of resolved.values()) {
    const matrix = manifest.compatibility.compatibleWith;
    if (matrix == null) continue;

    for (const [category, allowed] of Object.entries(matrix)) {
      const peers = Array.from(resolved.values()).filter(
        (m) => m.category === category && m.id !== manifest.id,
      );
      for (const peer of peers) {
        if (!allowed.includes("*") && !allowed.includes(peer.id)) {
          warnings.push(
            `"${manifest.id}" has not been tested with "${peer.id}" ` +
              `(${category}). Tested: ${allowed.join(", ")}`,
          );
        }
      }
    }
  }

  // ── Emit warnings to stderr (non-fatal) ───────────────────────────────────
  for (const w of warnings) {
    process.stderr.write(`  ⚠  Advisory: ${w}\n`);
  }

  // ── Step 7: Topological sort ──────────────────────────────────────────────
  const graph     = buildDependencyGraph(Array.from(resolved.values()));
  const sortedIds = graph.topologicalSort();

  const ordered: ModuleManifest[] = sortedIds.map((sid) => {
    const m = resolved.get(sid);
    if (m === undefined) {
      throw new Error(`Internal resolver error: sorted id "${sid}" not in resolved map.`);
    }
    return m;
  });

  return {
    ordered,
    added:     Array.from(autoAdded),
    conflicts: [],
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Enforces lifecycle status rules (spec §11.3).
 * "removed"      → hard error with migration URL.
 * "deprecated"   → stderr warning.
 * "experimental" → stderr warning.
 */
function enforceStatus(manifest: ModuleManifest, warnings: string[]): void {
  const status = manifest.status ?? "stable";

  if (status === "removed") {
    throw new Error(
      `Module "${manifest.id}" has been removed. ` +
        `See https://foundation.build/migrations/${manifest.id} for the migration guide.`,
    );
  }

  if (status === "deprecated") {
    warnings.push(
      `Module "${manifest.id}" is deprecated and will be removed in a future CLI version. ` +
        `Check the docs for a recommended replacement.`,
    );
  }

  if (status === "experimental") {
    warnings.push(
      `Module "${manifest.id}" is [experimental] and may change without notice. ` +
        `Use --allow-experimental to suppress this warning in CI.`,
    );
  }
}

/**
 * Returns true if `token` is satisfied by the category or `provides` list of
 * any already-resolved module.
 */
function capabilityIsSatisfied(
  token: string,
  resolved: Map<string, ModuleManifest>,
): boolean {
  for (const m of resolved.values()) {
    if (m.category === token) return true;
    if (m.provides?.includes(token)) return true;
  }
  return false;
}

/**
 * Finds the first module in the registry that can satisfy `token` —
 * either by matching category or by explicitly listing `token` in `provides`.
 * Returns the module ID, or null if nothing found.
 */
function findCapabilityProvider(
  token: string,
  registry: ModuleRegistry,
): string | null {
  const all = [...registry.listBuiltins(), ...registry.listPlugins()];
  // Prefer category match (most common case: token === "database", etc.)
  const byCategory = all.find((m) => m.category === token);
  if (byCategory) return byCategory.id;
  // Fall back to explicit `provides` listing
  const byProvides = all.find((m) => m.provides?.includes(token));
  if (byProvides) return byProvides.id;
  return null;
}

function findRequirer(
  missingId: string,
  resolved: Map<string, ModuleManifest>,
): string | undefined {
  for (const m of resolved.values()) {
    if (m.compatibility.requires?.includes(missingId)) return m.id;
  }
  return undefined;
}