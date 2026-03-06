import type { ModuleManifest } from "@foundation-cli/plugin-sdk";
import type { ModuleRegistry } from "../module-registry/registry.js";
import type { ResolutionResult } from "../types.js";
import {
  ModuleConflictError,
  MissingRequiredModuleError,
  ModuleNotFoundError,
} from "../errors.js";
import { buildDependencyGraph } from "./graph.js";

/**
 * Resolves a set of selected module IDs against the registry.
 *
 * Steps:
 *   1. Validate all selected IDs exist in the registry.
 *   2. Transitively expand `requires` — auto-add missing dependencies.
 *   3. Check `conflicts` across the full resolved set.
 *   4. Build a DAG and topologically sort.
 *
 * Throws typed errors on conflict, missing required module, or cycle.
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

  // ── Step 2: Transitively expand requires ──────────────────────────────────
  const resolved = new Map<string, ModuleManifest>();
  const autoAdded = new Set<string>();
  const queue = [...selectedIds];
  const selectedSet = new Set(selectedIds);

  while (queue.length > 0) {
    const id = queue.shift()!;

    if (resolved.has(id)) continue;

    let plugin;
    try {
      plugin = registry.getModule(id);
    } catch (err) {
      if (err instanceof ModuleNotFoundError) {
        // This id was injected as a requirement from another module.
        // Find the module that required it for a better error message.
        const requiredBy = findRequirer(id, resolved);
        throw new MissingRequiredModuleError(id, requiredBy ?? "(unknown)");
      }
      throw err;
    }

    const manifest = plugin.manifest;
    resolved.set(id, manifest);

    for (const required of manifest.compatibility.requires ?? []) {
      if (!resolved.has(required)) {
        if (!selectedSet.has(required)) {
          autoAdded.add(required);
        }
        queue.push(required);
      }
    }
  }

  // ── Step 3: Validate conflicts ────────────────────────────────────────────
  const resolvedIds = new Set(resolved.keys());

  for (const manifest of resolved.values()) {
    for (const conflictId of manifest.compatibility.conflicts ?? []) {
      if (resolvedIds.has(conflictId)) {
        throw new ModuleConflictError(manifest.id, conflictId);
      }
    }
  }

  // ── Step 4: Topological sort via DAG ─────────────────────────────────────
  const allManifests = Array.from(resolved.values());
  const graph = buildDependencyGraph(allManifests);
  const sortedIds = graph.topologicalSort();

  const ordered: ModuleManifest[] = sortedIds.map((id) => {
    const manifest = resolved.get(id);
    if (manifest === undefined) {
      throw new Error(`Internal resolver error: sorted id "${id}" not in resolved map.`);
    }
    return manifest;
  });

  return {
    ordered,
    added: Array.from(autoAdded),
    conflicts: [],
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function findRequirer(
  missingId: string,
  resolved: Map<string, ModuleManifest>,
): string | undefined {
  for (const manifest of resolved.values()) {
    if (manifest.compatibility.requires?.includes(missingId)) {
      return manifest.id;
    }
  }
  return undefined;
}