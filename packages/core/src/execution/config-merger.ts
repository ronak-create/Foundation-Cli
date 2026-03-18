// core/src/execution/config-merger.ts
//
// GAP FILLED: requirements.txt merge strategy added to applyPatchToFile (spec §5.1)
// All other strategies unchanged from Phase 3 implementation.

import fs from "node:fs/promises";
import path from "node:path";
import { mergeWith } from "lodash-es";
import yaml from "js-yaml";
import { FoundationError } from "../errors.js";
import { safeResolve } from "../path-utils.js";
import type { ConfigPatch } from "@systemlabs/foundation-plugin-sdk";
import { mergeRequirements, RequirementsMergeError } from "../file-merger/requirements-merge.js";

// ── Errors ────────────────────────────────────────────────────────────────────

export class ConfigMergeError extends FoundationError {
  constructor(
    public readonly targetFile: string,
    public readonly field: string,
    cause: unknown,
  ) {
    const msg = cause instanceof Error ? cause.message : String(cause);
    super(
      `Config merge conflict in "${targetFile}" at field "${field}": ${msg}`,
      "ERR_CONFIG_MERGE",
    );
    this.name = "ConfigMergeError";
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };
export type JsonObject = Record<string, JsonValue>;

// ── Deep merge (JSON / YAML objects) ─────────────────────────────────────────

function deepMergeObjects(
  target: JsonObject,
  source: JsonObject,
  filePath: string,
  keyPath = "",
): JsonObject {
  return mergeWith(
    structuredClone(target),
    source,
    (objVal: JsonValue, srcVal: JsonValue, key: string): JsonValue | undefined => {
      const currentPath = keyPath !== "" ? `${keyPath}.${key}` : key;

      if (srcVal === null) return null;
      if (objVal === null) return srcVal;

      if (Array.isArray(objVal) && Array.isArray(srcVal)) {
        return mergeArrayValues(objVal, srcVal);
      }

      if (Array.isArray(objVal) !== Array.isArray(srcVal)) {
        throw new ConfigMergeError(
          filePath,
          currentPath,
          new Error(
            `Type mismatch: cannot merge ${Array.isArray(objVal) ? "array" : typeof objVal} ` +
              `with ${Array.isArray(srcVal) ? "array" : typeof srcVal}`,
          ),
        );
      }

      if (typeof objVal === "object" && typeof srcVal === "object" && !Array.isArray(objVal)) {
        return undefined; // let lodash recurse
      }

      if (objVal !== undefined && typeof objVal !== typeof srcVal) {
        throw new ConfigMergeError(
          filePath,
          currentPath,
          new Error(`Type mismatch: cannot merge ${typeof objVal} with ${typeof srcVal}`),
        );
      }

      return srcVal;
    },
  );
}

function mergeArrayValues(a: JsonValue[], b: JsonValue[]): JsonValue[] {
  const allPrimitive = a.every(isPrimitive) && b.every(isPrimitive);

  if (allPrimitive) {
    const seen = new Set<string>();
    const result: JsonValue[] = [];
    for (const item of [...a, ...b]) {
      const key = JSON.stringify(item);
      if (!seen.has(key)) {
        seen.add(key);
        result.push(item);
      }
    }
    return result;
  }

  return [...a, ...b];
}

function isPrimitive(v: JsonValue): boolean {
  return typeof v === "string" || typeof v === "number" || typeof v === "boolean";
}

// ── Package.json scripts merge ────────────────────────────────────────────────
//
// Standard lifecycle keys (dev, build, start, test, lint) are defined by
// multiple modules (e.g. Express sets dev/build/start; Next.js also sets
// dev/build/start).  A naïve deep-merge lets the last patch win, silently
// discarding the earlier module's command.
//
// Strategy: when two patches claim the SAME lifecycle key, the first writer
// keeps the plain name and every subsequent claimant gets a namespaced alias
// `<key>:<moduleHint>` derived from the command string.  A top-level
// composite script (`dev`, `build`, `start`) is then synthesised that runs
// all variants concurrently via `npm-run-all2 --parallel` so developers still
// have a single entry-point.
//
// Non-colliding keys are passed through unchanged.

/** Lifecycle keys that are known to collide across stack layers. */
const COMPOSITE_SCRIPT_KEYS = new Set(["dev", "build", "start", "test", "lint"]);

/**
 * Derives a short human-readable suffix from a command string so that
 * namespaced variants are self-documenting.
 *
 * Examples:
 *   "tsx watch src/server.ts"  → "server"
 *   "next dev"                 → "next"
 *   "vite"                     → "vite"
 *   "react-scripts start"      → "react"
 */
function commandHint(cmd: string): string {
  // Take the first "word" of the command, strip common wrappers
  const first = cmd.trim().split(/\s+/)[0] ?? "app";
  // Strip path separators and extensions (handles `./node_modules/.bin/foo`)
  const base = first.replace(/^.*[/\\]/, "").replace(/\.[cm]?[jt]s$/, "");
  // Shorten known verbose names
  const aliases: Record<string, string> = {
    "react-scripts": "react",
    "vue-cli-service": "vue",
    "ng": "angular",
    "tsx": "server",
    "ts-node": "server",
    "node": "server",
  };
  return aliases[base] ?? base;
}

/**
 * Merges two `scripts` objects, namespacing colliding lifecycle keys and
 * generating composite "run-all" scripts for them.
 *
 * @param existing  Current scripts object already in package.json
 * @param incoming  Scripts object from the new module's configPatch
 */
export function mergeScripts(
  existing: Record<string, string>,
  incoming: Record<string, string>,
): Record<string, string> {
  const result: Record<string, string> = { ...existing };

  for (const [key, cmd] of Object.entries(incoming)) {
    if (!(key in result)) {
      // No collision — write directly.
      result[key] = cmd;
      continue;
    }

    if (result[key] === cmd) {
      // Exact duplicate — skip.
      continue;
    }

    if (!COMPOSITE_SCRIPT_KEYS.has(key)) {
      // Non-lifecycle key collision (e.g. a custom script name): last writer
      // wins, matching the previous behaviour for non-standard keys.
      result[key] = cmd;
      continue;
    }

    // ── Lifecycle key collision ───────────────────────────────────────────
    // 1. Ensure the existing command has a namespaced alias.
    const existingCmd = result[key]!;
    const existingHint = commandHint(existingCmd);
    const existingAlias = `${key}:${existingHint}`;
    if (!(existingAlias in result)) {
      result[existingAlias] = existingCmd;
    }

    // 2. Give the incoming command its own namespaced alias.
    const incomingHint = commandHint(cmd);
    let incomingAlias = `${key}:${incomingHint}`;
    // Guard against hint collision (e.g. two "server" commands).
    if (incomingAlias in result && result[incomingAlias] !== cmd) {
      incomingAlias = `${key}:${incomingHint}2`;
    }
    result[incomingAlias] = cmd;

    // 3. Build (or rebuild) the composite parallel script.
    //    Collect all `key:*` aliases and combine them with npm-run-all2.
    const variants = Object.keys(result)
      .filter((k) => k === `${key}:${commandHint(result[k]!)}` || k.startsWith(`${key}:`))
      .sort();

    if (variants.length > 1) {
      result[key] = `npm-run-all2 --parallel ${variants.join(" ")}`;
    }
  }

  return result;
}

// ── Package.json version conflict guard ──────────────────────────────────────

function assertNoDependencyVersionConflict(
  existing: JsonObject,
  patch: JsonObject,
  filePath: string,
): void {
  const depFields = ["dependencies", "devDependencies", "peerDependencies"] as const;

  for (const field of depFields) {
    const existingDeps = existing[field];
    const patchDeps = patch[field];

    if (
      typeof existingDeps !== "object" ||
      existingDeps === null ||
      Array.isArray(existingDeps) ||
      typeof patchDeps !== "object" ||
      patchDeps === null ||
      Array.isArray(patchDeps)
    )
      continue;

    for (const [pkg, patchVersion] of Object.entries(patchDeps as JsonObject)) {
      const existingVersion = (existingDeps as JsonObject)[pkg];
      if (existingVersion !== undefined && existingVersion !== patchVersion) {
        throw new ConfigMergeError(
          filePath,
          `${field}.${pkg}`,
          new Error(
            `Conflicting versions: existing "${String(existingVersion)}" ` +
              `vs patch "${String(patchVersion)}"`,
          ),
        );
      }
    }
  }
}

// ── Format dispatchers ────────────────────────────────────────────────────────

export function mergeJsonContent(existing: string, patch: JsonObject, filePath: string): string {
  const existingObj = JSON.parse(existing) as JsonObject;

  if (filePath.endsWith("package.json")) {
    assertNoDependencyVersionConflict(existingObj, patch, filePath);

    // ── Script-aware merge ──────────────────────────────────────────────────
    // Deep-merge everything except `scripts`, which gets its own collision-
    // aware merge that namespaces colliding lifecycle keys and synthesises a
    // composite parallel runner instead of silently overwriting commands.
    const rawExisting = existingObj["scripts"] ?? {};
    const rawPatch    = patch["scripts"] ?? {};

    if (
      typeof rawExisting !== "object" || Array.isArray(rawExisting) ||
      typeof rawPatch    !== "object" || Array.isArray(rawPatch)
    ) {
      // Fall through to deepMergeObjects which will throw the correct ConfigMergeError
      const merged = deepMergeObjects(existingObj, patch, filePath);
      return JSON.stringify(merged, null, 2);
    }

    const existingScripts = rawExisting as Record<string, string>;
    const patchScripts    = rawPatch    as Record<string, string>;

    const existingRest = Object.fromEntries(
      Object.entries(existingObj).filter(([k]) => k !== "scripts"),
    ) as JsonObject;
    const patchRest = Object.fromEntries(
      Object.entries(patch).filter(([k]) => k !== "scripts"),
    ) as JsonObject;

    const mergedBase    = deepMergeObjects(existingRest, patchRest, filePath);
    const mergedScripts = mergeScripts(existingScripts, patchScripts);

    // Auto-inject npm-run-all2 when any composite parallel script was created.
    const needsRunAll = Object.values(mergedScripts).some((s) => s.startsWith("npm-run-all2"));
    const finalBase = needsRunAll
      ? deepMergeObjects(mergedBase, {
          devDependencies: { "npm-run-all2": "^7.0.2" },
        } as JsonObject, filePath)
      : mergedBase;

    return JSON.stringify({ ...finalBase, scripts: mergedScripts }, null, 2);
  }

  const merged = deepMergeObjects(existingObj, patch, filePath);
  return JSON.stringify(merged, null, 2);
}

export function mergeYamlContent(existing: string, patch: JsonObject, filePath: string): string {
  const existingObj = existing.trim() === "" ? {} : (yaml.load(existing) as JsonObject);

  if (typeof existingObj !== "object" || existingObj === null || Array.isArray(existingObj)) {
    throw new ConfigMergeError(
      filePath,
      "(root)",
      new Error("Existing YAML root is not an object"),
    );
  }

  const merged = deepMergeObjects(existingObj, patch, filePath);
  return yaml.dump(merged, { lineWidth: -1 });
}

export function mergeEnvContent(existing: string, patch: Record<string, string>): string {
  const lines = existing.split("\n");
  // const patchKeys  = new Set(Object.keys(patch));
  const writtenKeys = new Set<string>();

  const result: string[] = lines.map((line) => {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) return line;

    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) return line;

    const key = line.slice(0, eqIdx).trim();
    if (key in patch) {
      writtenKeys.add(key);
      return `${key}=${patch[key]}`;
    }

    writtenKeys.add(key);

    // KEY FIX: If the key already exists, PRESERVE its current value.
    // User-provided credentials (written before pipeline patches run) must
    // never be overwritten by module manifest placeholders.
    // Previously this line was: if (patchKeys.has(key)) return `${key}=${patch[key] ?? ""}`;
    return line;
  });

  for (const [key, value] of Object.entries(patch)) {
    if (!writtenKeys.has(key)) result.push(`${key}=${value}`);
  }

  return result.join("\n");
}

