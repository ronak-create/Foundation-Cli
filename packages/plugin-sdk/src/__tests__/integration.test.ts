import { describe, it, expect } from "vitest";
import { validateModuleManifest } from "../validate.js";
import type { ModuleManifest } from "../types.js";

describe("Plugin SDK integration (AJV)", () => {
  function makeManifest(id: string): ModuleManifest {
    return {
      id,
      name: `Plugin ${id}`,
      version: "1.0.0",
      description: "Integration test",
      category: "frontend",
      dependencies: [
        {
          name: "react",
          version: "^18.0.0",
          scope: "dependencies",
        },
      ],
      files: [
        {
          relativePath: "src/index.ts",
          content: "// hello",
        },
      ],
      configPatches: [
        {
          targetFile: "package.json",
          merge: { scripts: { dev: "vite" } },
        },
      ],
      compatibility: {
        requires: [],
        conflicts: [],
      },
    };
  }

  it("valid manifest passes validation", () => {
    const manifest = makeManifest("frontend-react");
    const result = validateModuleManifest(manifest);
    expect(result.valid).toBe(true);
  });

  it("invalid dependency scope fails", () => {
    const manifest = makeManifest("bad-scope");
    (manifest.dependencies[0] as unknown as Record<string, unknown>)["scope"] = "invalid";

    const result = validateModuleManifest(manifest);
    expect(result.valid).toBe(false);
  });

  it("invalid file entry fails", () => {
    const manifest = makeManifest("bad-file");
    (manifest.files[0] as unknown as Record<string, unknown>)["relativePath"] = "";

    const result = validateModuleManifest(manifest);
    expect(result.valid).toBe(false);
  });

  it("invalid config patch fails", () => {
    const manifest = makeManifest("bad-patch");
    (manifest.configPatches[0] as unknown as Record<string, unknown>)["merge"] = "not-object";

    const result = validateModuleManifest(manifest);
    expect(result.valid).toBe(false);
  });
});
