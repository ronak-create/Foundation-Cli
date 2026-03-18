/**
 * plugin-sandbox.ts — worker_threads based plugin isolation.
 *
 * REPLACES vm.Script approach to eliminate Function constructor escape:
 *   Promise.constructor.constructor("return process")() — now impossible
 *   because the worker has no reference to the parent's process.
 */

import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";
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
  const thisFile = fileURLToPath(import.meta.url);
  const thisDir = path.dirname(thisFile);

  // In compiled output, tsup emits worker-host.ts as:
  //   dist/sandbox/worker-host.js
  // plugin-sandbox.ts is compiled to dist/sandbox/plugin-sandbox.js (bundled
  // into dist/index.js but import.meta.url points to the original source location
  // during vitest runs or to dist/index.js during production).
  //
  // Resolution strategy:
  //   - If this file ends in .ts (vitest running source), look for worker-host.ts
  //     in the same directory.
  //   - If this file is dist/index.js (tsup bundle), the worker is at
  //     dist/sandbox/worker-host.js — one level up from index.js plus subdir.
  //   - If this file is dist/sandbox/plugin-sandbox.js (hypothetical separate
  //     entry), the worker is in the same directory.
  //
  // Simplest robust approach: check candidate paths in order.
  const isTsSource = thisFile.endsWith(".ts");

  if (isTsSource) {
    // vitest source run: worker-host.ts is in the same sandbox/ directory
    return path.join(thisDir, "worker-host.ts");
  }

  // Compiled: tsup outputs worker-host as dist/sandbox/worker-host.js
  // thisFile is dist/index.js → thisDir is dist/
  // Or thisFile is dist/sandbox/worker-host.js → but that IS the worker itself
  const candidateFromDist = path.join(thisDir, "sandbox", "worker-host.js");
  const candidateFromSandbox = path.join(thisDir, "worker-host.js");

  // Return whichever path is more likely based on current directory name
  return path.basename(thisDir) === "sandbox"
    ? candidateFromSandbox
    : candidateFromDist;
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