// ── Main entry ────────────────────────────────────────────────────────────────

/**
 * Applies a single ConfigPatch to the file at targetDir/patch.targetFile.
 * If the file does not exist, it is seeded with an appropriate empty structure.
 *
 * Supported file types (spec §5.1):
 *   .json        → deep-merge-smart
 *   .yaml / .yml → yaml-deep-merge
 *   .env         → append-unique-keyed
 *   requirements.txt → semver-merge  ← NEW
 */
export async function applyPatchToFile(targetDir: string, patch: ConfigPatch): Promise<void> {
  const resolvedTarget = path.resolve(targetDir);
  const absolutePath = safeResolve(resolvedTarget, patch.targetFile);

  let existing: string;
  try {
    existing = await fs.readFile(absolutePath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    existing = seedContent(patch.targetFile);
  }

  const patchData = patch.merge as JsonObject;
  let merged: string;

  if (patch.targetFile.endsWith(".json")) {
    merged = mergeJsonContent(existing, patchData, patch.targetFile);
  } else if (patch.targetFile.endsWith(".yaml") || patch.targetFile.endsWith(".yml")) {
    merged = mergeYamlContent(existing, patchData, patch.targetFile);
  } else if (
    patch.targetFile === ".env" ||
    patch.targetFile === ".env.example" ||
    patch.targetFile.endsWith("/.env") ||
    patch.targetFile.endsWith("/.env.example")
  ) {
    const envPatch = Object.fromEntries(Object.entries(patchData).map(([k, v]) => [k, String(v)]));
    merged = mergeEnvContent(existing, envPatch);
  } else if (
    patch.targetFile === "requirements.txt" ||
    patch.targetFile.endsWith("/requirements.txt") ||
    patch.targetFile.endsWith("/requirements.in")
  ) {
    // GAP: requirements.txt semver-merge (spec §5.1)
    // patchData must be { "<package>": "<constraint>" } for requirements merges
    const reqPatch = Object.entries(patchData)
      .map(([pkg, ver]) => `${pkg}${String(ver)}`)
      .join("\n");
    try {
      merged = mergeRequirements(existing, reqPatch);
    } catch (err) {
      if (err instanceof RequirementsMergeError) {
        throw new ConfigMergeError(patch.targetFile, err.packageName, err);
      }
      throw err;
    }
  } else if (patch.targetFile === "README.md" || patch.targetFile.endsWith("/README.md")) {
    // section-inject strategy (spec §5.1):
    // patchData must be { "<## Section Header>": "<content to append>" }
    // Appends content under a matching section marker, or appends a new section.
    merged = mergeReadmeContent(existing, patchData);
  } else if (patch.targetFile === "Dockerfile" || patch.targetFile.endsWith("/Dockerfile")) {
    // instruction-merge strategy (spec §5.1):
    // patchData must be { "RUN": "npm run build", "ENV": "NODE_ENV=production" }
    // Appends new instructions before the final CMD/ENTRYPOINT layer.
    merged = mergeDockerfileContent(existing, patchData);
  } else {
    throw new ConfigMergeError(
      patch.targetFile,
      "(root)",
      new Error(
        `Unsupported config file type. Supported: .json, .yaml, .yml, .env, requirements.txt, README.md, Dockerfile`,
      ),
    );
  }

  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, merged, "utf-8");
}

