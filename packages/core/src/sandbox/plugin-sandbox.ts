import vm from "node:vm";
import nodeCrypto from "node:crypto";
import type { PluginHookContext } from "@foundation-cli/plugin-sdk";
import { FoundationError } from "../errors.js";
import { makeSafePath } from "./safe-path.js";

// ── Errors ────────────────────────────────────────────────────────────────────

export class SandboxError extends FoundationError {
  constructor(
    public readonly pluginId: string,
    cause: unknown,
  ) {
    const msg = cause instanceof Error ? cause.message : String(cause);
    super(`Sandbox execution failed for plugin "${pluginId}": ${msg}`, "ERR_SANDBOX");
    this.name = "SandboxError";
  }
}

export class SandboxBlockedModuleError extends FoundationError {
  constructor(
    public readonly pluginId: string,
    public readonly moduleName: string,
  ) {
    super(
      `Plugin "${pluginId}" attempted to require blocked module "${moduleName}".`,
      "ERR_SANDBOX_BLOCKED_MODULE",
    );
    this.name = "SandboxBlockedModuleError";
  }
}

export class SandboxTimeoutError extends FoundationError {
  constructor(
    public readonly pluginId: string,
    public readonly timeoutMs: number,
  ) {
    super(
      `Plugin "${pluginId}" hook exceeded the ${timeoutMs}ms sandbox timeout.`,
      "ERR_SANDBOX_TIMEOUT",
    );
    this.name = "SandboxTimeoutError";
  }
}

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Modules that are unconditionally blocked inside the sandbox.
 * Any attempt to require these throws SandboxBlockedModuleError.
 */
export const BLOCKED_MODULES: ReadonlySet<string> = new Set([
  "fs",
  "fs/promises",
  "node:fs",
  "node:fs/promises",
  "net",
  "node:net",
  "child_process",
  "node:child_process",
  "cluster",
  "node:cluster",
  "worker_threads",
  "node:worker_threads",
  "http",
  "node:http",
  "https",
  "node:https",
  "dgram",
  "node:dgram",
  "dns",
  "node:dns",
  "os",
  "node:os",
  "v8",
  "node:v8",
  "vm",
  "node:vm",
]);

/**
 * Default hook execution timeout in milliseconds.
 * Prevents infinite loops from stalling the pipeline.
 */
const DEFAULT_HOOK_TIMEOUT_MS = 5_000;

// ── Sandbox context ───────────────────────────────────────────────────────────

/**
 * A namespaced logger injected into the sandbox.
 * Plugin log output is prefixed and routed through the host logger,
 * keeping it out of stdout directly.
 */
export interface SandboxLogger {
  readonly log: (message: string) => void;
  readonly warn: (message: string) => void;
  readonly error: (message: string) => void;
}

// function makeLogger(pluginId: string): SandboxLogger {
//   return Object.freeze({
//     log: (msg: string) => process.stdout.write(`[plugin:${pluginId}] ${msg}\n`),
//     warn: (msg: string) => process.stderr.write(`[plugin:${pluginId}] WARN  ${msg}\n`),
//     error: (msg: string) => process.stderr.write(`[plugin:${pluginId}] ERROR ${msg}\n`),
//   });
// }

/**
 * A frozen subset of node:crypto safe for use in plugin hooks.
 * Only pure hashing/random functions are exposed — no key material access.
 */
function makeSafeCrypto(): Readonly<{
  randomUUID: () => string;
  randomBytes: (n: number) => Buffer;
  createHash: (algorithm: string) => ReturnType<typeof nodeCrypto.createHash>;
  createHmac: (algorithm: string, key: string | Buffer) => ReturnType<typeof nodeCrypto.createHmac>;
}> {
  return Object.freeze({
    randomUUID: () => nodeCrypto.randomUUID(),
    randomBytes: (n: number) => nodeCrypto.randomBytes(n),
    createHash: (algo: string) => nodeCrypto.createHash(algo),
    createHmac: (algo: string, key: string | Buffer) => nodeCrypto.createHmac(algo, key),
  });
}

// ── Require interceptor ───────────────────────────────────────────────────────

function makeSandboxRequire(pluginId: string): (modName: string) => unknown {
  const safeCrypto = makeSafeCrypto();
  const safePath = makeSafePath();

  const ALLOWED: Readonly<Record<string, unknown>> = Object.freeze({
    crypto: safeCrypto,
    "node:crypto": safeCrypto,
    path: safePath,
    "node:path": safePath,
  });

  return function sandboxRequire(modName: string): unknown {
    // Normalise — strip trailing slashes, lower-case for comparison
    const normalised = modName.trim();

    if (BLOCKED_MODULES.has(normalised)) {
      throw new SandboxBlockedModuleError(pluginId, normalised);
    }

    const allowed = ALLOWED[normalised];
    if (allowed !== undefined) {
      return allowed;
    }

    // Anything else — unknown module — is also blocked for safety.
    throw new SandboxBlockedModuleError(pluginId, normalised);
  };
}

