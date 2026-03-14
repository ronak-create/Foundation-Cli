/**
 * ModuleLoader — automatic module discovery and registration.
 *
 * Scans a directory tree for module files and registers every
 * PluginDefinition it finds into a ModuleRegistry, validating each
 * manifest with ManifestValidator before registration.
 *
 * ## Discovery contract
 *
 * A file is a valid module source if it satisfies ANY of these:
 *
 *   (A) Named export — any export key whose value is a PluginDefinition
 *       object. This is what all built-in modules use today:
 *         export const nextjsModule: PluginDefinition = { manifest: … }
 *
 *   (B) Default PluginFactory — `export default function(): PluginDefinition`
 *       The contract used by `loadModulesFromDirectory` (backward compat).
 *
 *   (C) manifest.json sidecar — a `manifest.json` in the same directory,
 *       valid per ManifestValidator. Used by addon plugins (stripe, redis, openai).
 *
 * ## Scan modes
 *
 *   discoverFlat(dir)      — reads every *.ts / *.js file in `dir` (no recursion).
 *                            Matches the old loadModulesFromDirectory behaviour.
 *
 *   discoverByCategory(dir) — reads `dir/{category}/{name}.ts` (one level deep).
 *                             Matches the `packages/modules/src/` layout.
 *
 *   discoverRecursive(dir)  — depth-first walk; stops descending into a
 *                             sub-directory when it contains manifest.json.
 *
 * All three modes share the same `attemptLoad()` pipeline and produce the
 * same `DiscoveryResult` shape.
 *
 * @module module-registry/module-loader
 */

import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";
// import { pathToFileURL } from "node:url";
import type { PluginDefinition, PluginFactory } from "@systemlabs/foundation-plugin-sdk";
import { ManifestValidator } from "../manifest-validator/validator.js";
import type { ModuleRegistry } from "./registry.js";
import type { SandboxedHooks } from "../plugin-installer/plugin-installer.js";

// ── Public types ──────────────────────────────────────────────────────────────

/** Outcome for a single inspected path. */
export type LoadOutcome =
  | { readonly status: "loaded"; readonly id: string; readonly filePath: string }
  | {
      readonly status: "skipped";
      readonly reason: "duplicate" | "no-module";
      readonly filePath: string;
    }
  | { readonly status: "failed"; readonly error: Error; readonly filePath: string };

/**
 * Summary returned by every discover function.
 *
 *   loaded   — module IDs successfully registered during this call
 *   skipped  — paths that were inspected but produced nothing registrable
 *   failed   — paths that threw during import/validation, with the error
 *   inspected — total number of paths examined (loaded + skipped + failed)
 */
