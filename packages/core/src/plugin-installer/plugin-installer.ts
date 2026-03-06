import fs from "node:fs/promises";
import path from "node:path";
import { FoundationError } from "../errors.js";
import { ManifestValidator } from "../manifest-validator/validator.js";
import {
  readProjectState,
  isFoundationProject,
  FOUNDATION_DIR,
} from "../state/project-state.js";
import {
  addPluginToLockfile,
  addPluginToConfig,
} from "../state/project-state.js";
import {
  resolvePackageName,
  fetchPlugin,
  fetchPluginFromDirectory,
  cleanupFetchTemp,
  type FetchedPlugin,
} from "./npm-fetcher.js";
import type { ModuleManifest } from "@foundation-cli/plugin-sdk";
import type { HookName } from "../execution/hook-runner.js";
import type { ModuleRegistry } from "../module-registry/registry.js";

// ── Errors ────────────────────────────────────────────────────────────────────

export class NotAFoundationProjectError extends FoundationError {
  constructor(public readonly dir: string) {
    super(
      `"${dir}" is not a Foundation project. ` +
        `Run "foundation create" first or ensure .foundation/project.lock exists.`,
      "ERR_NOT_FOUNDATION_PROJECT",
    );
    this.name = "NotAFoundationProjectError";
  }
}

export class PluginAlreadyInstalledError extends FoundationError {
  constructor(public readonly pluginId: string) {
    super(
      `Plugin "${pluginId}" is already installed in this project.`,
      "ERR_PLUGIN_ALREADY_INSTALLED",
    );
    this.name = "PluginAlreadyInstalledError";
  }
}

