/**
 * Serialisation helpers for .foundation/project.lock
 *
 * The lockfile is the single source of truth for a project's Foundation
 * state (spec §11.2).  Key ordering is deterministic so that diffing the
 * file in version control is meaningful.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LockfileModuleEntry {
  readonly id: string;
  readonly version: string;
}

export interface LockfilePluginEntry {
  readonly id: string;
  readonly version: string;
  readonly source: string;
}

export interface ProjectLockfile {
  readonly foundationCliVersion: string;
  readonly generatedAt: string;           // ISO 8601
  readonly packageManager: string;
  readonly modules: ReadonlyArray<LockfileModuleEntry>;
  readonly plugins: ReadonlyArray<LockfilePluginEntry>;
}

// ── Stable serialisation ──────────────────────────────────────────────────────

/**
 * Top-level key order for project.lock.
 * Adding new fields must preserve this order and append to the end.
 */
const LOCKFILE_KEY_ORDER: ReadonlyArray<keyof ProjectLockfile> = [
  "foundationCliVersion",
  "generatedAt",
  "packageManager",
  "modules",
  "plugins",
];

/**
 * Serialises a ProjectLockfile to a JSON string with deterministic key
 * ordering and stable module array ordering (sorted by id).
 */
export function serialiseLockfile(lockfile: ProjectLockfile): string {
  // Sort modules array by id for stability across re-runs.
  const stable: ProjectLockfile = {
    ...lockfile,
    modules: [...lockfile.modules].sort((a, b) => a.id.localeCompare(b.id)),
    plugins: [...lockfile.plugins].sort((a, b) => a.id.localeCompare(b.id)),
  };

  // Build ordered object manually so JSON.stringify preserves insertion order.
  const ordered: Record<string, unknown> = {};
  for (const key of LOCKFILE_KEY_ORDER) {
    ordered[key] = stable[key];
  }

  return JSON.stringify(ordered, null, 2);
}

/**
 * Parses a project.lock JSON string.
 * Returns null if the content is missing or malformed rather than throwing,
 * so callers can handle a missing/corrupt lockfile gracefully.
 */
export function parseLockfile(raw: string): ProjectLockfile | null {
  try {
    const parsed = JSON.parse(raw) as Partial<ProjectLockfile>;

    if (
      typeof parsed.foundationCliVersion !== "string" ||
      typeof parsed.generatedAt !== "string" ||
      typeof parsed.packageManager !== "string" ||
      !Array.isArray(parsed.modules)
    ) {
      return null;
    }

    return {
      foundationCliVersion: parsed.foundationCliVersion,
      generatedAt: parsed.generatedAt,
      packageManager: parsed.packageManager,
      modules: (parsed.modules as unknown[]).flatMap((m): LockfileModuleEntry[] => {
        if (
          typeof m !== "object" || m === null ||
          typeof (m as Record<string, unknown>)["id"] !== "string" ||
          typeof (m as Record<string, unknown>)["version"] !== "string"
        ) {
          return []; // skip malformed entries silently
        }
        return [{
          id: (m as LockfileModuleEntry).id,
          version: (m as LockfileModuleEntry).version,
        }];
      }),
      plugins: Array.isArray(parsed.plugins)
        ? (parsed.plugins as unknown[]).flatMap((p): LockfilePluginEntry[] => {
            if (
              typeof p !== "object" || p === null ||
              typeof (p as Record<string, unknown>)["id"] !== "string" ||
              typeof (p as Record<string, unknown>)["version"] !== "string" ||
              typeof (p as Record<string, unknown>)["source"] !== "string"
            ) {
              return [];
            }
            return [{
              id: (p as LockfilePluginEntry).id,
              version: (p as LockfilePluginEntry).version,
              source: (p as LockfilePluginEntry).source,
            }];
          })
        : [],
    };
  } catch {
    return null;
  }
}