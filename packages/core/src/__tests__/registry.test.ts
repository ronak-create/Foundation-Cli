import { describe, it, expect, beforeEach } from "vitest";
import { ModuleRegistry } from "../module-registry/registry.js";
import { DuplicateModuleError, ModuleNotFoundError } from "../errors.js";
import type { PluginDefinition } from "@systemlabs/foundation-plugin-sdk";

function makePlugin(id: string, overrides: Partial<PluginDefinition["manifest"]> = {}): PluginDefinition {
  return {
    manifest: {
      id,
      name: `Module ${id}`,
      version: "1.0.0",
      description: "Test module",
      category: "tooling",
      dependencies: [],
      files: [],
      configPatches: [],
      compatibility: {},
      ...overrides,
    },
  };
}

describe("ModuleRegistry", () => {
  let registry: ModuleRegistry;

  beforeEach(() => {
    registry = new ModuleRegistry();
  });

  it("registers a valid module", () => {
    registry.registerModule(makePlugin("alpha"));
    expect(registry.hasModule("alpha")).toBe(true);
    expect(registry.size).toBe(1);
  });

  it("lists registered manifests in insertion order", () => {
    registry.registerModule(makePlugin("alpha"));
    registry.registerModule(makePlugin("beta"));
    registry.registerModule(makePlugin("gamma"));

    const ids = registry.listModules().map((m) => m.id);
    expect(ids).toEqual(["alpha", "beta", "gamma"]);
  });

  it("retrieves a module by id", () => {
    registry.registerModule(makePlugin("alpha"));
    const plugin = registry.getModule("alpha");
    expect(plugin.manifest.id).toBe("alpha");
  });

  it("throws DuplicateModuleError when registering duplicate id", () => {
    registry.registerModule(makePlugin("alpha"));
    expect(() => registry.registerModule(makePlugin("alpha"))).toThrowError(
      DuplicateModuleError,
    );
  });

  it("throws ModuleNotFoundError when getting unknown module", () => {
    expect(() => registry.getModule("unknown")).toThrowError(ModuleNotFoundError);
  });

  it("hasModule returns false for unregistered id", () => {
    expect(registry.hasModule("nope")).toBe(false);
  });

  it("rejects a module with an invalid manifest (bad id format)", () => {
    const bad = makePlugin("INVALID ID");
    expect(() => registry.registerModule(bad)).toThrow();
  });

  it("rejects a module with an invalid version string", () => {
    const bad = makePlugin("valid-id", { version: "not-semver" });
    expect(() => registry.registerModule(bad)).toThrow();
  });

  it("each ModuleRegistry instance is independent", () => {
    const registryA = new ModuleRegistry();
    const registryB = new ModuleRegistry();

    registryA.registerModule(makePlugin("alpha"));
    expect(registryA.hasModule("alpha")).toBe(true);
    expect(registryB.hasModule("alpha")).toBe(false);
  });
});
