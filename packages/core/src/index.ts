// ── ORM Service ───────────────────────────────────────────────────────────────
export {
  ORMService,
  ORMProviderAlreadyRegisteredError,
  ORMModelAlreadyRegisteredError,
  ORMProviderNotFoundError,
  DuplicateSeedError,
  type ORMProvider,
  type ORMModelDefinition,
  type ORMFieldDefinition,
  type ORMFieldType,
  type ORMRelationType,
  type ORMRelationDefinition,
  type SeedContext,
  type SeedDefinition,
} from "./orm/index.js";

// ── Generator Service ─────────────────────────────────────────────────────────
export {
  GeneratorService,
  GeneratorNotFoundError,
  DuplicateGeneratorError,
  type GeneratorDefinition,
  type GeneratorContext,
  type GeneratorResult,
} from "./generator/index.js";

// ── FileTransaction ───────────────────────────────────────────────────────────
export { FileTransaction } from "./file-transaction.js";
export { safeResolve, normalisePosix, toRelativePosix } from "./path-utils.js";

// ── Errors ────────────────────────────────────────────────────────────────────
export {
  FoundationError,
  PathTraversalError,
  TransactionStateError,
  TransactionCommitError,
  TransactionRollbackError,
  DuplicateModuleError,
  ModuleNotFoundError,
  ValidationError,
  CircularDependencyError,
  ModuleConflictError,
  MissingRequiredModuleError,
  DuplicateFilePathError,
  ConflictingDependencyVersionError,
  StateWriteError,
  StateReadError,
  type ValidationFieldError,
} from "./errors.js";

// ── Types ─────────────────────────────────────────────────────────────────────
export type {
  TransactionState,
  StagedFile,
  FileTransactionOptions,
  TransactionSummary,
  ResolutionResult,
  CompositionPlan,
} from "./types.js";

// ── Manifest Validator ────────────────────────────────────────────────────────
export {
  ManifestValidator,
  type ManifestValidationResult,
} from "./manifest-validator/index.js";

// ── Module Registry ───────────────────────────────────────────────────────────
export {
  ModuleRegistry,
  loadPluginsFromProject,
  type ModuleSource,
} from "./module-registry/registry.js";
export { loadModulesFromDirectory } from "./module-registry/loader.js";

export {
  ModuleLoader,
  discoverFlat,
  discoverByCategory,
  discoverRecursive,
  type DiscoveryResult,
  type LoadOutcome,
} from "./module-registry/module-loader.js";

// ── Dependency Resolver ───────────────────────────────────────────────────────
export { DependencyGraph, buildDependencyGraph } from "./dependency-resolver/graph.js";
export { resolveModules } from "./dependency-resolver/resolver.js";

// ── Composition ───────────────────────────────────────────────────────────────
export {
  buildCompositionPlan,
  buildCompositionPlanWithOverrides,
  detectDependencyConflicts,
  type DependencyConflict,
  type DepClaim,
} from "./composition/planner.js";

// ── File Merger (Phase 2 — back-compat) ──────────────────────────────────────
export {
  deepMerge,
  mergeJson,
  mergeYaml,
  mergeEnv,
  applyConfigPatch,
  MergeConflictError,
  type MergeableObject,
  type MergeableValue,
} from "./file-merger/json-merge.js";

// ── Templating ────────────────────────────────────────────────────────────────
export {
  renderTemplate,
  renderAllTemplates,
  TemplateRenderError,
  type TemplateVariables,
} from "./templating/render.js";

// ── Installer (Phase 2 — back-compat) ────────────────────────────────────────
export {
  installDependencies as installDependenciesLegacy,
  detectPackageManager as detectPackageManagerLegacy,
  InstallError,
  type PackageManager as LegacyPackageManager,
  type InstallOptions,
  type InstallResult as LegacyInstallResult,
} from "./installer/install.js";

// ── Execution Engine ──────────────────────────────────────────────────────────
export {
  executeCompositionPlan,
  writeSingleFile,
  FileWriteError,
  type WriteResult,
  applyPatchToFile,
  applyAllPatches,
  mergeJsonContent,
  mergeYamlContent,
  mergeEnvContent,
  ConfigMergeError,
  installDependencies,
  detectPackageManager,
  writeDepsToPackageJson,
  DependencyInstallError,
  type PackageManager,
  type DependencyInstallerOptions,
  type InstallProgress,
  type InstallResult,
  runHooksForPlan,
  HookExecutionError,
  type HookName,
  type HookRunnerOptions,
  runExecutionPipeline,
  detectCiMode,
  type ExecutionPipelineOptions,
  type ExecutionPipelineResult,
  type PipelineEvent,
  type PipelineStage,
} from "./execution/index.js";

// ── Sandbox ───────────────────────────────────────────────────────────────────
export {
  executeSandboxedHook,
  isEmptyHookSource,
  SandboxError,
  SandboxBlockedModuleError,
  SandboxTimeoutError,
  BLOCKED_MODULES,
  type SandboxLogger,
  type SandboxHookOptions,
} from "./sandbox/index.js";

// ── Registry Search ───────────────────────────────────────────────────────────
export {
  searchPlugins,
  RegistrySearchError,
  type NpmSearchObject,
  type NpmSearchResponse,
  type PluginSearchResult,
  type SearchOptions,
} from "./registry-search/index.js";

// ── Project State ─────────────────────────────────────────────────────────────
export {
  writeProjectState,
  readProjectState,
  isFoundationProject,
  addPluginToLockfile,
  addPluginToConfig,
  FOUNDATION_DIR,
  LOCKFILE_NAME,
  CONFIG_NAME,
  FOUNDATION_CLI_VERSION,
  serialiseLockfile,
  parseLockfile,
  type WriteStateOptions,
  type ReadStateResult,
  type FoundationConfig,
  type ProjectSelections,
  type ProjectLockfile,
  type LockfileModuleEntry,
  type LockfilePluginEntry,
} from "./state/index.js";

// ── Plugin Installer ──────────────────────────────────────────────────────────
export {
  installPlugin,
  loadInstalledPlugins,
  registerInstalledPlugins,   // NEW — Phase 4 Stage 3
  pluginInstallDir,
  resolvePackageName,
  fetchPluginFromDirectory,
  NotAFoundationProjectError,
  PluginAlreadyInstalledError,
  PluginInstallError,
  PluginFetchError,
  PluginManifestMissingError,
  type PluginInstallOptions,
  type PluginInstallResult,
  type InstalledPlugin,       // NEW — Phase 4 Stage 3
  type FetchedPlugin,
  type SandboxedHooks,
} from "./plugin-installer/index.js";