export interface DiscoveryResult {
  readonly loaded: ReadonlyArray<string>;
  readonly skipped: ReadonlyArray<string>;
  readonly failed: ReadonlyArray<{ readonly filePath: string; readonly error: Error }>;
  readonly inspected: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** File suffixes we never attempt to load. */
const SKIP_SUFFIXES = [".d.ts", ".test.ts", ".test.js", ".spec.ts", ".spec.js"] as const;

/** Directory names we never descend into. */
const SKIP_DIRS = new Set(["node_modules", "dist", "__tests__", ".foundation", ".turbo"]);

// ── Type guards ───────────────────────────────────────────────────────────────

/**
 * Minimum-shape guard for PluginDefinition.
 * We check `manifest.id / name / version` — the three fields ManifestValidator
 * requires at minimum before running the full schema check.
 */
function isPluginDefinition(v: unknown): v is PluginDefinition {
  if (typeof v !== "object" || v === null) return false;
  const m = (v as Record<string, unknown>)["manifest"];
  if (typeof m !== "object" || m === null) return false;
  const manifest = m as Record<string, unknown>;
  return (
    typeof manifest["id"] === "string" &&
    typeof manifest["name"] === "string" &&
    typeof manifest["version"] === "string"
  );
}

function isPluginFactory(v: unknown): v is PluginFactory {
  return typeof v === "function";
}

function isLoadableExtension(name: string): boolean {
  if (SKIP_SUFFIXES.some((s) => name.endsWith(s))) return false;
  return name.endsWith(".ts") || name.endsWith(".js") || name.endsWith(".mjs");
}

// ── Core load pipeline ────────────────────────────────────────────────────────

/**
 * Attempts to load ONE file or directory as a module.
 *
 * For directories: looks for manifest.json sidecar (Strategy C).
 * For files:
 *   1. Dynamically import the file.
 *   2. Walk named exports for a PluginDefinition (Strategy A).
 *   3. Fall back to default PluginFactory (Strategy B).
 */
async function attemptLoad(
  entryPath: string,
  registry: ModuleRegistry,
  source: "builtin" | "plugin",
): Promise<LoadOutcome> {
  // ── Directory — look for manifest.json sidecar ────────────────────────────
  let stat: Awaited<ReturnType<typeof fs.stat>>;
  try {
    stat = await fs.stat(entryPath);
  } catch (err) {
    return { status: "failed", error: err as Error, filePath: entryPath };
  }

  if (stat.isDirectory()) {
    return attemptLoadManifestDir(entryPath, registry, source);
  }

  // ── File — guard on extension ─────────────────────────────────────────────
  if (!isLoadableExtension(path.basename(entryPath))) {
    return { status: "skipped", reason: "no-module", filePath: entryPath };
  }

  // ── Dynamic import ────────────────────────────────────────────────────────
  let imported: unknown;
  try {
    imported = await import(entryPath);
  } catch (err) {
    return { status: "failed", error: err as Error, filePath: entryPath };
  }

  // ── Strategy A: scan named exports ────────────────────────────────────────
  if (typeof imported === "object" && imported !== null) {
    for (const [key, value] of Object.entries(imported as Record<string, unknown>)) {
      if (key === "default") continue;
      if (!isPluginDefinition(value)) continue;
      const outcome = tryRegister(value, entryPath, registry, source);
      if (outcome.status !== "skipped" || outcome.reason !== "no-module") return outcome;
    }
  }

  // ── Strategy B: default PluginFactory ────────────────────────────────────
  const def = (imported as Record<string, unknown>)?.["default"];
  if (isPluginFactory(def)) {
    let plugin: PluginDefinition;
    try {
      plugin = def();
    } catch (err) {
      return { status: "failed", error: err as Error, filePath: entryPath };
    }
    return tryRegister(plugin, entryPath, registry, source);
  }

  return { status: "skipped", reason: "no-module", filePath: entryPath };
}

/**
 * Loads a module from a directory that contains manifest.json (Strategy C).
 * Also reads an optional hooks.json for sandboxed hook sources.
 */
async function attemptLoadManifestDir(
  dirPath: string,
  registry: ModuleRegistry,
  source: "builtin" | "plugin",
): Promise<LoadOutcome> {
  let rawManifest: unknown;
  const manifestPath = path.join(dirPath, "manifest.json");

  let raw: string;
  try {
    raw = await fs.readFile(manifestPath, "utf-8");
  } catch {
    return { status: "skipped", reason: "no-module", filePath: dirPath };
  }

  try {
    rawManifest = JSON.parse(raw);
  } catch (err) {
    return { status: "failed", error: err as Error, filePath: manifestPath };
  }

  try {
    ManifestValidator.assert(rawManifest);
  } catch (err) {
    return { status: "failed", error: err as Error, filePath: dirPath };
  }

  const manifest = rawManifest;
  if (registry.hasModule(manifest.id)) {
    return { status: "skipped", reason: "duplicate", filePath: dirPath };
  }

  let sandboxedHooks: SandboxedHooks = {};
  try {
    sandboxedHooks = JSON.parse(
      await fs.readFile(path.join(dirPath, "hooks.json"), "utf-8"),
    ) as SandboxedHooks;
  } catch {
    /* optional */
  }

  try {
    if (source === "plugin") {
      registry.registerPlugin({ manifest }, sandboxedHooks);
    } else {
      registry.registerModule({ manifest });
    }
    return { status: "loaded", id: manifest.id, filePath: dirPath };
  } catch (err) {
    return { status: "failed", error: err as Error, filePath: dirPath };
  }
}

/**
 * Validates and registers a PluginDefinition object.
 * Returns `{ status: "skipped", reason: "no-module" }` when the object does
 * not pass the minimum-shape guard (so the caller can continue scanning other
 * exports in the same file).
 */
function tryRegister(
  plugin: PluginDefinition,
  filePath: string,
  registry: ModuleRegistry,
  source: "builtin" | "plugin",
): LoadOutcome {
  if (registry.hasModule(plugin.manifest.id)) {
    return { status: "skipped", reason: "duplicate", filePath };
  }
  try {
    ManifestValidator.assert(plugin.manifest);
  } catch (err) {
    return { status: "failed", error: err as Error, filePath };
  }
  try {
    if (source === "plugin") {
      registry.registerPlugin(plugin);
    } else {
      registry.registerModule(plugin);
    }
    return { status: "loaded", id: plugin.manifest.id, filePath };
  } catch (err) {
    return { status: "failed", error: err as Error, filePath };
  }
}

/** Reduces an array of LoadOutcomes into the public DiscoveryResult shape. */
function buildResult(outcomes: ReadonlyArray<LoadOutcome>): DiscoveryResult {
  const loaded: string[] = [];
  const skipped: string[] = [];
  const failed: { filePath: string; error: Error }[] = [];

  for (const o of outcomes) {
    if (o.status === "loaded") loaded.push(o.id);
    if (o.status === "skipped") skipped.push(o.filePath);
    if (o.status === "failed") failed.push({ filePath: o.filePath, error: o.error });
  }

  return { loaded, skipped, failed, inspected: outcomes.length };
}

// ── Public scan functions ─────────────────────────────────────────────────────

/**
 * **Flat scan** — loads every `*.ts` / `*.js` file directly in `dir`.
 * No recursion. Replaces and extends the old `loadModulesFromDirectory`.
 */
export async function discoverFlat(
  dir: string,
  registry: ModuleRegistry,
  source: "builtin" | "plugin" = "builtin",
): Promise<DiscoveryResult> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { loaded: [], skipped: [], failed: [], inspected: 0 };
    }
    throw err;
  }

  const outcomes: LoadOutcome[] = [];
  for (const entry of entries) {
    if (!entry.isFile() && !entry.isSymbolicLink()) continue;
    outcomes.push(await attemptLoad(path.join(dir, entry.name), registry, source));
  }
  return buildResult(outcomes);
}

