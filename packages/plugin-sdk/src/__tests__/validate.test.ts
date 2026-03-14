import { describe, it, expect } from "vitest";
import { assertValidManifest, validateModuleManifest } from "../validate.js";
import type { ModuleManifest } from "../types.js";

describe("Manifest validation API", () => {
  const base: ModuleManifest = {
    id: "valid-plugin",
    name: "Valid Plugin",
    version: "1.0.0",
    description: "desc",
    category: "tooling",
    dependencies: [],
    files: [],
    configPatches: [],
    compatibility: {},
  };

  it("validateModuleManifest returns valid result", () => {
    const result = validateModuleManifest(base);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("assertValidManifest passes for valid data", () => {
    expect(() => assertValidManifest(base)).not.toThrow();
  });

  it("assertValidManifest throws for invalid data", () => {
    const invalid = { ...base, id: "" };
    expect(() => assertValidManifest(invalid)).toThrow();
  });

  it("collects detailed error messages", () => {
    const invalid = { foo: "bar" };
    const result = validateModuleManifest(invalid);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
