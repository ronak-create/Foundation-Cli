import { mergeWith } from "lodash-es";
import yaml from "js-yaml";
import { FoundationError } from "../errors.js";

// ── Error ─────────────────────────────────────────────────────────────────────

export class MergeConflictError extends FoundationError {
  constructor(
    public readonly field: string,
    public readonly typeA: string,
    public readonly typeB: string,
  ) {
    super(
      `Merge conflict at field "${field}": cannot merge ${typeA} with ${typeB}.`,
      "ERR_MERGE_CONFLICT",
    );
    this.name = "MergeConflictError";
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type MergeableValue =
  | string
  | number
  | boolean
  | null
  | MergeableValue[]
  | { [key: string]: MergeableValue };

export type MergeableObject = Record<string, MergeableValue>;

// ── Core deep merge ───────────────────────────────────────────────────────────

/**
 * Deep-merges `source` into `target`.
 *
 * Rules:
 *  - Objects are merged recursively.
 *  - Arrays are concatenated and deduplicated (string/number/boolean elements).
 *    Arrays of objects are concatenated without deduplication.
 *  - Scalar types must match; mismatched types throw MergeConflictError.
 *  - `null` from source overwrites target.
 */
export function deepMerge(
  target: MergeableObject,
  source: MergeableObject,
  _path = "",
): MergeableObject {
  return mergeWith(
    structuredClone(target),
    source,
    (
      objValue: MergeableValue,
      srcValue: MergeableValue,
      key: string,
    ): MergeableValue | undefined => {
      const fieldPath = _path !== "" ? `${_path}.${key}` : key;

      // null source → overwrite
      if (srcValue === null) return null;
      if (objValue === null) return srcValue;

      // Array + Array → concat + dedupe primitives
      if (Array.isArray(objValue) && Array.isArray(srcValue)) {
        return mergeArrays(objValue, srcValue);
      }

      // Array vs non-array → conflict
      if (Array.isArray(objValue) !== Array.isArray(srcValue)) {
        throw new MergeConflictError(
          fieldPath,
          Array.isArray(objValue) ? "array" : typeof objValue,
          Array.isArray(srcValue) ? "array" : typeof srcValue,
        );
      }

      // Object + Object → recurse (lodash handles this when we return undefined)
      if (
        typeof objValue === "object" &&
        typeof srcValue === "object" &&
        !Array.isArray(objValue)
      ) {
        return undefined; // let lodash merge recursively
      }

      // If target field doesn't exist yet → allow write
      if (objValue === undefined) {
        return srcValue;
      }

      // Scalar vs scalar: type must match
      if (typeof objValue !== typeof srcValue) {
        throw new MergeConflictError(fieldPath, typeof objValue, typeof srcValue);
      }

      // srcValue wins
      return srcValue;
    },
  );
}

function mergeArrays(a: MergeableValue[], b: MergeableValue[]): MergeableValue[] {
  const hasPrimitiveOnly = a.every(isPrimitive) && b.every(isPrimitive);

  if (hasPrimitiveOnly) {
    const seen = new Set<string>();
    const result: MergeableValue[] = [];
    for (const item of [...a, ...b]) {
      const key = JSON.stringify(item);
      if (!seen.has(key)) {
        seen.add(key);
        result.push(item);
      }
    }
    return result;
  }

  // Objects in arrays: concat without deduplication
  return [...a, ...b];
}

function isPrimitive(v: MergeableValue): boolean {
  return typeof v === "string" || typeof v === "number" || typeof v === "boolean";
}

// ── Format-specific merge helpers ─────────────────────────────────────────────

/**
 * Parses two JSON strings and deep-merges them.
 * Returns the merged JSON string (pretty-printed, 2-space indent).
 */
export function mergeJson(base: string, patch: string): string {
  const baseObj = JSON.parse(base) as MergeableObject;
  const patchObj = JSON.parse(patch) as MergeableObject;
  const merged = deepMerge(baseObj, patchObj);
  return JSON.stringify(merged, null, 2);
}

/**
 * Parses two YAML strings and deep-merges them.
 * Returns the merged YAML string.
 */
export function mergeYaml(base: string, patch: string): string {
  const baseObj = yaml.load(base) as MergeableObject;
  const patchObj = yaml.load(patch) as MergeableObject;

  if (typeof baseObj !== "object" || baseObj === null) {
    throw new MergeConflictError("(root)", typeof baseObj, typeof patchObj);
  }
  if (typeof patchObj !== "object" || patchObj === null) {
    throw new MergeConflictError("(root)", typeof baseObj, typeof patchObj);
  }

  const merged = deepMerge(baseObj, patchObj);
  return yaml.dump(merged, { lineWidth: -1 });
}

/**
 * Merges two .env file strings.
 *
 * Rules:
 *  - KEY=VALUE pairs are parsed line by line.
 *  - Comments and blank lines from base are preserved.
 *  - Patch values overwrite base values for the same key.
 *  - New keys from patch are appended.
 */
export function mergeEnv(base: string, patch: string): string {
  const baseLines = base.split("\n");
  const patchVars = parseEnvVars(patch);
  const writtenKeys = new Set<string>();

  const result: string[] = baseLines.map((line) => {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) return line;

    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) return line;

    const key = line.slice(0, eqIdx).trim();
    writtenKeys.add(key);

    if (Object.prototype.hasOwnProperty.call(patchVars, key)) {
      return `${key}=${patchVars[key] ?? ""}`;
    }
    return line;
  });

  // Append new keys from patch
  for (const [key, value] of Object.entries(patchVars)) {
    if (!writtenKeys.has(key)) {
      result.push(`${key}=${value ?? ""}`);
    }
  }

  return result.join("\n");
}

function parseEnvVars(content: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    const value = line.slice(eqIdx + 1).trim();
    vars[key] = value;
  }
  return vars;
}

/**
 * Applies a record of merge patches to an existing content string,
 * dispatching to the correct strategy based on file extension.
 *
 * Supported: .json, .yaml, .yml, .env
 */
export function applyConfigPatch(
  targetFile: string,
  existingContent: string,
  patchData: Record<string, unknown>,
): string {
  const patchStr = JSON.stringify(patchData);

  if (targetFile.endsWith(".json")) {
    return mergeJson(existingContent, patchStr);
  }

  if (targetFile.endsWith(".yaml") || targetFile.endsWith(".yml")) {
    const patchYaml = yaml.dump(patchData, { lineWidth: -1 });
    return mergeYaml(existingContent, patchYaml);
  }

  if (targetFile.endsWith(".env") || targetFile === ".env") {
    return mergeEnv(
      existingContent,
      Object.entries(patchData)
        .map(([k, v]) => `${k}=${String(v)}`)
        .join("\n"),
    );
  }

  throw new FoundationError(
    `Unsupported config patch target: "${targetFile}". Supported extensions: .json, .yaml, .yml, .env`,
    "ERR_UNSUPPORTED_PATCH_TARGET",
  );
}