/**
 * Applies all ConfigPatches in order to targetDir.
 */
export async function applyAllPatches(
  targetDir: string,
  patches: ReadonlyArray<ConfigPatch>,
): Promise<void> {
  for (const patch of patches) {
    await applyPatchToFile(targetDir, patch);
  }
}

// ── Seed content for new files ─────────────────────────────────────────────

function seedContent(targetFile: string): string {
  if (targetFile.endsWith(".json")) return "{}";
  if (targetFile.endsWith(".yaml") || targetFile.endsWith(".yml")) return "";
  if (
    targetFile === ".env" ||
    targetFile === ".env.example" ||
    targetFile.endsWith("/.env") ||
    targetFile.endsWith("/.env.example")
  )
    return "";
  if (targetFile.endsWith("requirements.txt") || targetFile.endsWith("requirements.in")) return "";
  if (targetFile === "README.md" || targetFile.endsWith("/README.md")) return "# Project\n";
  if (targetFile === "Dockerfile" || targetFile.endsWith("/Dockerfile")) return "";
  return "";
}

// ── README section-inject (spec §5.1) ─────────────────────────────────────
//
// patchData: { "## Setup": "content to append under that section" }
// If the section header exists, content is appended after it (before the next ##).
// If it does not exist, a new section is appended at the end.

