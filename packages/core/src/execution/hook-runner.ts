import type { CompositionPlan } from "../types.js";
import type { ModuleRegistry, ModuleSource } from "../module-registry/registry.js";
import type { PluginDefinition, PluginHookContext } from "@foundation-cli/plugin-sdk";
import { FoundationError } from "../errors.js";
import {
  executeSandboxedHook,
  isEmptyHookSource,
  SandboxBlockedModuleError,
  SandboxTimeoutError,
} from "../sandbox/plugin-sandbox.js";

// ── Errors ────────────────────────────────────────────────────────────────────

export class HookExecutionError extends FoundationError {
  constructor(
    public readonly moduleId: string,
    public readonly hookName: string,
    cause: unknown,
  ) {
    const msg = cause instanceof Error ? cause.message : String(cause);
    super(`Hook "${hookName}" on module "${moduleId}" failed: ${msg}`, "ERR_HOOK_EXECUTION");
    this.name = "HookExecutionError";
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type HookName = "beforeWrite" | "afterWrite" | "beforeInstall" | "afterInstall";

export interface HookRunnerOptions {
  /** If true, a failing hook throws HookExecutionError and halts the pipeline. */
  readonly strict?: boolean;
  /** Receives notifications without UI coupling. */
  readonly onHookStart?: ((moduleId: string, hookName: HookName) => void) | undefined;
  readonly onHookComplete?: ((moduleId: string, hookName: HookName) => void) | undefined;
  readonly onHookSkipped?: ((moduleId: string, hookName: HookName, reason: string) => void) | undefined;
  /** Sandbox execution timeout per hook in ms. Default: 5000. */
  readonly sandboxTimeoutMs?: number;
}

// ── Runner ────────────────────────────────────────────────────────────────────

/**
 * Executes a single named hook for all ordered modules.
 *
 * Routing logic:
 *   - Module source = "builtin"  → direct function call (existing behaviour,
 *                                   zero performance overhead, unchanged).
 *   - Module source = "plugin"   → routed through vm.Script sandbox.
 *                                   Blocked modules (fs, net, child_process)
 *                                   throw SandboxBlockedModuleError.
 *
 * The hook interface (PluginHookContext) => Promise<void> is unchanged.
 * Callers do not need to know about the sandbox.
 */
export async function runHooksForPlan(
  hookName: HookName,
  plan: CompositionPlan,
  registry: ModuleRegistry,
  ctx: PluginHookContext,
  options: HookRunnerOptions = {},
): Promise<void> {
  const { strict = true, onHookStart, onHookComplete, onHookSkipped, sandboxTimeoutMs } = options;

  for (const manifest of plan.orderedModules) {
    let plugin: PluginDefinition;
    let source: ModuleSource;

    try {
      plugin = registry.getModule(manifest.id);
      source = registry.getSource(manifest.id);
    } catch {
      onHookSkipped?.(manifest.id, hookName, "not in registry");
      continue;
    }

    if (source === "plugin") {
      // ── Sandboxed path ──────────────────────────────────────────────────
      const pluginOptions: Parameters<typeof runPluginHookSandboxed>[4] = {
        strict,
        ...(onHookStart && { onHookStart }),
        ...(onHookComplete && { onHookComplete }),
        ...(onHookSkipped && { onHookSkipped }),
        ...(sandboxTimeoutMs !== undefined && { sandboxTimeoutMs }),
      };

      await runPluginHookSandboxed(manifest.id, hookName, plugin, ctx, pluginOptions);
    } else {
      // ── Builtin path (unchanged) ────────────────────────────────────────
      await runBuiltinHook(manifest.id, hookName, plugin, ctx, {
        strict,
        onHookStart,
        onHookComplete,
        onHookSkipped,
      });
    }
  }
}

// ── Builtin hook execution (direct call) ──────────────────────────────────────

async function runBuiltinHook(
  moduleId: string,
  hookName: HookName,
  plugin: PluginDefinition,
  ctx: PluginHookContext,
  options: Pick<HookRunnerOptions, "strict" | "onHookStart" | "onHookComplete" | "onHookSkipped">,
): Promise<void> {
  const { strict, onHookStart, onHookComplete, onHookSkipped } = options;

  const hook = resolveHook(plugin, hookName);
  if (hook === undefined) {
    onHookSkipped?.(moduleId, hookName, "hook not defined");
    return;
  }

  onHookStart?.(moduleId, hookName);

  try {
    await hook(ctx);
    onHookComplete?.(moduleId, hookName);
  } catch (err) {
    if (strict) {
      throw new HookExecutionError(moduleId, hookName, err);
    }
    onHookSkipped?.(
      moduleId,
      hookName,
      `failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// ── Plugin hook execution (sandboxed) ────────────────────────────────────────

async function runPluginHookSandboxed(
  moduleId: string,
  hookName: HookName,
  plugin: PluginDefinition,
  ctx: PluginHookContext,
  options: Pick<
    HookRunnerOptions,
    "strict" | "onHookStart" | "onHookComplete" | "onHookSkipped" | "sandboxTimeoutMs"
  >,
): Promise<void> {
  const { strict, onHookStart, onHookComplete, onHookSkipped, sandboxTimeoutMs } = options;

  // Hooks are stripped from plugin PluginDefinitions at registerPlugin time.
  // Hook source code lives in plugin.sandboxedHooks (set by plugin-installer).
  const hookSource = resolveSandboxedHookSource(plugin, hookName);

  if (hookSource === undefined || isEmptyHookSource(hookSource)) {
    onHookSkipped?.(moduleId, hookName, "hook not defined");
    return;
  }

  onHookStart?.(moduleId, hookName);

  try {
    const options = sandboxTimeoutMs !== undefined ? { timeoutMs: sandboxTimeoutMs } : {};
    await executeSandboxedHook(moduleId, hookSource, ctx, options);
    onHookComplete?.(moduleId, hookName);
  } catch (err) {
    const isSandboxViolation =
      err instanceof SandboxBlockedModuleError || err instanceof SandboxTimeoutError;

    if (strict || isSandboxViolation) {
      // Sandbox violations always throw regardless of strict mode —
      // a plugin attempting to access fs is a security event, not a
      // routine failure.
      throw new HookExecutionError(moduleId, hookName, err);
    }

    onHookSkipped?.(
      moduleId,
      hookName,
      `failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveHook(
  plugin: PluginDefinition,
  hookName: HookName,
): ((ctx: PluginHookContext) => Promise<void>) | undefined {
  return plugin.hooks?.[hookName];
}

/**
 * Reads the sandboxed hook source string from the PluginDefinition extension.
 * Plugin installer writes hook sources into `plugin.sandboxedHooks` when
 * storing the manifest — this avoids storing executable functions directly.
 */
function resolveSandboxedHookSource(
  plugin: PluginDefinition,
  hookName: HookName,
): string | undefined {
  // `sandboxedHooks` is a non-SDK extension stored on the definition object.
  const extended = plugin as PluginDefinition & {
    sandboxedHooks?: Partial<Record<HookName, string>>;
  };
  return extended.sandboxedHooks?.[hookName];
}
