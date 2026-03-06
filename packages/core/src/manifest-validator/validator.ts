import Ajv, { type ErrorObject } from "ajv";
import addFormats from "ajv-formats";
import { MODULE_MANIFEST_SCHEMA } from "@foundation-cli/plugin-sdk";
import type { ModuleManifest } from "@foundation-cli/plugin-sdk";
import { ValidationError, type ValidationFieldError } from "../errors.js";

// ── AJV instance (one per process — compile once, validate many) ──────────────

const ajv = new Ajv({
  allErrors: true, // collect every violation, not just the first
  strict: true, // disallow unknown keywords
  verbose: true, // include `data` (the invalid value) in errors
});

addFormats(ajv);

const _compiledValidator = ajv.compile<ModuleManifest>(MODULE_MANIFEST_SCHEMA);

// ── Field-path helpers ────────────────────────────────────────────────────────

/**
 * Converts an AJV instancePath ("/dependencies/0/name") to a
 * human-readable dot+bracket notation ("dependencies[0].name").
 */
function normalisePath(instancePath: string, keyword: string, params: unknown): string {
  if (instancePath === "" || instancePath === "/") {
    // Top-level error — use keyword as the field hint when possible
    if (keyword === "required") {
      const p = params as { missingProperty?: string };
      return p.missingProperty ?? "(root)";
    }
    return "(root)";
  }

  // "/dependencies/0/name"  →  ["dependencies", "0", "name"]
  const segments = instancePath.replace(/^\//, "").split("/");

  return segments.reduce<string>((acc, seg, idx) => {
    if (/^\d+$/.test(seg)) {
      return `${acc}[${seg}]`;
    }
    return idx === 0 ? seg : `${acc}.${seg}`;
  }, "");
}

/**
 * Derives a concise, human-readable message from a single AJV ErrorObject.
 */
function deriveMessage(err: ErrorObject): string {
  switch (err.keyword) {
    case "required": {
      const p = err.params as { missingProperty: string };
      return `field "${p.missingProperty}" is required`;
    }
    case "enum": {
      const p = err.params as { allowedValues: unknown[] };
      return `must be one of: ${p.allowedValues.map((v) => JSON.stringify(v)).join(", ")}`;
    }
    case "pattern": {
      const p = err.params as { pattern: string };

      const fieldPath = normalisePath(err.instancePath, err.keyword, err.params);

      // 🔹 Manifest top-level version
      if (fieldPath === "version") {
        return "must be a valid semver string (e.g. 1.0.0 or 2.3.4-beta.1)";
      }

      // 🔹 Dependency package version
      if (fieldPath.includes("dependencies") && fieldPath.endsWith(".version")) {
        return "must be a valid semver string (e.g. 1.0.0 or 2.3.4-beta.1)";
      }

      // 🔹 Dependency package name
      if (fieldPath.includes("dependencies") && fieldPath.endsWith(".name")) {
        return "package name must be a valid npm package name";
      }

      // 🔹 Kebab-case manifest id
      if (fieldPath === "id") {
        return "must be kebab-case (lowercase letters, numbers, hyphens only)";
      }

      return `must match pattern: ${p.pattern}`;
    }
    case "minLength": {
      const p = err.params as { limit: number };
      return `must be at least ${p.limit} character(s) long`;
    }
    case "type": {
      const p = err.params as { type: string };
      return `must be of type ${p.type}`;
    }
    case "additionalProperties": {
      const p = err.params as { additionalProperty: string };
      return `unknown field "${p.additionalProperty}" is not allowed`;
    }
    default:
      return err.message ?? "invalid value";
  }
}

// ── ManifestValidator ─────────────────────────────────────────────────────────

export interface ManifestValidationResult {
  readonly valid: boolean;
  readonly fieldErrors: ReadonlyArray<ValidationFieldError>;
}

/**
 * ManifestValidator wraps AJV to provide field-level structured validation
 * of ModuleManifest objects.
 *
 * Usage:
 *   const result = ManifestValidator.validate(data);
 *   if (!result.valid) { ... result.fieldErrors ... }
 *
 *   // Or throw immediately:
 *   ManifestValidator.assert(data);
 */
export class ManifestValidator {
  private constructor() {
    // Static-only class — prevent instantiation.
  }

  /**
   * Validates `data` against the ModuleManifest JSON Schema.
   * Returns a structured result — never throws.
   */
  static validate(data: unknown): ManifestValidationResult {
    const valid = _compiledValidator(data);

    if (valid) {
      return { valid: true, fieldErrors: [] };
    }

    const rawErrors: ErrorObject[] = _compiledValidator.errors ?? [];

    const fieldErrors: ValidationFieldError[] = rawErrors.map((err) => ({
      field: normalisePath(err.instancePath, err.keyword, err.params),
      message: deriveMessage(err),
      value: (err as ErrorObject & { data?: unknown }).data,
    }));

    return { valid: false, fieldErrors };
  }

  /**
   * Validates `data` and throws a `ValidationError` with full field-level
   * details if validation fails.
   *
   * After a successful call, TypeScript narrows `data` to `ModuleManifest`.
   */
  static assert(data: unknown): asserts data is ModuleManifest {
    const result = ManifestValidator.validate(data);
    if (!result.valid) {
      // Try to extract id for a better error message, even from invalid data.
      const id =
        typeof data === "object" &&
        data !== null &&
        "id" in data &&
        typeof (data as Record<string, unknown>)["id"] === "string"
          ? ((data as Record<string, unknown>)["id"] as string)
          : undefined;

      throw new ValidationError(id, result.fieldErrors);
    }
  }

  /**
   * Returns the resolved effective runtime for a validated manifest.
   * Absent `runtime` field defaults to "node".
   */
  static effectiveRuntime(manifest: ModuleManifest): "node" | "python" | "multi" {
    return manifest.runtime ?? "node";
  }
}
