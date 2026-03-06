/**
 * loader.ts — backward-compatible shim.
 *
 * `loadModulesFromDirectory` is preserved with its original signature so
 * no existing callers need changes. Internally it now delegates to
 * `discoverFlat` from module-loader.ts (same semantics, richer result type).
 *
 * New code should import from module-loader.ts directly.
 */

import type { ModuleRegistry } from "./registry.js";
import { discoverFlat } from "./module-loader.js";

export { loadPluginsFromProject } from "./registry.js";

/**
 * Loads all `.js` / `.ts` files from `modulesDir`, dynamically imports each,
 * invokes the default-exported PluginFactory, and registers the result as a
 * builtin via `registerModule`.
 *
 * Preserved for backward compatibility. New callers should use ModuleLoader
 * or the individual discover* functions from module-loader.ts.
 */
export async function loadModulesFromDirectory(
  modulesDir: string,
  registry: ModuleRegistry,
): Promise<ModuleRegistry> {
  await discoverFlat(modulesDir, registry, "builtin");
  return registry;
}