export {
  installPlugin,
  loadInstalledPlugins,
  registerInstalledPlugins,   // NEW — Phase 4 Stage 3
  pluginInstallDir,
  NotAFoundationProjectError,
  PluginAlreadyInstalledError,
  PluginInstallError,
  type PluginInstallOptions,
  type PluginInstallResult,
  type InstalledPlugin,       // NEW — Phase 4 Stage 3
  type SandboxedHooks,
} from "./plugin-installer.js";

export {
  fetchPlugin,
  fetchPluginFromDirectory,
  cleanupFetchTemp,
  resolvePackageName,
  PluginFetchError,
  PluginManifestMissingError,
  type FetchedPlugin,
} from "./npm-fetcher.js";