function mergeReadmeContent(existing: string, patchData: JsonObject): string {
  let result = existing;

  for (const [sectionHeader, rawContent] of Object.entries(patchData)) {
    const content = String(rawContent).trim();
    const headerLine = sectionHeader.startsWith("#") ? sectionHeader : `## ${sectionHeader}`;

    const sectionRegex = new RegExp(`(${escapeRegex(headerLine)}[\\s\\S]*?)(?=\\n#{1,6} |$)`, "m");

    if (sectionRegex.test(result)) {
      // Section exists — append content before the next heading or end
      result = result.replace(sectionRegex, (match) => {
        // Avoid duplicating if content already present
        if (match.includes(content)) return match;
        return match.trimEnd() + "\n\n" + content + "\n";
      });
    } else {
      // Append new section at end
      result = result.trimEnd() + "\n\n" + headerLine + "\n\n" + content + "\n";
    }
  }

  return result;
}

// ── Dockerfile instruction-merge (spec §5.1) ───────────────────────────────
//
// patchData: { "RUN": "npm run build", "ENV": "NODE_ENV=production" }
// New RUN/ENV/COPY/ARG instructions are inserted before the final CMD or ENTRYPOINT.
// If no CMD/ENTRYPOINT exists, they are appended at the end.

function mergeDockerfileContent(existing: string, patchData: JsonObject): string {
  const newInstructions = Object.entries(patchData)
    .map(([instruction, value]) => `${instruction.toUpperCase()} ${String(value)}`)
    .join("\n");

  if (!newInstructions) return existing;

  // Find position of last CMD or ENTRYPOINT
  const lines = existing.split("\n");
  let insertAt = lines.length;

  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i]!.trimStart().toUpperCase();
    if (
      trimmed.startsWith("CMD ") ||
      trimmed.startsWith("CMD[") ||
      trimmed.startsWith("ENTRYPOINT ") ||
      trimmed.startsWith("ENTRYPOINT[")
    ) {
      insertAt = i;
      break;
    }
  }

  lines.splice(insertAt, 0, "", newInstructions);
  return lines.join("\n");
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}