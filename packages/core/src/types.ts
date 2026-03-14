import type { FileEntry, PackageDependency, ConfigPatch, ModuleManifest } from "@systemlabs/foundation-plugin-sdk";

// ── FileTransaction types ─────────────────────────────────────────────────────

export type TransactionState = "idle" | "open" | "committed" | "rolled-back";

export interface StagedFile {
  readonly stagingPath: string;
  readonly destinationPath: string;
  readonly existedBefore: boolean;
  readonly originalContent: string | null;
}

export interface FileTransactionOptions {
  readonly projectRoot: string;
  readonly stagingDir?: string;
}

export interface TransactionSummary {
  readonly state: TransactionState;
  readonly stagedCount: number;
  readonly projectRoot: string;
}

// ── Resolver types ────────────────────────────────────────────────────────────

export interface ResolutionResult {
  /** All modules in safe topological execution order. */
  readonly ordered: ReadonlyArray<ModuleManifest>;
  /** IDs of modules auto-added to satisfy `requires` constraints. */
  readonly added: ReadonlyArray<string>;
  /** Conflict pairs encountered (should be empty — conflicts throw). */
  readonly conflicts: ReadonlyArray<string>;
}

// ── Composition types ─────────────────────────────────────────────────────────

export interface CompositionPlan {
  readonly files: ReadonlyArray<FileEntry>;
  readonly dependencies: ReadonlyArray<PackageDependency>;
  readonly configPatches: ReadonlyArray<ConfigPatch>;
  readonly orderedModules: ReadonlyArray<ModuleManifest>;
}
