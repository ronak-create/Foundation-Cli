import fs from "node:fs/promises";
import path from "node:path";
import { mergeWith } from "lodash-es";
import yaml from "js-yaml";
import { FoundationError } from "../errors.js";
import { safeResolve } from "../path-utils.js";
import type { ConfigPatch } from "@foundation-cli/plugin-sdk";

// ── Error ─────────────────────────────────────────────────────────────────────

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

type JsonObject = Record<string, JsonValue>;

// ── Deep merge (JSON objects) ─────────────────────────────────────────────────

function deepMergeObjects(
  target: JsonObject,
  source: JsonObject,
  filePath: string,
  keyPath = "",
): JsonObject {
  return mergeWith(
    structuredClone(target) as JsonObject,
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
            `Type mismatch: cannot merge ${Array.isArray(objVal) ? "array" : typeof objVal} with ${
              Array.isArray(srcVal) ? "array" : typeof srcVal
            }`,
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
    ) {
      continue;
    }

    for (const [pkg, patchVersion] of Object.entries(patchDeps as JsonObject)) {
      const existingVersion = (existingDeps as JsonObject)[pkg];
      if (existingVersion !== undefined && existingVersion !== patchVersion) {
        throw new ConfigMergeError(
          filePath,
          `${field}.${pkg}`,
          new Error(
            `Conflicting versions: existing "${String(existingVersion)}" vs patch "${String(patchVersion)}"`,
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
  const patchKeys = new Set(Object.keys(patch));
  const writtenKeys = new Set<string>();

  const result: string[] = lines.map((line) => {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) return line;

    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) return line;

    const key = line.slice(0, eqIdx).trim();
    writtenKeys.add(key);

    if (patchKeys.has(key)) {
      return `${key}=${patch[key] ?? ""}`;
    }
    return line;
  });

  // Append new keys not present in existing
  for (const [key, value] of Object.entries(patch)) {
    if (!writtenKeys.has(key)) {
      result.push(`${key}=${value}`);
    }
  }

  return result.join("\n");
}

// ── Main entry ────────────────────────────────────────────────────────────────

/**
 * Applies a single ConfigPatch to the file at targetDir/patch.targetFile.
 * If the file does not exist, it is seeded with an appropriate empty structure.
 * Writes the result back to disk.
 */
export async function applyPatchToFile(targetDir: string, patch: ConfigPatch): Promise<void> {
  const resolvedTarget = path.resolve(targetDir);
  const absolutePath = safeResolve(resolvedTarget, patch.targetFile);

  // Read existing content (or seed)
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
  } else {
    throw new ConfigMergeError(
      patch.targetFile,
      "(root)",
      new Error(`Unsupported config file type. Supported: .json, .yaml, .yml, .env`),
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
  return "";
}
