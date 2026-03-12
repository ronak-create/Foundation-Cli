import { describe, it, expect } from "vitest";
import { validateModuleManifest } from "../validate.js";
import type { ModuleManifest, PluginCategory } from "../types.js";

describe("ModuleManifest schema (AJV)", () => {
  const validManifest: ModuleManifest = {
    id: "test-plugin",
    name: "Test Plugin",
    version: "1.0.0",
    description: "Valid plugin",
    category: "tooling",
    dependencies: [],
    files: [],
    configPatches: [],
    compatibility: {},
  };

  it("accepts a valid manifest", () => {
    const result = validateModuleManifest(validManifest);
    expect(result.valid).toBe(true);
  });

  it("rejects missing required fields", () => {
    const invalid = { ...validManifest } as unknown as Record<string, unknown>;
    delete invalid["id"];

    const result = validateModuleManifest(invalid);
    expect(result.valid).toBe(false);
  });

  it("rejects invalid semver", () => {
    const invalid = { ...validManifest, version: "not-semver" };
    const result = validateModuleManifest(invalid);
    expect(result.valid).toBe(false);
  });

  it("rejects invalid category", () => {
    const invalid = { ...validManifest, category: "unknown" as unknown as PluginCategory };
    const result = validateModuleManifest(invalid);
    expect(result.valid).toBe(false);
  });

  it("rejects invalid id format", () => {
    const invalid = { ...validManifest, id: "InvalidID" };
    const result = validateModuleManifest(invalid);
    expect(result.valid).toBe(false);
  });
});