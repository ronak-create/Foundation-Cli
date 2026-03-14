export { stripePlugin, STRIPE_AFTER_WRITE_HOOK } from "./stripe/index.js";
export { redisPlugin, REDIS_AFTER_WRITE_HOOK } from "./redis/index.js";
export { openaiPlugin, OPENAI_AFTER_WRITE_HOOK } from "./openai/index.js";

import { stripePlugin, STRIPE_AFTER_WRITE_HOOK } from "./stripe/index.js";
import { redisPlugin, REDIS_AFTER_WRITE_HOOK } from "./redis/index.js";
import { openaiPlugin, OPENAI_AFTER_WRITE_HOOK } from "./openai/index.js";
import type { ModuleRegistry } from "@systemlabs/foundation-core";
import type { SandboxedHooks } from "@systemlabs/foundation-core";

/**
 * Registers all three official addon plugins into a ModuleRegistry.
 *
 * Plugins are registered via `registerPlugin` (hooks stripped, source = "plugin")
 * with their sandboxed hook source strings attached for sandbox execution.
 *
 * Idempotent — safe to call multiple times on the same registry.
 */
export function loadAddonPlugins(registry: ModuleRegistry): void {
  const addons: Array<{
    definition: typeof stripePlugin;
    hooks: SandboxedHooks;
  }> = [
    {
      definition: stripePlugin,
      hooks: { afterWrite: STRIPE_AFTER_WRITE_HOOK },
    },
    {
      definition: redisPlugin,
      hooks: { afterWrite: REDIS_AFTER_WRITE_HOOK },
    },
    {
      definition: openaiPlugin,
      hooks: { afterWrite: OPENAI_AFTER_WRITE_HOOK },
    },
  ];

  for (const { definition, hooks } of addons) {
    if (!registry.hasModule(definition.manifest.id)) {
      registry.registerPlugin(definition, hooks);
    }
  }
}
