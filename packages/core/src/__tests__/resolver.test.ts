import { describe, it, expect, beforeEach } from "vitest";
import { ModuleRegistry } from "../module-registry/registry.js";
import { resolveModules } from "../dependency-resolver/resolver.js";
import {
  CircularDependencyError,
  ModuleConflictError,
  ModuleNotFoundError,
  MissingRequiredModuleError,
} from "../errors.js";
import type { PluginDefinition } from "@foundation-cli/plugin-sdk";

function makePlugin(
  id: string,
  requires: string[] = [],
  conflicts: string[] = [],
): PluginDefinition {
  return {
    manifest: {
      id,
      name: `Module ${id}`,
      version: "1.0.0",
      description: "Test",
      category: "tooling",
      dependencies: [],
      files: [],
      configPatches: [],
      compatibility: {
        requires: requires.length > 0 ? requires : undefined,
        conflicts: conflicts.length > 0 ? conflicts : undefined,
      },
    },
  };
}

function makeRegistry(...plugins: PluginDefinition[]): ModuleRegistry {
  const r = new ModuleRegistry();
  for (const p of plugins) r.registerModule(p);
  return r;
}

describe("resolveModules", () => {
  describe("basic resolution", () => {
    it("resolves a single module with no dependencies", () => {
      const registry = makeRegistry(makePlugin("alpha"));
      const result = resolveModules(["alpha"], registry);
      expect(result.ordered.map((m) => m.id)).toEqual(["alpha"]);
      expect(result.added).toEqual([]);
      expect(result.conflicts).toEqual([]);
    });

    it("throws ModuleNotFoundError for unknown selected id", () => {
      const registry = makeRegistry(makePlugin("alpha"));
      expect(() => resolveModules(["unknown"], registry)).toThrowError(ModuleNotFoundError);
    });

    it("resolves multiple independent modules", () => {
      const registry = makeRegistry(makePlugin("alpha"), makePlugin("beta"), makePlugin("gamma"));
      const result = resolveModules(["alpha", "beta", "gamma"], registry);
      expect(result.ordered).toHaveLength(3);
      expect(result.added).toHaveLength(0);
    });
  });

  describe("dependency expansion (requires)", () => {
    it("auto-adds a required module not in the selection", () => {
      const registry = makeRegistry(makePlugin("base"), makePlugin("feature", ["base"]));
      const result = resolveModules(["feature"], registry);
      const ids = result.ordered.map((m) => m.id);
      expect(ids).toContain("base");
      expect(ids).toContain("feature");
      expect(result.added).toContain("base");
    });

    it("does not mark a required module as auto-added if explicitly selected", () => {
      const registry = makeRegistry(makePlugin("base"), makePlugin("feature", ["base"]));
      const result = resolveModules(["base", "feature"], registry);
      expect(result.added).toHaveLength(0);
    });

    it("transitively resolves nested requires", () => {
      // gamma requires beta, beta requires alpha
      const registry = makeRegistry(
        makePlugin("alpha"),
        makePlugin("beta", ["alpha"]),
        makePlugin("gamma", ["beta"]),
      );
      const result = resolveModules(["gamma"], registry);
      const ids = result.ordered.map((m) => m.id);
      // alpha must come before beta, beta before gamma
      expect(ids.indexOf("alpha")).toBeLessThan(ids.indexOf("beta"));
      expect(ids.indexOf("beta")).toBeLessThan(ids.indexOf("gamma"));
      expect(result.added).toContain("alpha");
      expect(result.added).toContain("beta");
    });

    it("throws MissingRequiredModuleError when a required module is unregistered", () => {
      const registry = makeRegistry(makePlugin("feature", ["nonexistent"]));
      expect(() => resolveModules(["feature"], registry)).toThrowError(MissingRequiredModuleError);
    });
  });

  describe("topological ordering", () => {
    it("places dependencies before their dependents", () => {
      const registry = makeRegistry(
        makePlugin("orm", ["database"]),
        makePlugin("database"),
        makePlugin("auth", ["orm", "database"]),
      );
      const result = resolveModules(["auth", "orm", "database"], registry);
      const ids = result.ordered.map((m) => m.id);

      expect(ids.indexOf("database")).toBeLessThan(ids.indexOf("orm"));
      expect(ids.indexOf("database")).toBeLessThan(ids.indexOf("auth"));
      expect(ids.indexOf("orm")).toBeLessThan(ids.indexOf("auth"));
    });

    it("produces a stable, deterministic order for the same inputs", () => {
      const registry = makeRegistry(
        makePlugin("alpha"),
        makePlugin("beta", ["alpha"]),
        makePlugin("gamma", ["alpha"]),
        makePlugin("delta", ["beta", "gamma"]),
      );
      const r1 = resolveModules(["delta"], registry).ordered.map((m) => m.id);
      const r2 = resolveModules(["delta"], registry).ordered.map((m) => m.id);
      expect(r1).toEqual(r2);
    });
  });

  describe("conflict detection", () => {
    it("throws ModuleConflictError when two selected modules conflict", () => {
      const registry = makeRegistry(
        makePlugin("mysql", [], ["postgres"]),
        makePlugin("postgres", [], ["mysql"]),
      );
      expect(() => resolveModules(["mysql", "postgres"], registry)).toThrowError(
        ModuleConflictError,
      );
    });

    it("throws ModuleConflictError when an auto-added module conflicts with a selected one", () => {
      // orm requires mysql, but postgres is also selected and mysql conflicts with postgres
      const registry = makeRegistry(
        makePlugin("mysql", [], ["postgres"]),
        makePlugin("postgres"),
        makePlugin("orm", ["mysql"]),
      );
      expect(() => resolveModules(["orm", "postgres"], registry)).toThrowError(ModuleConflictError);
    });

    it("does not throw for non-conflicting module sets", () => {
      const registry = makeRegistry(makePlugin("alpha", [], ["gamma"]), makePlugin("beta"));
      expect(() => resolveModules(["alpha", "beta"], registry)).not.toThrow();
    });
  });

  describe("circular dependency detection", () => {
    it("throws CircularDependencyError for a direct self-dependency", () => {
      const registry = makeRegistry(makePlugin("self", ["self"]));
      expect(() => resolveModules(["self"], registry)).toThrowError(CircularDependencyError);
    });

    it("throws CircularDependencyError for a two-node cycle", () => {
      const registry = makeRegistry(makePlugin("alpha", ["beta"]), makePlugin("beta", ["alpha"]));
      expect(() => resolveModules(["alpha", "beta"], registry)).toThrowError(CircularDependencyError);
    });

    it("throws CircularDependencyError for a multi-node cycle", () => {
      const registry = makeRegistry(
        makePlugin("alpha", ["gamma"]),
        makePlugin("beta", ["alpha"]),
        makePlugin("gamma", ["beta"]),
      );
      expect(() => resolveModules(["alpha", "beta", "gamma"], registry)).toThrowError(CircularDependencyError);
    });

    it("includes the cycle path in the error", () => {
      const registry = makeRegistry(makePlugin("xray", ["yankee"]), makePlugin("yankee", ["xray"]));
      try {
        resolveModules(["xray", "yankee"], registry);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(CircularDependencyError);
        const cycleErr = err as CircularDependencyError;
        expect(cycleErr.cycle.length).toBeGreaterThanOrEqual(2);
      }
    });
  });
});
