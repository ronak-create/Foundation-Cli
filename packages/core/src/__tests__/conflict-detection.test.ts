import { describe, it, expect } from "vitest";
import {
  detectDependencyConflicts,
  buildCompositionPlanWithOverrides,
} from "../composition/planner.js";
import type { ModuleManifest } from "@systemlabs/foundation-plugin-sdk";

function makeManifest(
  id: string,
  deps: Array<{ name: string; version: string; scope?: string }> = [],
): ModuleManifest {
  return {
    id,
    name: `Module ${id}`,
    version: "1.0.0",
    description: "Test",
    category: "tooling",
    dependencies: deps.map((d) => ({
      name: d.name,
      version: d.version,
      scope: (d.scope ?? "dependencies") as "dependencies" | "devDependencies" | "peerDependencies",
    })),
    files: [],
    configPatches: [],
    compatibility: {},
  };
}

// ── detectDependencyConflicts ─────────────────────────────────────────────────

describe("detectDependencyConflicts", () => {
  it("returns [] when no modules have dependencies", () => {
    expect(detectDependencyConflicts([makeManifest("a"), makeManifest("b")])).toEqual([]);
  });

  it("returns [] when all deps match", () => {
    const a = makeManifest("a", [{ name: "react", version: "^18" }]);
    const b = makeManifest("b", [{ name: "react", version: "^18" }]);
    expect(detectDependencyConflicts([a, b])).toEqual([]);
  });

  it("detects a conflict between two modules", () => {
    const a = makeManifest("frontend-nextjs",   [{ name: "react", version: "^18" }]);
    const b = makeManifest("legacy-widget",     [{ name: "react", version: "^17" }]);
    const conflicts = detectDependencyConflicts([a, b]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.packageName).toBe("react");
    expect(conflicts[0]!.claims.map((c) => c.version).sort()).toEqual(["^17", "^18"]);
    expect(conflicts[0]!.claims.map((c) => c.moduleId).sort()).toEqual(
      ["frontend-nextjs", "legacy-widget"],
    );
  });

  it("detects multiple independent conflicts", () => {
    const a = makeManifest("a", [
      { name: "react", version: "^18" },
      { name: "axios", version: "^1" },
    ]);
    const b = makeManifest("b", [
      { name: "react", version: "^17" },
      { name: "axios", version: "^0" },
    ]);
    const conflicts = detectDependencyConflicts([a, b]);
    expect(conflicts).toHaveLength(2);
    const names = conflicts.map((c) => c.packageName).sort();
    expect(names).toEqual(["axios", "react"]);
  });

  it("treats same package in different scopes as separate keys (no false conflict)", () => {
    const a = makeManifest("a", [{ name: "typescript", version: "^5", scope: "dependencies" }]);
    const b = makeManifest("b", [{ name: "typescript", version: "^4", scope: "devDependencies" }]);
    // different scopes → different keys → no conflict
    const conflicts = detectDependencyConflicts([a, b]);
    expect(conflicts).toHaveLength(0);
  });

  it("includes scope in conflict metadata", () => {
    const a = makeManifest("a", [{ name: "react", version: "^18", scope: "peerDependencies" }]);
    const b = makeManifest("b", [{ name: "react", version: "^17", scope: "peerDependencies" }]);
    const conflicts = detectDependencyConflicts([a, b]);
    expect(conflicts[0]!.scope).toBe("peerDependencies");
  });

  it("handles three-way conflict (three different versions)", () => {
    const a = makeManifest("a", [{ name: "lodash", version: "^4" }]);
    const b = makeManifest("b", [{ name: "lodash", version: "^3" }]);
    const c = makeManifest("c", [{ name: "lodash", version: "^2" }]);
    const conflicts = detectDependencyConflicts([a, b, c]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.claims).toHaveLength(3);
  });
});

// ── buildCompositionPlanWithOverrides ─────────────────────────────────────────

describe("buildCompositionPlanWithOverrides", () => {
  it("applies override to resolve conflict — no throw", () => {
    const a = makeManifest("frontend-nextjs", [{ name: "react", version: "^18" }]);
    const b = makeManifest("legacy-widget",   [{ name: "react", version: "^17" }]);
    const overrides = new Map([["dependencies::react", "^18"]]);

    expect(() =>
      buildCompositionPlanWithOverrides([a, b], overrides),
    ).not.toThrow();
  });

  it("all dependencies use the overridden version", () => {
    const a = makeManifest("mod-a", [{ name: "react", version: "^18" }]);
    const b = makeManifest("mod-b", [{ name: "react", version: "^17" }]);
    const overrides = new Map([["dependencies::react", "^18"]]);
    const plan = buildCompositionPlanWithOverrides([a, b], overrides);

    const reactDep = plan.dependencies.find((d) => d.name === "react");
    expect(reactDep?.version).toBe("^18");
    // Only one react entry — deduped
    expect(plan.dependencies.filter((d) => d.name === "react")).toHaveLength(1);
  });

  it("non-conflicting deps are unaffected by overrides", () => {
    const a = makeManifest("a", [
      { name: "react", version: "^18" },
      { name: "express", version: "^4" },
    ]);
    const b = makeManifest("b", [{ name: "react", version: "^17" }]);
    const overrides = new Map([["dependencies::react", "^18"]]);
    const plan = buildCompositionPlanWithOverrides([a, b], overrides);

    const expressDep = plan.dependencies.find((d) => d.name === "express");
    expect(expressDep?.version).toBe("^4");
  });

  it("empty overrides map behaves like buildCompositionPlan for non-conflicting modules", () => {
    const a = makeManifest("a", [{ name: "chalk", version: "^5" }]);
    const b = makeManifest("b", [{ name: "dotenv", version: "^16" }]);
    const plan = buildCompositionPlanWithOverrides([a, b], new Map());
    expect(plan.dependencies).toHaveLength(2);
  });

  it("throws ConflictingDependencyVersionError when no override is provided for a conflict", () => {
    const a = makeManifest("a", [{ name: "react", version: "^18" }]);
    const b = makeManifest("b", [{ name: "react", version: "^17" }]);
    expect(() =>
      buildCompositionPlanWithOverrides([a, b], new Map()),
    ).toThrow();
  });

  it("override with alternate version (user picks lower) is respected", () => {
    const a = makeManifest("a", [{ name: "react", version: "^18" }]);
    const b = makeManifest("b", [{ name: "react", version: "^17" }]);
    const overrides = new Map([["dependencies::react", "^17"]]);
    const plan = buildCompositionPlanWithOverrides([a, b], overrides);
    const dep = plan.dependencies.find((d) => d.name === "react");
    expect(dep?.version).toBe("^17");
  });

  it("resolves multiple conflicts simultaneously", () => {
    const a = makeManifest("a", [
      { name: "react", version: "^18" },
      { name: "axios", version: "^1" },
    ]);
    const b = makeManifest("b", [
      { name: "react", version: "^17" },
      { name: "axios", version: "^0" },
    ]);
    const overrides = new Map([
      ["dependencies::react", "^18"],
      ["dependencies::axios", "^1"],
    ]);
    const plan = buildCompositionPlanWithOverrides([a, b], overrides);
    expect(plan.dependencies.find((d) => d.name === "react")?.version).toBe("^18");
    expect(plan.dependencies.find((d) => d.name === "axios")?.version).toBe("^1");
    expect(plan.dependencies).toHaveLength(2);
  });
});
