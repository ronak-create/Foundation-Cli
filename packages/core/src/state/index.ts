export {
  writeProjectState,
  readProjectState,
  isFoundationProject,
  addPluginToLockfile,
  addPluginToConfig,
  StateWriteError,
  StateReadError,
  FOUNDATION_DIR,
  LOCKFILE_NAME,
  CONFIG_NAME,
  FOUNDATION_CLI_VERSION,
  type WriteStateOptions,
  type ReadStateResult,
  type FoundationConfig,
  type ProjectSelections,
} from "./project-state.js";

export {
  serialiseLockfile,
  parseLockfile,
  type ProjectLockfile,
  type LockfileModuleEntry,
  type LockfilePluginEntry,
} from "./lockfile.js";