/**
 * **Category scan** — mirrors the `packages/modules/src/{category}/` layout.
 *
 * Scans immediate subdirectories of `rootDir` (treating each as a category),
 * then loads every file inside. Ignores `addon/` subdirectory since those
 * are loaded as plugins via `loadAddonPlugins`.
 *
 * ```
 * rootDir/
 *   frontend/nextjs.ts   ← picked up
 *   backend/express.ts   ← picked up
 *   addon/stripe/        ← skipped (plugin, not builtin)
 * ```
 */
export async function discoverByCategory(
  rootDir: string,
  registry: ModuleRegistry,
  source: "builtin" | "plugin" = "builtin",
  skipDirs: ReadonlyArray<string> = ["addon"],
): Promise<DiscoveryResult> {
  let topEntries: Dirent[];
  try {
    topEntries = await fs.readdir(rootDir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { loaded: [], skipped: [], failed: [], inspected: 0 };
    }
    throw err;
  }

  const outcomes: LoadOutcome[] = [];

  for (const topEntry of topEntries) {
    if (!topEntry.isDirectory()) continue;
    if (SKIP_DIRS.has(topEntry.name)) continue;
    if (skipDirs.includes(topEntry.name)) continue;

    const catDir = path.join(rootDir, topEntry.name);
    let catEntries: Dirent[];
    try {
      catEntries = await fs.readdir(catDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of catEntries) {
      if (!entry.isFile()) continue;
      outcomes.push(await attemptLoad(path.join(catDir, entry.name), registry, source));
    }
  }

  return buildResult(outcomes);
}

/**
 * **Recursive scan** — depth-first walk from `rootDir`.
 *
 * When a sub-directory contains `manifest.json`, it is loaded as a
 * manifest-directory module (Strategy C) and NOT descended into further.
 * Otherwise descends into every non-ignored child directory.
 */
export async function discoverRecursive(
  rootDir: string,
  registry: ModuleRegistry,
  source: "builtin" | "plugin" = "builtin",
): Promise<DiscoveryResult> {
  const outcomes: LoadOutcome[] = [];
  await walkDir(rootDir, registry, source, outcomes);
  return buildResult(outcomes);
}

async function walkDir(
  dir: string,
  registry: ModuleRegistry,
  source: "builtin" | "plugin",
  outcomes: LoadOutcome[],
): Promise<void> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  // If this directory owns a manifest.json, load it as a module dir and stop.
  if (entries.some((e) => e.isFile() && e.name === "manifest.json")) {
    outcomes.push(await attemptLoadManifestDir(dir, registry, source));
    return;
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith(".")) {
        await walkDir(path.join(dir, entry.name), registry, source, outcomes);
      }
    } else if (entry.isFile()) {
      outcomes.push(await attemptLoad(path.join(dir, entry.name), registry, source));
    }
  }
}

