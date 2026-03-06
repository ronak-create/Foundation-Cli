// core/src/execution/hook-runner.ts
//
// GAP FILLED: Full hook surface (spec §3.2)
//   Previous HookName type only had 4 hooks. Now covers all 11 lifecycle hooks.
//   Added: onRegister, onBeforeCompose, onAfterTemplate, onMerge,
//          onAfterCompose, onFinalize, onRollback

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

/**
 * All lifecycle hook names (spec §3.2).
 * Previously only had 4; now matches the full architecture spec.
 */
export type HookName =
  | "onRegister"
  | "onBeforeCompose"
  | "onAfterTemplate"
  | "onMerge"
  | "onAfterCompose"
  | "beforeWrite"
  | "afterWrite"
  | "beforeInstall"
  | "afterInstall"
  | "onFinalize"
  | "onRollback";

export interface HookRunnerOptions {
  /** If true, a failing hook throws HookExecutionError and halts the pipeline. */
  readonly strict?: boolean;
  readonly onHookStart?:    ((moduleId: string, hookName: HookName) => void) | undefined;
  readonly onHookComplete?: ((moduleId: string, hookName: HookName) => void) | undefined;
  readonly onHookSkipped?:  ((moduleId: string, hookName: HookName, reason: string) => void) | undefined;
  /** Sandbox execution timeout per hook in ms. Default: 5000. */
  readonly sandboxTimeoutMs?: number | undefined;
}

// ── Runner ────────────────────────────────────────────────────────────────────

/**
 * Executes a single named hook for all ordered modules.
 *
 * Routing:
 *   source = "builtin" → direct function call (zero overhead).
 *   source = "plugin"  → vm.Script sandbox (fs/net/child_process blocked).
 *
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
      await runPluginHookSandboxed(manifest.id, hookName, plugin, ctx, {
        strict,
        onHookStart,
        onHookComplete,
        onHookSkipped,
        sandboxTimeoutMs,
      });
    } else {
      await runBuiltinHook(manifest.id, hookName, plugin, ctx, {
        strict,
        onHookStart,
        onHookComplete,
        onHookSkipped,
      });
    }
  }
}

// ── Standalone hook runner (for onRegister, onFinalize, onRollback) ───────────

/**
 * Runs a single hook on a single module definition.
 * Used for hooks that are not tied to the CompositionPlan loop
 * (e.g. onRegister at load time, onFinalize after success, onRollback on error).
 */
export async function runSingleHook(
  hookName: HookName,
  moduleId: string,
  plugin: PluginDefinition,
  source: ModuleSource,
  ctx: PluginHookContext,
  options: HookRunnerOptions = {},
): Promise<void> {
  if (source === "plugin") {
    await runPluginHookSandboxed(moduleId, hookName, plugin, ctx, options);
  } else {
    await runBuiltinHook(moduleId, hookName, plugin, ctx, options);
  }
}

// ── Builtin hook execution (direct function call) ─────────────────────────────

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
    if (strict) throw new HookExecutionError(moduleId, hookName, err);
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

  const hookSource = resolveSandboxedHookSource(plugin, hookName);

  if (hookSource === undefined || isEmptyHookSource(hookSource)) {
    onHookSkipped?.(moduleId, hookName, "hook not defined");
    return;
  }

  onHookStart?.(moduleId, hookName);

  try {
    const sbOpts = sandboxTimeoutMs !== undefined ? { timeoutMs: sandboxTimeoutMs } : {};
    await executeSandboxedHook(moduleId, hookSource, ctx, sbOpts);
    onHookComplete?.(moduleId, hookName);
  } catch (err) {
    const isSandboxViolation =
      err instanceof SandboxBlockedModuleError || err instanceof SandboxTimeoutError;

    if (strict || isSandboxViolation) {
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

function resolveSandboxedHookSource(
  plugin: PluginDefinition,
  hookName: HookName,
): string | undefined {
  const extended = plugin as PluginDefinition & {
    sandboxedHooks?: Partial<Record<HookName, string>>;
  };
  return extended.sandboxedHooks?.[hookName];
}