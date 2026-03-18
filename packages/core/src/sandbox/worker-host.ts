/**
 * worker-host.ts
 *
 * Runs inside a worker_threads Worker. Receives a plugin hook's source code
 * and a frozen context via workerData, evaluates the hook in this isolated
 * module scope, and posts the result back to the parent thread.
 *
 * SECURITY CONTRACT:
 *   - This file runs in its own V8 context (separate module graph).
 *   - Function.prototype.constructor here is the WORKER's Function — it has
 *     no reference to the parent thread's process, require, or global scope.
 *   - No host-realm object is passed in via workerData; ctx is a plain JSON
 *     serialised/deserialised value.
 *   - The require interceptor below enforces the same BLOCKED_MODULES list
 *     as the previous vm.Script sandbox.
 */

import { workerData, parentPort } from "node:worker_threads";
import nodeCrypto from "node:crypto";
import nodePath from "node:path";

// ── Types ─────────────────────────────────────────────────────────────────────

interface WorkerInput {
  readonly pluginId: string;
  readonly hookSource: string;
  readonly ctx: Readonly<Record<string, unknown>>;
}

interface WorkerSuccess {
  readonly ok: true;
}

interface WorkerFailure {
  readonly ok: false;
  readonly error: string;
  readonly code?: string | undefined;
}

// ── Module allow/block list ───────────────────────────────────────────────────

const BLOCKED_MODULES = new Set([
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

// ── Safe subsets of allowed modules ──────────────────────────────────────────

const safeCrypto = Object.freeze({
  randomUUID: () => nodeCrypto.randomUUID(),
  randomBytes: (n: number) => nodeCrypto.randomBytes(n),
  createHash: (algo: string) => nodeCrypto.createHash(algo),
  createHmac: (algo: string, key: string | Buffer) => nodeCrypto.createHmac(algo, key),
});

const safePath = Object.freeze({
  join: (...segments: string[]) => nodePath.join(...segments),
  basename: (p: string, ext?: string) => nodePath.basename(p, ext),
  dirname: (p: string) => nodePath.dirname(p),
  extname: (p: string) => nodePath.extname(p),
  relative: (from: string, to: string) => nodePath.relative(from, to),
  isAbsolute: (p: string) => nodePath.isAbsolute(p),
  normalize: (p: string) => nodePath.normalize(p),
});

const ALLOWED: Readonly<Record<string, unknown>> = Object.freeze({
  crypto: safeCrypto,
  "node:crypto": safeCrypto,
  path: safePath,
  "node:path": safePath,
});

// ── Require interceptor ───────────────────────────────────────────────────────

function makeWorkerRequire(pluginId: string): (modName: string) => unknown {
  return function workerRequire(modName: string): unknown {
    const normalised = modName.trim();

    if (BLOCKED_MODULES.has(normalised)) {
      const err = new Error(
        `Plugin "${pluginId}" attempted to require blocked module "${normalised}".`,
      );
      (err as NodeJS.ErrnoException).code = "ERR_SANDBOX_BLOCKED_MODULE";
      throw err;
    }

    const allowed = ALLOWED[normalised];
    if (allowed !== undefined) return allowed;

    const err = new Error(
      `Plugin "${pluginId}" attempted to require unknown module "${normalised}".`,
    );
    (err as NodeJS.ErrnoException).code = "ERR_SANDBOX_BLOCKED_MODULE";
    throw err;
  };
}

// ── Main execution ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (parentPort === null) {
    throw new Error("worker-host must be run as a worker_threads Worker.");
  }

  const { pluginId, hookSource, ctx } = workerData as WorkerInput;

  // Inject require interceptor into this module's scope via globalThis so the
  // hook source (evaluated below) can call require() without importing it.
  // NOTE: This is the worker's own globalThis — completely isolated from the
  // parent thread's globalThis.
  (globalThis as Record<string, unknown>)["require"] = makeWorkerRequire(pluginId);

  let hookFn: unknown;
  try {
    // eval() here runs in the worker's own V8 context.
    // Function.prototype.constructor is the worker's Function — it cannot
    // reach the parent thread's process, require, or module system.
    // eslint-disable-next-line no-eval
    hookFn = eval(hookSource);
  } catch (err) {
    const evalErrCode = (err as NodeJS.ErrnoException).code;
    const result: WorkerFailure = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      ...(evalErrCode !== undefined ? { code: evalErrCode } : {}),
    };
    parentPort.postMessage(result);
    return;
  }

  if (typeof hookFn !== "function") {
    const result: WorkerFailure = {
      ok: false,
      error: `Hook code did not evaluate to a function (got ${typeof hookFn}).`,
    };
    parentPort.postMessage(result);
    return;
  }

  try {
    // ctx is a JSON-deserialised plain object — no live host references.
    await (hookFn as (ctx: unknown) => Promise<void>)(Object.freeze(ctx));
    const result: WorkerSuccess = { ok: true };
    parentPort.postMessage(result);
  } catch (err) {
    const hookErrCode = (err as NodeJS.ErrnoException).code;
    const result: WorkerFailure = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      ...(hookErrCode !== undefined ? { code: hookErrCode } : {}),
    };
    parentPort.postMessage(result);
  }
}

await main();