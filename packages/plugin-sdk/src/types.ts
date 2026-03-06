// ── Category ──────────────────────────────────────────────────────────────────

export type PluginCategory =
  | "frontend"
  | "backend"
  | "database"
  | "auth"
  | "ui"
  | "deployment"
  | "testing"
  | "tooling";

// ── Runtime ───────────────────────────────────────────────────────────────────

/**
 * The execution runtime this module targets.
 *
 * - "node"   — pure Node.js module (default for all existing modules)
 * - "python" — pure Python module (FastAPI, Django, SQLAlchemy, etc.)
 * - "multi"  — cross-language module that spans both runtimes
 *
 * Omitting this field is equivalent to "node".
 */
export type Runtime = "node" | "python" | "multi";

// ── Dependencies ──────────────────────────────────────────────────────────────

export type DependencyScope =
  | "dependencies"
  | "devDependencies"
  | "peerDependencies";

export interface PackageDependency {
  readonly name: string;
  readonly version: string;
  readonly scope: DependencyScope;
  /** Runtime this dependency belongs to. Defaults to the module's runtime. */
  readonly runtime?: Runtime;
}

// ── Files ─────────────────────────────────────────────────────────────────────

export interface FileEntry {
  readonly relativePath: string;
  readonly content: string;
  readonly overwrite?: boolean;
}

// ── Config patches ────────────────────────────────────────────────────────────

export interface ConfigPatch {
  readonly targetFile: string;
  readonly merge: Record<string, unknown>;
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

export interface PluginHookContext {
  readonly projectRoot: string;
  readonly config: Readonly<Record<string, unknown>>;
  readonly selectedModules: ReadonlyArray<string>;
}

export interface PluginHooks {
  readonly beforeInstall?: (ctx: PluginHookContext) => Promise<void>;
  readonly afterInstall?: (ctx: PluginHookContext) => Promise<void>;
  readonly beforeWrite?: (ctx: PluginHookContext) => Promise<void>;
  readonly afterWrite?: (ctx: PluginHookContext) => Promise<void>;
}

// ── Compatibility ─────────────────────────────────────────────────────────────

export interface CompatibilityConstraints {
  readonly requires?: ReadonlyArray<string>;
  readonly conflicts?: ReadonlyArray<string>;
  readonly compatibleWith?: ReadonlyArray<string>;
}

// ── Manifest ──────────────────────────────────────────────────────────────────

export interface ModuleManifest {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly category: PluginCategory;
  /**
   * Target runtime. Optional — defaults to "node" when absent.
   * Existing modules that omit this field continue to work unchanged.
   */
  readonly runtime?: Runtime;
  readonly dependencies: ReadonlyArray<PackageDependency>;
  readonly files: ReadonlyArray<FileEntry>;
  readonly configPatches: ReadonlyArray<ConfigPatch>;
  readonly compatibility: CompatibilityConstraints;
  readonly tags?: ReadonlyArray<string>;
}

// ── Plugin ────────────────────────────────────────────────────────────────────

export interface PluginDefinition {
  readonly manifest: ModuleManifest;
  readonly hooks?: PluginHooks;
}

export type PluginFactory = () => PluginDefinition;