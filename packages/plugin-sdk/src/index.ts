export type {
  PluginCategory,
  Runtime,
  DependencyScope,
  PackageDependency,
  FileEntry,
  ConfigPatch,
  PluginHookContext,
  PluginHooks,
  CompatibilityConstraints,
  ModuleManifest,
  PluginDefinition,
  PluginFactory,
} from "./types.js";

export { MODULE_MANIFEST_SCHEMA } from "./schema.js";

export {
  validateModuleManifest,
  assertValidManifest,
  type ValidationResult,
} from "./validate.js";