// ── ModuleLoader class ────────────────────────────────────────────────────────

/**
 * High-level stateful wrapper around the three scan functions.
 *
 * ```ts
 * const loader = new ModuleLoader(registry);
 * const result = await loader.loadFromDirectory(srcDir, "category");
 * console.log(loader.formatSummary(result));
 * ```
 *
 * The `log` callback is optional — useful for piping output through a logger
 * or suppressing it entirely in tests.
 */
export class ModuleLoader {
  readonly #registry: ModuleRegistry;
  readonly #log: (msg: string) => void;

  constructor(
    registry: ModuleRegistry,
    log: (msg: string) => void = (): void => {
      /* silent */
    },
  ) {
    this.#registry = registry;
    this.#log = log;
  }

  /**
   * Runs the named scan mode against `dir` and returns the DiscoveryResult.
   *
   * @param dir     Absolute path to scan.
   * @param mode    "flat" | "category" | "recursive"  (default: "category")
   * @param source  Whether to register as "builtin" or "plugin" (default: "builtin")
   */
  async loadFromDirectory(
    dir: string,
    mode: "flat" | "category" | "recursive" = "category",
    source: "builtin" | "plugin" = "builtin",
  ): Promise<DiscoveryResult> {
    this.#log(`[ModuleLoader] scanning ${dir} (${mode})`);

    switch (mode) {
      case "flat":
        return discoverFlat(dir, this.#registry, source);
      case "category":
        return discoverByCategory(dir, this.#registry, source);
      case "recursive":
        return discoverRecursive(dir, this.#registry, source);
    }
  }

  /**
   * Returns a formatted multi-line summary string, e.g.:
   *
   * ```
   * Loaded modules:
   *   - frontend-nextjs
   *   - backend-express
   *   …
   * 6 loaded  0 failed  2 skipped
   * ```
   */
  formatSummary(result: DiscoveryResult): string {
    const lines: string[] = ["Loaded modules:"];

    if (result.loaded.length === 0) {
      lines.push("  (none)");
    } else {
      for (const id of result.loaded) {
        lines.push(`  - ${id}`);
      }
    }

    const parts: string[] = [
      `${result.loaded.length} loaded`,
      ...(result.failed.length > 0 ? [`${result.failed.length} failed`] : []),
      ...(result.skipped.length > 0 ? [`${result.skipped.length} skipped`] : []),
    ];
    if (parts.length > 0) lines.push(parts.join("  "));

    return lines.join("\n");
  }

  /** Writes the summary string via the logger supplied at construction time. */
  printSummary(result: DiscoveryResult): void {
    this.#log(this.formatSummary(result));
  }
}

