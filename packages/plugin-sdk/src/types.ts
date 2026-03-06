// ── Category ──────────────────────────────────────────────────────────────────

export type PluginCategory =
  | "frontend"
  | "backend"
  | "database"
  | "orm"
  | "auth"
  | "ui"
  | "deployment"
  | "testing"
  | "state"
  | "tooling"
  | "addon";

// ── Runtime ───────────────────────────────────────────────────────────────────

export type Runtime = "node" | "python" | "multi";

// ── Module lifecycle status ───────────────────────────────────────────────────

/**
 * Lifecycle status of a module (spec §11.3).
 *
 * stable       → default; shown as normal option in prompts.
 * experimental → shown with [experimental] label; blocked in CI unless
 *                --allow-experimental flag present.
 * deprecated   → warning shown; successor suggested; blocked after two
 *                major CLI versions.
 * removed      → hard error if referenced from project.lock with migration URL.
 */
export type ModuleStatus = "stable" | "experimental" | "deprecated" | "removed";

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
  /**
   * Condition string evaluated by the composition engine.
   * "always" | "deployment.docker" | undefined (always included).
   */
  readonly when?: string;
}

// ── Config patches ────────────────────────────────────────────────────────────

export interface ConfigPatch {
  readonly targetFile: string;
  readonly merge: Record<string, unknown>;
}

// ── Template variables ────────────────────────────────────────────────────────

export interface VariableDef {
  readonly type: "string" | "number" | "boolean";
  readonly default?: string | number | boolean;
  /** If true, the CLI prompts the user for this variable during scaffold. */
  readonly prompt?: boolean;
  readonly description?: string;
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

export interface PluginHookContext {
  readonly projectRoot: string;
  readonly config: Readonly<Record<string, unknown>>;
  readonly selectedModules: ReadonlyArray<string>;
}

/**
 * Full hook surface (spec §3.2) — all 11 hooks from the architecture.
 * Hooks receive a frozen PluginHookContext.
 * File mutations must go through FileTransaction, not direct fs calls.
 */
export interface PluginHooks {
  /** Registry load time. Can abort registration by throwing. */
  readonly onRegister?: (ctx: PluginHookContext) => Promise<void>;
  /** Before template rendering. Can inject dynamic variables into context. */
  readonly onBeforeCompose?: (ctx: PluginHookContext) => Promise<void>;
  /** After template render, before merge. Can post-process rendered files. */
  readonly onAfterTemplate?: (ctx: PluginHookContext) => Promise<void>;
  /** During config merge. Custom merge logic for non-standard file types. */
  readonly onMerge?: (ctx: PluginHookContext) => Promise<void>;
  /** After all files staged. Can inject cross-module wiring code. */
  readonly onAfterCompose?: (ctx: PluginHookContext) => Promise<void>;
  /** Before file-write transaction commits. */
  readonly beforeWrite?: (ctx: PluginHookContext) => Promise<void>;
  /** After file-write transaction commits. */
  readonly afterWrite?: (ctx: PluginHookContext) => Promise<void>;
  /** Before package manager runs. Can modify install plan. */
  readonly beforeInstall?: (ctx: PluginHookContext) => Promise<void>;
  /** After package manager completes. Run post-install scripts (e.g. prisma generate). */
  readonly afterInstall?: (ctx: PluginHookContext) => Promise<void>;
  /** After full success. Print module-specific post-install instructions. */
  readonly onFinalize?: (ctx: PluginHookContext) => Promise<void>;
  /** On any failure. Clean up side-effects (e.g. remove created API keys). */
  readonly onRollback?: (ctx: PluginHookContext) => Promise<void>;
}

// ── Compatibility ─────────────────────────────────────────────────────────────

export interface CompatibilityConstraints {
  /**
   * Capability tokens OR module IDs this module depends on (spec §4.2).
   * The resolver auto-injects a satisfying module for each unmet token.
   * Example: ["database"] → resolver ensures some database module is present.
   */
  readonly requires?: ReadonlyArray<string>;
  /** Module IDs that cannot coexist with this module. */
  readonly conflicts?: ReadonlyArray<string>;
  /**
   * Tested combination matrix (spec §4.3).
   * Keys = category names; values = allowed module IDs or ["*"].
   * Violations emit advisory warnings, not hard errors.
   */
  readonly compatibleWith?: Readonly<Record<string, ReadonlyArray<string>>>;
  /**
   * Peer framework semver ranges (spec §3.1 peerFrameworks).
   * Checked at scaffold time; stale ranges block generation with a clear error.
   * Example: { "next": ">=14.0.0 <16.0.0" }
   */
  readonly peerFrameworks?: Readonly<Record<string, string>>;
}

// ── Manifest ──────────────────────────────────────────────────────────────────

export interface ModuleManifest {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly category: PluginCategory;
  /** Target runtime. Omitting is equivalent to "node". */
  readonly runtime?: Runtime;
  /**
   * Capability tokens this module provides (spec §4.2 CapabilityMap).
   * Used by the capability-based resolver.
   * Example: ["frontend", "ssr"]
   */
  readonly provides?: ReadonlyArray<string>;
  /**
   * Soft dependency tokens. Trigger conditional prompts only; module works without them.
   * Example: ["state-management"]
   */
  readonly optional?: ReadonlyArray<string>;
  /** Template variables this module exposes (spec §3.1). */
  readonly variables?: Readonly<Record<string, VariableDef>>;
  /** Message shown in the post-install success screen for this module. */
  readonly postInstallInstructions?: string;
  /** Lifecycle status (spec §11.3). Defaults to "stable" when absent. */
  readonly status?: ModuleStatus;
  readonly dependencies: ReadonlyArray<PackageDependency>;
  readonly files: ReadonlyArray<FileEntry>;
  readonly configPatches: ReadonlyArray<ConfigPatch>;
  readonly compatibility: CompatibilityConstraints;
  readonly tags?: ReadonlyArray<string>;
}

// ── Plugin-specific manifest extensions (spec §6.3) ──────────────────────────

/**
 * PluginManifest extends ModuleManifest with fields required for third-party
 * plugins. category MUST be "addon" for all community/verified plugins.
 */
export interface PluginManifest extends ModuleManifest {
  /** Target Foundation Plugin API version (semver). Checked at install time. */
  readonly pluginApiVersion: string;
  /** Publisher identity. Used in trust verification display. */
  readonly author: string;
  /**
   * Set by Foundation registry after security audit.
   * Cannot be self-declared — injected at install time from registry response.
   */
  readonly verified?: boolean;
}

// ── Plugin definition ─────────────────────────────────────────────────────────

export interface PluginDefinition {
  readonly manifest: ModuleManifest;
  readonly hooks?: PluginHooks;
}

export type PluginFactory = () => PluginDefinition;