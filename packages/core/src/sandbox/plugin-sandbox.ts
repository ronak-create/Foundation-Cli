/**
 * plugin-sandbox.ts — worker_threads based plugin isolation.
 *
 * REPLACES vm.Script approach to eliminate Function constructor escape:
 *   Promise.constructor.constructor("return process")() — now impossible
 *   because the worker has no reference to the parent's process.
 */

import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import path from "node:path";
import { FoundationError } from "../errors.js";
import type { PluginHookContext } from "@systemlabs/foundation-plugin-sdk";

// ── Errors ────────────────────────────────────────────────────────────────────

export class SandboxError extends FoundationError {
  constructor(public readonly pluginId: string, cause: unknown) {
    const msg = cause instanceof Error ? cause.message : String(cause);
    super(`Sandbox execution failed for plugin "${pluginId}": ${msg}`, "ERR_SANDBOX");
    this.name = "SandboxError";
  }
}

export class SandboxBlockedModuleError extends FoundationError {
  constructor(public readonly pluginId: string, public readonly moduleName: string) {
    super(
      `Plugin "${pluginId}" attempted to require blocked module "${moduleName}".`,
      "ERR_SANDBOX_BLOCKED_MODULE",
    );
    this.name = "SandboxBlockedModuleError";
  }
}

export class SandboxTimeoutError extends FoundationError {
  constructor(public readonly pluginId: string, public readonly timeoutMs: number) {
    super(
      `Plugin "${pluginId}" hook exceeded the ${timeoutMs}ms sandbox timeout.`,
      "ERR_SANDBOX_TIMEOUT",
    );
    this.name = "SandboxTimeoutError";
  }
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const BLOCKED_MODULES: ReadonlySet<string> = new Set([
  "fs", "fs/promises", "node:fs", "node:fs/promises",
  "net", "node:net",
  "child_process", "node:child_process",
  "cluster", "node:cluster",
  "worker_threads", "node:worker_threads",
  "http", "node:http",
  "https", "node:https",
  "dgram", "node:dgram",
  "dns", "node:dns",
  "os", "node:os",
  "v8", "node:v8",
  "vm", "node:vm",
  "module", "node:module",
]);

const DEFAULT_HOOK_TIMEOUT_MS = 5_000;

// ── Worker host resolution ────────────────────────────────────────────────────

function resolveWorkerHostPath(): string {
  // worker-host MUST be loaded as a compiled .js file.
  // Node cannot execute .ts files as Workers — Workers bypass vitest's transform.
  // tsup emits: src/sandbox/worker-host.ts → dist/sandbox/worker-host.js
  //
  // Walk up from this file to find the package root (dir with package.json),
  // then return dist/sandbox/worker-host.js — works for both vitest source runs
  // (import.meta.url = src/sandbox/plugin-sandbox.ts) and production bundles
  // (import.meta.url = dist/index.js).
  const thisFile = fileURLToPath(import.meta.url);
  let dir = path.dirname(thisFile);

  for (let i = 0; i < 8; i++) {
    if (existsSync(path.join(dir, "package.json"))) {
      return path.join(dir, "dist", "sandbox", "worker-host.js");
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  // Last-resort fallback
  return path.join(path.dirname(thisFile), "sandbox", "worker-host.js");
}

// ── Options ───────────────────────────────────────────────────────────────────

export interface SandboxHookOptions {
  readonly timeoutMs?: number;
}

// ── Entry point ───────────────────────────────────────────────────────────────

/**
 * Executes a plugin hook inside an isolated worker_threads Worker.
 *
 * The worker receives hookSource + ctx as structured-cloned workerData.
 * Structured clone severs all live object references — the worker can never
 * access the parent's process, require, or module cache.
 */
export async function executeSandboxedHook(
  pluginId: string,
  hookSource: string,
  ctx: PluginHookContext,
  options: SandboxHookOptions = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_HOOK_TIMEOUT_MS;

  const worker = new Worker(resolveWorkerHostPath(), {
    workerData: {
      pluginId,
      hookSource: hookSource.trim(),
      // JSON round-trip is the serialisation boundary: strips live references.
      ctx: JSON.parse(JSON.stringify(ctx)) as Record<string, unknown>,
    },
  });

  return new Promise<void>((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      worker.terminate().catch(() => undefined);
      reject(new SandboxTimeoutError(pluginId, timeoutMs));
    }, timeoutMs);

    if (typeof timer.unref === "function") timer.unref();

    worker.on("message", (result: { ok: boolean; error?: string; code?: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate().catch(() => undefined);

      if (result.ok) {
        resolve();
      } else {
        const code = result.code ?? "";
        if (code === "ERR_SANDBOX_BLOCKED_MODULE") {
          const match = /blocked module "([^"]+)"/.exec(result.error ?? "");
          reject(new SandboxBlockedModuleError(pluginId, match?.[1] ?? "(unknown)"));
        } else {
          reject(new SandboxError(pluginId, new Error(result.error ?? "Unknown hook error")));
        }
      }
    });

    worker.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new SandboxError(pluginId, err));
    });

    worker.on("exit", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        reject(new SandboxError(pluginId, new Error(`Worker exited with code ${code}`)));
      } else {
        resolve();
      }
    });
  });
}

export function isEmptyHookSource(source: string | undefined): boolean {
  return source === undefined || source.trim().length === 0;
}