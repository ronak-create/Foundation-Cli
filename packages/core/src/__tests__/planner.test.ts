import { describe, it, expect } from "vitest";
import { buildCompositionPlan } from "../composition/planner.js";
import {
  DuplicateFilePathError,
  ConflictingDependencyVersionError,
} from "../errors.js";
import type { ModuleManifest } from "@systemlabs/foundation-plugin-sdk";

function makeManifest(
  id: string,
  overrides: Partial<Omit<ModuleManifest, "id">> = {},
): ModuleManifest {
  return {
    id,
    name: `Module ${id}`,
    version: "1.0.0",
    description: "Test",
    category: "tooling",
    dependencies: [],
    files: [],
    configPatches: [],
    compatibility: {},
    ...overrides,
  };
}

describe("buildCompositionPlan", () => {
  describe("files", () => {
    it("collects files from all modules", () => {
      const modules: ModuleManifest[] = [
        makeManifest("a", {
          files: [{ relativePath: "src/a.ts", content: "// a" }],
        }),
        makeManifest("b", {
          files: [{ relativePath: "src/b.ts", content: "// b" }],
        }),
      ];
      const plan = buildCompositionPlan(modules);
      expect(plan.files).toHaveLength(2);
      const paths = plan.files.map((f) => f.relativePath);
      expect(paths).toContain("src/a.ts");
      expect(paths).toContain("src/b.ts");
    });

    it("throws DuplicateFilePathError when two modules contribute the same path without overwrite", () => {
      const modules: ModuleManifest[] = [
        makeManifest("a", {
          files: [{ relativePath: "config.json", content: "{}" }],
        }),
        makeManifest("b", {
          files: [{ relativePath: "config.json", content: "{}" }],
        }),
      ];
      expect(() => buildCompositionPlan(modules)).toThrowError(
        DuplicateFilePathError,
      );
    });

    it("allows later module to overwrite a file when overwrite: true", () => {
      const modules: ModuleManifest[] = [
        makeManifest("a", {
          files: [{ relativePath: "config.json", content: '{"from":"a"}' }],
        }),
        makeManifest("b", {
          files: [
            {
              relativePath: "config.json",
              content: '{"from":"b"}',
              overwrite: true,
            },
          ],
        }),
      ];
      const plan = buildCompositionPlan(modules);
      expect(plan.files).toHaveLength(1);
      expect(plan.files[0]?.content).toBe('{"from":"b"}');
    });

    it("returns empty files array when no modules have files", () => {
      const plan = buildCompositionPlan([makeManifest("a"), makeManifest("b")]);
      expect(plan.files).toHaveLength(0);
    });
  });

  describe("dependencies", () => {
    it("collects package dependencies from all modules", () => {
      const modules: ModuleManifest[] = [
        makeManifest("a", {
          dependencies: [
            { name: "react", version: "^18.0.0", scope: "dependencies" },
          ],
        }),
        makeManifest("b", {
          dependencies: [
            { name: "typescript", version: "^5.0.0", scope: "devDependencies" },
          ],
        }),
      ];
      const plan = buildCompositionPlan(modules);
      expect(plan.dependencies).toHaveLength(2);
    });

    it("deduplicates identical dependencies across modules", () => {
      const dep = { name: "lodash", version: "^4.17.21", scope: "dependencies" as const };
      const modules: ModuleManifest[] = [
        makeManifest("a", { dependencies: [dep] }),
        makeManifest("b", { dependencies: [dep] }),
      ];
      const plan = buildCompositionPlan(modules);
      expect(plan.dependencies).toHaveLength(1);
    });

    it("throws ConflictingDependencyVersionError for same package with different versions", () => {
      const modules: ModuleManifest[] = [
        makeManifest("a", {
          dependencies: [
            { name: "react", version: "^17.0.0", scope: "dependencies" },
          ],
        }),
        makeManifest("b", {
          dependencies: [
            { name: "react", version: "^18.0.0", scope: "dependencies" },
          ],
        }),
      ];
      expect(() => buildCompositionPlan(modules)).toThrowError(
        ConflictingDependencyVersionError,
      );
    });

    it("allows the same package name at different versions in different scopes", () => {
      // e.g. typescript in devDependencies vs peerDependencies is a valid real-world scenario
      const modules: ModuleManifest[] = [
        makeManifest("a", {
          dependencies: [
            { name: "typescript", version: "^5.0.0", scope: "devDependencies" },
          ],
        }),
        makeManifest("b", {
          dependencies: [
            { name: "typescript", version: ">=4.0.0", scope: "peerDependencies" },
          ],
        }),
      ];
      const plan = buildCompositionPlan(modules);
      expect(plan.dependencies).toHaveLength(2);
    });
  });

  describe("configPatches", () => {
    it("collects all config patches in module order", () => {
      const modules: ModuleManifest[] = [
        makeManifest("a", {
          configPatches: [{ targetFile: "tsconfig.json", merge: { strict: true } }],
        }),
        makeManifest("b", {
          configPatches: [{ targetFile: "package.json", merge: { type: "module" } }],
        }),
      ];
      const plan = buildCompositionPlan(modules);
      expect(plan.configPatches).toHaveLength(2);
      expect(plan.configPatches[0]?.targetFile).toBe("tsconfig.json");
      expect(plan.configPatches[1]?.targetFile).toBe("package.json");
    });

    it("permits multiple patches to the same target file", () => {
      const modules: ModuleManifest[] = [
        makeManifest("a", {
          configPatches: [{ targetFile: "tsconfig.json", merge: { strict: true } }],
        }),
        makeManifest("b", {
          configPatches: [{ targetFile: "tsconfig.json", merge: { noEmit: true } }],
        }),
      ];
      const plan = buildCompositionPlan(modules);
      // Both patches should be present — merging happens in Phase 2.
      expect(plan.configPatches).toHaveLength(2);
    });
  });

  describe("orderedModules", () => {
    it("preserves the input order in the plan", () => {
      const modules = [
        makeManifest("first"),
        makeManifest("second"),
        makeManifest("third"),
      ];
      const plan = buildCompositionPlan(modules);
      expect(plan.orderedModules.map((m) => m.id)).toEqual([
        "first",
        "second",
        "third",
      ]);
    });

    it("returns an empty plan for zero modules", () => {
      const plan = buildCompositionPlan([]);
      expect(plan.files).toHaveLength(0);
      expect(plan.dependencies).toHaveLength(0);
      expect(plan.configPatches).toHaveLength(0);
      expect(plan.orderedModules).toHaveLength(0);
    });
  });
});
