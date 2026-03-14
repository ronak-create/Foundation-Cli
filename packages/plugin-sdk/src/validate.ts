// packages/plugin-sdk/src/validate.ts
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { MODULE_MANIFEST_SCHEMA } from "./schema.js";
import type { ModuleManifest } from "./types.js";

const ajv = new Ajv({ allErrors: true, strict: true });
addFormats(ajv);

const validateManifest = ajv.compile<ModuleManifest>(MODULE_MANIFEST_SCHEMA);

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: ReadonlyArray<string>;
}

export function validateModuleManifest(data: unknown): ValidationResult {
  const valid = validateManifest(data);
  if (valid) {
    return { valid: true, errors: [] };
  }
  const errors = (validateManifest.errors ?? []).map((e) => {
    const field = e.instancePath !== "" ? e.instancePath : "(root)";
    return `${field}: ${e.message ?? "unknown error"}`;
  });
  return { valid: false, errors };
}

export function assertValidManifest(data: unknown): asserts data is ModuleManifest {
  const result = validateModuleManifest(data);
  if (!result.valid) {
    throw new Error(
      `Invalid ModuleManifest:\n${result.errors.map((e) => `  - ${e}`).join("\n")}`,
    );
  }
}
