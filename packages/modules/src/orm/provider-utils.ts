/**
 * provider-utils.ts
 *
 * Shared utilities used by the ORM module provider implementations.
 *
 * The `PluginHookContext.config` field is typed as
 * `Readonly<Record<string, unknown>>`. The execution pipeline threads the
 * active ModuleRegistry through `config.__registry` so that ORM modules
 * can call `registry.orm.registerProvider()` inside their `onRegister` hook
 * without needing a direct import of ModuleRegistry (which would create a
 * circular dependency between modules ↔ core).
 *
 * `extractORMService` handles the runtime extraction safely: if the key is
 * absent (e.g. when a module is used outside the standard pipeline) it
 * returns null rather than throwing.
 */

import type { PluginHookContext } from "@systemlabs/foundation-plugin-sdk";
import type { ORMProvider, ORMService } from "@systemlabs/foundation-core";

/**
 * Attempts to extract the ORMService from `ctx.config.__registry`.
 *
 * Returns the ORMService when the pipeline has threaded it through, or
 * null in any other execution context.
 */
export function extractORMService(ctx: PluginHookContext): ORMService | null {
  const config = ctx.config as Record<string, unknown>;
  const registry = config["__registry"];
  if (registry === null || registry === undefined) return null;
  const orm = (registry as { orm?: unknown }).orm;
  if (orm === null || orm === undefined) return null;
  // Duck-type check: verify registerProvider exists before casting.
  if (typeof (orm as { registerProvider?: unknown }).registerProvider !== "function") return null;
  return orm as ORMService;
}

/**
 * Registers `provider` with the ORMService extracted from the hook context.
 *
 * No-op when the registry is not available (graceful degradation so that
 * modules can be exercised in tests without a full pipeline).
 */
export function registerProviderFromContext(
  ctx: PluginHookContext,
  provider: ORMProvider,
): void {
  const orm = extractORMService(ctx);
  if (orm === null) return;
  orm.registerProvider(provider);
}