export class PluginInstallError extends FoundationError {
  constructor(
    public readonly pluginId: string,
    cause: unknown,
  ) {
    const msg = cause instanceof Error ? cause.message : String(cause);
    super(
      `Failed to install plugin "${pluginId}": ${msg}`,
      "ERR_PLUGIN_INSTALL",
    );
    this.name = "PluginInstallError";
  }
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const HOOKS_FILENAME = "hooks.json" as const;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PluginInstallOptions {
  readonly projectRoot: string;
  readonly pluginName: string;
  readonly version?: string;
  readonly onProgress?: (message: string) => void;
}

export interface PluginInstallResult {
  readonly pluginId: string;
  readonly packageName: string;
  readonly resolvedVersion: string;
  readonly installedDir: string;
  readonly manifest: ModuleManifest;
}

export type SandboxedHooks = Partial<Record<HookName, string>>;

/** A fully-loaded installed plugin, ready for registry registration. */
export interface InstalledPlugin {
  readonly manifest: ModuleManifest;
  readonly packageName: string;
  readonly sandboxedHooks: SandboxedHooks;
}

// ── Install dir helper ────────────────────────────────────────────────────────

export function pluginInstallDir(
  projectRoot: string,
  pluginId: string,
): string {
  return path.join(projectRoot, FOUNDATION_DIR, "plugins", pluginId);
}

// ── Installer ─────────────────────────────────────────────────────────────────

export async function installPlugin(
  options: PluginInstallOptions,
): Promise<PluginInstallResult> {
  const { projectRoot, pluginName, version = "latest", onProgress } = options;
  const emit = (msg: string): void => onProgress?.(msg);

  emit("Verifying Foundation project…");
  if (!(await isFoundationProject(projectRoot))) {
    throw new NotAFoundationProjectError(projectRoot);
  }

  const isLocalPath = pluginName.startsWith("file:");
  const packageName = isLocalPath
    ? pluginName.slice(5)
    : resolvePackageName(pluginName);

  emit(`Resolved package: ${isLocalPath ? `(local) ${packageName}` : packageName}`);

  emit("Fetching plugin metadata…");
  let fetched: FetchedPlugin;
  try {
    fetched = isLocalPath
      ? await fetchPluginFromDirectory(packageName)
      : await fetchPlugin(packageName, version);
  } catch (err) {
    if (err instanceof FoundationError) throw err;
    throw new PluginInstallError(packageName, err);
  }

  emit("Validating plugin manifest…");
  let manifest: ModuleManifest;
  try {
    ManifestValidator.assert(fetched.rawManifest);
    manifest = fetched.rawManifest;
  } catch (err) {
    await cleanupFetchTemp(fetched.tempDir);
    throw err;
  }

  const pluginId = manifest.id;
  emit(`Manifest valid: ${pluginId} v${manifest.version}`);

  const { lockfile } = await readProjectState(projectRoot);
  if (lockfile?.plugins.some((p) => p.id === pluginId)) {
    await cleanupFetchTemp(fetched.tempDir);
    throw new PluginAlreadyInstalledError(pluginId);
  }

  emit(`Installing plugin files into .foundation/plugins/${pluginId}/…`);
  const installDir = pluginInstallDir(projectRoot, pluginId);
  await fs.mkdir(installDir, { recursive: true });

  try {
    await fs.writeFile(
      path.join(installDir, "manifest.json"),
      JSON.stringify(manifest, null, 2),
      "utf-8",
    );

    await fs.writeFile(
      path.join(installDir, "package.json"),
      JSON.stringify(fetched.packageJson, null, 2),
      "utf-8",
    );

    for (const fileEntry of manifest.files) {
      const destPath = path.join(installDir, "files", fileEntry.relativePath);
      await fs.mkdir(path.dirname(destPath), { recursive: true });
      await fs.writeFile(destPath, fileEntry.content, "utf-8");
    }

    const hooksJsonPath = path.join(fetched.tempDir, "hooks.json");
    let sandboxedHooks: SandboxedHooks = {};
    try {
      const raw = await fs.readFile(hooksJsonPath, "utf-8");
      sandboxedHooks = JSON.parse(raw) as SandboxedHooks;
    } catch {
      // hooks.json is optional
    }

    await fs.writeFile(
      path.join(installDir, HOOKS_FILENAME),
      JSON.stringify(sandboxedHooks, null, 2),
      "utf-8",
    );
  } catch (err) {
    await fs.rm(installDir, { recursive: true, force: true }).catch(() => undefined);
    await cleanupFetchTemp(fetched.tempDir);
    throw new PluginInstallError(pluginId, err);
  }

  emit("Updating project.lock and foundation.config.json…");
  try {
    await addPluginToLockfile(projectRoot, {
      id: pluginId,
      version: fetched.resolvedVersion,
      source: fetched.packageName,
    });
    await addPluginToConfig(projectRoot, pluginId);
  } catch (err) {
    await fs.rm(installDir, { recursive: true, force: true }).catch(() => undefined);
    await cleanupFetchTemp(fetched.tempDir);
    throw new PluginInstallError(pluginId, err);
  }

  await cleanupFetchTemp(fetched.tempDir);
  emit(`Plugin "${pluginId}" installed successfully.`);

  return {
    pluginId,
    packageName: fetched.packageName,
    resolvedVersion: fetched.resolvedVersion,
    installedDir: installDir,
    manifest,
  };
}

// ── Plugin loader ─────────────────────────────────────────────────────────────

/**
 * Reads all plugin directories under `.foundation/plugins/`, validates each
 * manifest, and returns structured InstalledPlugin objects.
 *
 * Sandboxed hook source strings are read from `hooks.json` and included
 * verbatim — no hook function is ever instantiated here. Execution only
 * happens later inside the vm.Script sandbox via `executeSandboxedHook`.
 */
export async function loadInstalledPlugins(
  projectRoot: string,
): Promise<InstalledPlugin[]> {
  const pluginsDir = path.join(projectRoot, FOUNDATION_DIR, "plugins");

  let pluginDirs: string[];
  try {
    const entries = await fs.readdir(pluginsDir, { withFileTypes: true });
    pluginDirs = entries
      .filter((e) => e.isDirectory())
      .map((e) => path.join(pluginsDir, e.name));
  } catch {
    return [];
  }

  const plugins: InstalledPlugin[] = [];

  for (const dir of pluginDirs) {
    const manifestPath = path.join(dir, "manifest.json");
    const pkgJsonPath  = path.join(dir, "package.json");
    const hooksPath    = path.join(dir, HOOKS_FILENAME);

    try {
      const rawManifest = JSON.parse(await fs.readFile(manifestPath, "utf-8"));
      ManifestValidator.assert(rawManifest);

      let packageName = path.basename(dir);
      try {
        const pkg = JSON.parse(
          await fs.readFile(pkgJsonPath, "utf-8"),
        ) as Record<string, unknown>;
        if (typeof pkg["name"] === "string") packageName = pkg["name"];
      } catch { /* non-fatal */ }

      // Read hook source strings — never eval'd here, safe to store as strings.
      let sandboxedHooks: SandboxedHooks = {};
      try {
        sandboxedHooks = JSON.parse(
          await fs.readFile(hooksPath, "utf-8"),
        ) as SandboxedHooks;
      } catch { /* hooks.json is optional */ }

      plugins.push({
        manifest: rawManifest as ModuleManifest,
        packageName,
        sandboxedHooks,
      });
    } catch {
      // Corrupted plugin directory — skip silently
    }
  }

  return plugins;
}

/**
 * Loads all installed plugins from `.foundation/plugins/` and registers each
 * one into `registry` via `registerPlugin` (source = "plugin").
 *
 * Registration contract:
 *   - Only the validated `manifest` is stored on the live PluginDefinition.
 *   - `sandboxedHooks` are attached as serialised source strings, NOT as
 *     callable functions. The hook-runner executes them inside a vm.Script
 *     sandbox on demand.
 *   - Plugins already present in the registry are skipped (idempotent).
 *
 * Returns the list of plugin IDs that were newly registered on this call.
 */
export async function registerInstalledPlugins(
  projectRoot: string,
  registry: ModuleRegistry,
): Promise<string[]> {
  const plugins = await loadInstalledPlugins(projectRoot);
  const registered: string[] = [];

  for (const { manifest, sandboxedHooks } of plugins) {
    if (registry.hasModule(manifest.id)) continue;

    // registerPlugin strips any live hook functions and attaches only the
    // source strings — enforcement of the no-live-code constraint.
    registry.registerPlugin({ manifest }, sandboxedHooks);
    registered.push(manifest.id);
  }

  return registered;
}