// ── Sandbox VM context factory ────────────────────────────────────────────────

function createSandboxContext(pluginId: string): vm.Context {
  //   const logger = makeLogger(pluginId);

  // The sandbox global object. Everything NOT listed here is unavailable.
  const sandbox = Object.create(null) as Record<string, unknown>;

  sandbox.require = makeSandboxRequire(pluginId);
  sandbox.Promise = Promise;
  sandbox.setTimeout = setTimeout;
  sandbox.clearTimeout = clearTimeout;
  sandbox.setInterval = setInterval;
  sandbox.clearInterval = clearInterval;
  sandbox.queueMicrotask = queueMicrotask;
  sandbox.console = Object.freeze({
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    info: console.info.bind(console),
  });
  sandbox.JSON = JSON;
  sandbox.Math = Math;
  sandbox.Date = Date;
  sandbox.parseInt = parseInt;
  sandbox.parseFloat = parseFloat;
  sandbox.isNaN = isNaN;
  sandbox.isFinite = isFinite;
  sandbox.encodeURIComponent = encodeURIComponent;
  sandbox.decodeURIComponent = decodeURIComponent;
  sandbox.encodeURI = encodeURI;
  sandbox.decodeURI = decodeURI;

  // Explicitly blocked
  sandbox.process = undefined;
  sandbox.global = undefined;
  sandbox.globalThis = undefined;
  sandbox.__dirname = undefined;
  sandbox.__filename = undefined;
  sandbox.module = undefined;
  sandbox.exports = undefined;

  const context = vm.createContext(sandbox);
  return context;
}

// ── Hook execution ────────────────────────────────────────────────────────────

export interface SandboxHookOptions {
  /** Milliseconds before the hook is considered timed out. Default: 5000. */
  readonly timeoutMs?: number;
}

/**
 * Executes a plugin hook function string inside a vm.Script sandbox.
 *
 * The hook code must export (i.e. evaluate to) an async function with the
 * signature:  `async (ctx) => void`
 *
 * The context (`ctx`) is injected as a frozen object — the hook cannot
 * mutate it.
 *
 * @param pluginId   - Used for error messages and log prefix.
 * @param hookSource - The hook's source code as a string.
 * @param ctx        - The PluginHookContext passed to the hook.
 * @param options    - Execution options (timeout, etc.).
 */
export async function executeSandboxedHook(
  pluginId: string,
  hookSource: string,
  ctx: PluginHookContext,
  options: SandboxHookOptions = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_HOOK_TIMEOUT_MS;

  // Wrap the hook source so it evaluates to the hook function.
  // The plugin author writes:  `async function hook(ctx) { ... }; hook`
  // OR:                        `module.exports = async (ctx) => { ... }`
  // We normalise by wrapping in an IIFE that returns the last expression.
  const wrappedSource = hookSource.trim();
  const sandboxCtx = createSandboxContext(pluginId);
  const frozenCtx = Object.freeze({ ...ctx });

  let hookFn: unknown;
  try {
    const script = new vm.Script(wrappedSource, {
      filename: `plugin:${pluginId}`,
    });

    hookFn = script.runInContext(sandboxCtx, {
      timeout: timeoutMs,
    });
  } catch (err) {
    if (err instanceof SandboxBlockedModuleError) throw err;
    throw new SandboxError(pluginId, err);
  }

  if (typeof hookFn !== "function") {
    throw new SandboxError(
      pluginId,
      new Error(`Hook code did not evaluate to a function (got ${typeof hookFn}).`),
    );
  }

  // Execute the async hook with a race-based timeout.
  const hookPromise = Promise.resolve((hookFn as (ctx: unknown) => unknown)(frozenCtx));

  const timeoutPromise = new Promise<never>((_, reject) => {
    const t = setTimeout(() => {
      reject(new SandboxTimeoutError(pluginId, timeoutMs));
    }, timeoutMs);
    // Allow the process to exit if only this timer is pending.
    if (typeof (t as NodeJS.Timeout).unref === "function") {
      (t as NodeJS.Timeout).unref();
    }
  });

  try {
    await Promise.race([hookPromise, timeoutPromise]);
  } catch (err) {
    if (err instanceof SandboxBlockedModuleError || err instanceof SandboxTimeoutError) {
      throw err;
    }
    throw new SandboxError(pluginId, err);
  }
}

/**
 * Returns true when a hook source string should be treated as empty/no-op.
 * Handles undefined, empty string, and whitespace-only strings.
 */
export function isEmptyHookSource(source: string | undefined): boolean {
  return source === undefined || source.trim().length === 0;
}
