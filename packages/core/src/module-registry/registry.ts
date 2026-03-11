import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";
import type { PluginDefinition, ModuleManifest } from "@foundation-cli/plugin-sdk";
import { DuplicateModuleError, ModuleNotFoundError } from "../errors.js";
import { ManifestValidator } from "../manifest-validator/validator.js";
import type { SandboxedHooks } from "../plugin-installer/plugin-installer.js";
// import type { HookName } from "../execution/hook-runner.js";

export type ModuleSource = "builtin" | "plugin";

interface RegistryEntry {
  readonly plugin: PluginDefinition;
  readonly source: ModuleSource;
}

export class ModuleRegistry {
  readonly #entries: Map<string, RegistryEntry> = new Map();

  registerModule(plugin: PluginDefinition): void {
    this.#register(plugin, "builtin");
  }

  /**
   * Registers a third-party plugin with hooks stripped from the live object.
   * Optionally attaches `sandboxedHooks` (source strings) so the hook-runner
   * can execute them inside the vm.Script sandbox.
   */
  registerPlugin(
    plugin: PluginDefinition,
    sandboxedHooks: SandboxedHooks = {},
  ): void {
    // Strip live hooks — no third-party function references stored.
    const hookless: PluginDefinition & {
      sandboxedHooks?: SandboxedHooks;
    } = {
      manifest: plugin.manifest,
      // Attach source strings for sandboxed execution
      ...(Object.keys(sandboxedHooks).length > 0
        ? { sandboxedHooks }
        : {}),
    };
    this.#register(hookless, "plugin");
  }

  getModule(id: string): PluginDefinition {
    const entry = this.#entries.get(id);
    if (entry === undefined) throw new ModuleNotFoundError(id);
    return entry.plugin;
  }

  hasModule(id: string): boolean {
    return this.#entries.has(id);
  }

  listModules(): ReadonlyArray<ModuleManifest> {
    return Array.from(this.#entries.values()).map((e) => e.plugin.manifest);
  }

  listPlugins(): ReadonlyArray<ModuleManifest> {
    return Array.from(this.#entries.values())
      .filter((e) => e.source === "plugin")
      .map((e) => e.plugin.manifest);
  }

  listBuiltins(): ReadonlyArray<ModuleManifest> {
    return Array.from(this.#entries.values())
      .filter((e) => e.source === "builtin")
      .map((e) => e.plugin.manifest);
  }

  getSource(id: string): ModuleSource {
    const entry = this.#entries.get(id);
    if (entry === undefined) throw new ModuleNotFoundError(id);
    return entry.source;
  }

  get size(): number {
    return this.#entries.size;
  }

  #register(plugin: PluginDefinition, source: ModuleSource): void {
    ManifestValidator.assert(plugin.manifest);
    const { id } = plugin.manifest;
    if (this.#entries.has(id)) throw new DuplicateModuleError(id);
    this.#entries.set(id, { plugin, source });
  }
}

// ── loadPluginsFromProject ────────────────────────────────────────────────────

const FOUNDATION_DIR = ".foundation";
const PLUGINS_SUBDIR = "plugins";
const HOOKS_FILENAME = "hooks.json";

export async function loadPluginsFromProject(
  projectRoot: string,
  registry: ModuleRegistry,
): Promise<ReadonlyArray<string>> {
  const pluginsDir = path.join(projectRoot, FOUNDATION_DIR, PLUGINS_SUBDIR);
  let entries: Dirent[];
  try {
    entries = await fs.readdir(pluginsDir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }

  const pluginDirs = entries
    .filter((e) => e.isDirectory())
    .map((e) => path.join(pluginsDir, e.name));

  const loaded: string[] = [];

  for (const dir of pluginDirs) {
    const manifestPath = path.join(dir, "manifest.json");
    const hooksPath = path.join(dir, HOOKS_FILENAME);

    let rawManifest: unknown;
    try {
      rawManifest = JSON.parse(await fs.readFile(manifestPath, "utf-8"));
    } catch {
      continue;
    }

    try {
      ManifestValidator.assert(rawManifest);
    } catch {
      continue;
    }

    const manifest = rawManifest;
    if (registry.hasModule(manifest.id)) continue;

    // Load sandboxed hook sources if present
    let sandboxedHooks: SandboxedHooks = {};
    try {
      sandboxedHooks = JSON.parse(
        await fs.readFile(hooksPath, "utf-8"),
      ) as SandboxedHooks;
    } catch { /* hooks.json is optional */ }

    try {
      registry.registerPlugin({ manifest }, sandboxedHooks);
      loaded.push(manifest.id);
    } catch {
      continue;
    }
  }

  return loaded;
}
