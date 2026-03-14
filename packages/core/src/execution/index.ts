export {
  executeCompositionPlan,
  writeSingleFile,
  FileWriteError,
  type WriteResult,
} from "./project-writer.js";

export {
  applyPatchToFile,
  applyAllPatches,
  mergeJsonContent,
  mergeYamlContent,
  mergeEnvContent,
  ConfigMergeError,
} from "./config-merger.js";

export {
  installDependencies,
  detectPackageManager,
  writeDepsToPackageJson,
  DependencyInstallError,
  type PackageManager,
  type DependencyInstallerOptions,
  type InstallProgress,
  type InstallResult,
} from "./dependency-installer.js";

export {
  runHooksForPlan,
  HookExecutionError,
  type HookName,
  type HookRunnerOptions,
} from "./hook-runner.js";

export {
  runExecutionPipeline,
  detectCiMode,
  type ExecutionPipelineOptions,
  type ExecutionPipelineResult,
  type PipelineEvent,
  type PipelineStage,
} from "./pipeline.js";
