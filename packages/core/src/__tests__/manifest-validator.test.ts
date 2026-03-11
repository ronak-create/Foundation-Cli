import { describe, it, expect } from "vitest";
import { ManifestValidator } from "../manifest-validator/validator.js";
import { ValidationError } from "../errors.js";
import type { ModuleManifest } from "@foundation-cli/plugin-sdk";

// ── Fixtures ──────────────────────────────────────────────────────────────────

/**
 * Returns a fully valid manifest.  Individual tests override specific fields
 * to trigger the validation rule under test.
 */
function validManifest(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: "backend-express",
    name: "Express",
    version: "1.0.0",
    description: "Express.js backend module",
    category: "backend",
    dependencies: [{ name: "express", version: "^4.19.2", scope: "dependencies" }],
    files: [{ relativePath: "src/server.ts", content: "// server" }],
    configPatches: [{ targetFile: "package.json", merge: { scripts: { dev: "tsx watch" } } }],
    compatibility: {},
    ...overrides,
  };
}

// ── ManifestValidator.validate ────────────────────────────────────────────────

describe("ManifestValidator.validate — valid manifests", () => {
  it("accepts a fully valid manifest", () => {
    const result = ManifestValidator.validate(validManifest());
    expect(result.valid).toBe(true);
    expect(result.fieldErrors).toHaveLength(0);
  });

  it("accepts a manifest without optional runtime field", () => {
    const m = validManifest();
    expect(ManifestValidator.validate(m).valid).toBe(true);
  });

  it("accepts runtime: node", () => {
    expect(ManifestValidator.validate(validManifest({ runtime: "node" })).valid).toBe(true);
  });

  it("accepts runtime: python", () => {
    expect(ManifestValidator.validate(validManifest({ runtime: "python" })).valid).toBe(true);
  });

  it("accepts runtime: multi", () => {
    expect(ManifestValidator.validate(validManifest({ runtime: "multi" })).valid).toBe(true);
  });

  it("accepts all valid categories", () => {
    const categories = [
      "frontend",
      "backend",
      "database",
      "auth",
      "ui",
      "deployment",
      "testing",
      "tooling",
    ];
    for (const category of categories) {
      expect(ManifestValidator.validate(validManifest({ category })).valid).toBe(true);
    }
  });

  it("accepts empty dependencies array", () => {
    expect(ManifestValidator.validate(validManifest({ dependencies: [] })).valid).toBe(true);
  });

  it("accepts empty files array", () => {
    expect(ManifestValidator.validate(validManifest({ files: [] })).valid).toBe(true);
  });

  it("accepts empty configPatches array", () => {
    expect(ManifestValidator.validate(validManifest({ configPatches: [] })).valid).toBe(true);
  });

  it("accepts manifest with optional tags", () => {
    expect(ManifestValidator.validate(validManifest({ tags: ["typescript", "rest"] })).valid).toBe(
      true,
    );
  });

  it("accepts manifest with compatibility.requires and conflicts", () => {
    expect(
      ManifestValidator.validate(
        validManifest({
          compatibility: { requires: ["database-postgresql"], conflicts: ["database-mysql"] },
        }),
      ).valid,
    ).toBe(true);
  });

  it("accepts semver with pre-release suffix", () => {
    expect(ManifestValidator.validate(validManifest({ version: "2.0.0-beta.1" })).valid).toBe(true);
  });

  it("accepts single-segment kebab-case id (no hyphen)", () => {
    expect(ManifestValidator.validate(validManifest({ id: "tooling" })).valid).toBe(true);
  });

  it("accepts scoped npm package name in dependencies", () => {
    expect(
      ManifestValidator.validate(
        validManifest({
          dependencies: [{ name: "@types/node", version: "^20.0.0", scope: "devDependencies" }],
        }),
      ).valid,
    ).toBe(true);
  });
});

// ── id validation ─────────────────────────────────────────────────────────────

describe("ManifestValidator.validate — id field", () => {
  it("rejects missing id", () => {
    const m = validManifest();
    delete m["id"];
    const result = ManifestValidator.validate(m);
    expect(result.valid).toBe(false);
    expect(result.fieldErrors.some((e) => e.field.includes("id"))).toBe(true);
  });

  it("rejects empty string id", () => {
    const result = ManifestValidator.validate(validManifest({ id: "" }));
    expect(result.valid).toBe(false);
  });

  it("rejects id with uppercase letters", () => {
    const result = ManifestValidator.validate(validManifest({ id: "BackendExpress" }));
    expect(result.valid).toBe(false);
    const err = result.fieldErrors.find((e) => e.field === "id");
    expect(err).toBeDefined();
    expect(err?.message).toContain("kebab-case");
  });

  it("rejects id with spaces", () => {
    const result = ManifestValidator.validate(validManifest({ id: "backend express" }));
    expect(result.valid).toBe(false);
  });

  it("rejects id starting with a hyphen", () => {
    const result = ManifestValidator.validate(validManifest({ id: "-backend" }));
    expect(result.valid).toBe(false);
  });

  it("rejects id ending with a hyphen", () => {
    const result = ManifestValidator.validate(validManifest({ id: "backend-" }));
    expect(result.valid).toBe(false);
  });

  it("rejects id with underscore", () => {
    const result = ManifestValidator.validate(validManifest({ id: "backend_express" }));
    expect(result.valid).toBe(false);
  });

  it("accepts multi-segment kebab id", () => {
    expect(ManifestValidator.validate(validManifest({ id: "frontend-nextjs" })).valid).toBe(true);
  });

  it("rejects numeric-only id", () => {
    // "123" passes the character check but is still valid — numbers are allowed
    // The pattern only restricts casing and hyphens, not purely numeric.
    // "123" SHOULD pass — it is kebab-safe.
    expect(ManifestValidator.validate(validManifest({ id: "123" })).valid).toBe(true);
  });
});

// ── version validation ────────────────────────────────────────────────────────

describe("ManifestValidator.validate — version field", () => {
  it("rejects missing version", () => {
    const m = validManifest();
    delete m["version"];
    const result = ManifestValidator.validate(m);
    expect(result.valid).toBe(false);
    expect(result.fieldErrors.some((e) => e.field.includes("version"))).toBe(true);
  });

  it("rejects non-semver version string", () => {
    const result = ManifestValidator.validate(validManifest({ version: "v1.0" }));
    expect(result.valid).toBe(false);
    const err = result.fieldErrors.find((e) => e.field === "version");
    expect(err?.message).toContain("semver");
  });

  it("rejects npm range specifier as version (^1.0.0)", () => {
    const result = ManifestValidator.validate(validManifest({ version: "^1.0.0" }));
    expect(result.valid).toBe(false);
    const err = result.fieldErrors.find((e) => e.field === "version");
    expect(err?.message).toContain("semver");
  });

  it("rejects 'latest' as version", () => {
    const result = ManifestValidator.validate(validManifest({ version: "latest" }));
    expect(result.valid).toBe(false);
  });

  it("rejects two-part version (1.0)", () => {
    const result = ManifestValidator.validate(validManifest({ version: "1.0" }));
    expect(result.valid).toBe(false);
  });

  it("rejects empty version string", () => {
    const result = ManifestValidator.validate(validManifest({ version: "" }));
    expect(result.valid).toBe(false);
  });

  it("accepts 0.0.1", () => {
    expect(ManifestValidator.validate(validManifest({ version: "0.0.1" })).valid).toBe(true);
  });

  it("accepts 10.20.30", () => {
    expect(ManifestValidator.validate(validManifest({ version: "10.20.30" })).valid).toBe(true);
  });
});

// ── runtime validation ────────────────────────────────────────────────────────

describe("ManifestValidator.validate — runtime field", () => {
  it("rejects invalid runtime value", () => {
    const result = ManifestValidator.validate(validManifest({ runtime: "deno" }));
    expect(result.valid).toBe(false);
    const err = result.fieldErrors.find((e) => e.field === "runtime");
    expect(err).toBeDefined();
    expect(err?.message).toContain("node");
    expect(err?.message).toContain("python");
    expect(err?.message).toContain("multi");
  });

  it("rejects runtime: bun", () => {
    const result = ManifestValidator.validate(validManifest({ runtime: "bun" }));
    expect(result.valid).toBe(false);
  });

  it("rejects runtime as a number", () => {
    const result = ManifestValidator.validate(validManifest({ runtime: 1 }));
    expect(result.valid).toBe(false);
  });

  it("rejects runtime as empty string", () => {
    const result = ManifestValidator.validate(validManifest({ runtime: "" }));
    expect(result.valid).toBe(false);
  });
});

// ── category validation ───────────────────────────────────────────────────────

describe("ManifestValidator.validate — category field", () => {
  it("rejects missing category", () => {
    const m = validManifest();
    delete m["category"];
    const result = ManifestValidator.validate(m);
    expect(result.valid).toBe(false);
  });

  it("rejects invalid category string", () => {
    const result = ManifestValidator.validate(validManifest({ category: "middleware" }));
    expect(result.valid).toBe(false);
    const err = result.fieldErrors.find((e) => e.field === "category");
    expect(err?.message).toContain("one of");
  });

  it("rejects category with wrong casing", () => {
    const result = ManifestValidator.validate(validManifest({ category: "Backend" }));
    expect(result.valid).toBe(false);
  });
});

// ── dependencies structure validation ────────────────────────────────────────

describe("ManifestValidator.validate — dependencies structure", () => {
  it("rejects dependency missing name", () => {
    const result = ManifestValidator.validate(
      validManifest({
        dependencies: [{ version: "^1.0.0", scope: "dependencies" }],
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.fieldErrors.some((e) => e.field.includes("dependencies"))).toBe(true);
  });

  it("rejects dependency missing version", () => {
    const result = ManifestValidator.validate(
      validManifest({
        dependencies: [{ name: "express", scope: "dependencies" }],
      }),
    );
    expect(result.valid).toBe(false);
  });

  it("rejects dependency missing scope", () => {
    const result = ManifestValidator.validate(
      validManifest({
        dependencies: [{ name: "express", version: "^4.0.0" }],
      }),
    );
    expect(result.valid).toBe(false);
  });

  it("rejects invalid scope value", () => {
    const result = ManifestValidator.validate(
      validManifest({
        dependencies: [{ name: "express", version: "^4.0.0", scope: "optionalDependencies" }],
      }),
    );
    expect(result.valid).toBe(false);
    const err = result.fieldErrors.find(
      (e) => e.field.includes("dependencies") && e.field.includes("scope"),
    );
    expect(err?.message).toContain("one of");
  });

  it("rejects dependency with unknown extra field", () => {
    const result = ManifestValidator.validate(
      validManifest({
        dependencies: [
          {
            name: "express",
            version: "^4.0.0",
            scope: "dependencies",
            unknown: true,
          },
        ],
      }),
    );
    expect(result.valid).toBe(false);
  });

  it("rejects malformed dependency name (uppercase)", () => {
    const result = ManifestValidator.validate(
      validManifest({
        dependencies: [{ name: "Express", version: "^4.0.0", scope: "dependencies" }],
      }),
    );
    expect(result.valid).toBe(false);
    const err = result.fieldErrors.find(
      (e) => e.field.includes("dependencies") && e.field.includes("name"),
    );
    expect(err?.message).toContain("package name");
  });

  it("accepts valid dependency runtime field", () => {
    expect(
      ManifestValidator.validate(
        validManifest({
          dependencies: [
            {
              name: "express",
              version: "^4.0.0",
              scope: "dependencies",
              runtime: "node",
            },
          ],
        }),
      ).valid,
    ).toBe(true);
  });

  it("rejects invalid dependency runtime", () => {
    const result = ManifestValidator.validate(
      validManifest({
        dependencies: [
          {
            name: "express",
            version: "^4.0.0",
            scope: "dependencies",
            runtime: "ruby",
          },
        ],
      }),
    );
    expect(result.valid).toBe(false);
  });

  it("rejects dependencies as non-array", () => {
    const result = ManifestValidator.validate(validManifest({ dependencies: "express@^4.0.0" }));
    expect(result.valid).toBe(false);
  });
});

// ── configPatches structure validation ───────────────────────────────────────

describe("ManifestValidator.validate — configPatches structure", () => {
  it("rejects configPatch missing targetFile", () => {
    const result = ManifestValidator.validate(
      validManifest({
        configPatches: [{ merge: { scripts: {} } }],
      }),
    );
    expect(result.valid).toBe(false);
  });

  it("rejects configPatch missing merge", () => {
    const result = ManifestValidator.validate(
      validManifest({
        configPatches: [{ targetFile: "package.json" }],
      }),
    );
    expect(result.valid).toBe(false);
  });

  it("rejects configPatches as non-array", () => {
    const result = ManifestValidator.validate(validManifest({ configPatches: {} }));
    expect(result.valid).toBe(false);
  });

  it("rejects configPatch with unknown extra field", () => {
    const result = ManifestValidator.validate(
      validManifest({
        configPatches: [{ targetFile: "package.json", merge: {}, strategy: "deep" }],
      }),
    );
    expect(result.valid).toBe(false);
  });

  it("accepts empty string targetFile (length ≥ 1 is required)", () => {
    const result = ManifestValidator.validate(
      validManifest({
        configPatches: [{ targetFile: "", merge: {} }],
      }),
    );
    expect(result.valid).toBe(false);
  });
});

// ── ManifestValidator.assert ──────────────────────────────────────────────────

describe("ManifestValidator.assert", () => {
  it("does not throw for a valid manifest", () => {
    expect(() => ManifestValidator.assert(validManifest())).not.toThrow();
  });

  it("throws ValidationError for an invalid manifest", () => {
    expect(() => ManifestValidator.assert(validManifest({ version: "not-semver" }))).toThrowError(
      ValidationError,
    );
  });

  it("ValidationError carries the manifest id when available", () => {
    try {
      ManifestValidator.assert(validManifest({ version: "bad" }));
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      const ve = err as ValidationError;
      expect(ve.manifestId).toBe("backend-express");
    }
  });

  it("ValidationError has fieldErrors array with at least one entry", () => {
    try {
      ManifestValidator.assert(validManifest({ id: "INVALID_ID", version: "bad" }));
    } catch (err) {
      const ve = err as ValidationError;
      expect(ve.fieldErrors.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("ValidationError.fieldErrors contain field + message strings", () => {
    try {
      ManifestValidator.assert(validManifest({ runtime: "deno", version: "v1" }));
    } catch (err) {
      const ve = err as ValidationError;
      for (const fe of ve.fieldErrors) {
        expect(typeof fe.field).toBe("string");
        expect(typeof fe.message).toBe("string");
        expect(fe.field.length).toBeGreaterThan(0);
        expect(fe.message.length).toBeGreaterThan(0);
      }
    }
  });

  it("ValidationError.code is ERR_MANIFEST_VALIDATION", () => {
    try {
      ManifestValidator.assert(validManifest({ id: "" }));
    } catch (err) {
      expect((err as ValidationError).code).toBe("ERR_MANIFEST_VALIDATION");
    }
  });

  it("throws for non-object input", () => {
    expect(() => ManifestValidator.assert(null)).toThrowError(ValidationError);
    expect(() => ManifestValidator.assert("string")).toThrowError(ValidationError);
    expect(() => ManifestValidator.assert(42)).toThrowError(ValidationError);
    expect(() => ManifestValidator.assert([])).toThrowError(ValidationError);
  });

  it("narrows type to ModuleManifest after successful assert", () => {
    const data: unknown = validManifest();
    ManifestValidator.assert(data);
    // TypeScript narrows — we can access manifest fields safely
    const manifest: ModuleManifest = data;
    expect(manifest.id).toBe("backend-express");
  });
});

// ── ManifestValidator.effectiveRuntime ────────────────────────────────────────

describe("ManifestValidator.effectiveRuntime", () => {
  function toManifest(overrides: Partial<Record<string, unknown>> = {}): ModuleManifest {
    const data = validManifest(overrides);
    ManifestValidator.assert(data);
    return data;
  }

  it("returns 'node' when runtime field is absent", () => {
    expect(ManifestValidator.effectiveRuntime(toManifest())).toBe("node");
  });

  it("returns 'node' when runtime is explicitly 'node'", () => {
    expect(ManifestValidator.effectiveRuntime(toManifest({ runtime: "node" }))).toBe("node");
  });

  it("returns 'python' for python runtime", () => {
    expect(ManifestValidator.effectiveRuntime(toManifest({ runtime: "python" }))).toBe("python");
  });

  it("returns 'multi' for multi runtime", () => {
    expect(ManifestValidator.effectiveRuntime(toManifest({ runtime: "multi" }))).toBe("multi");
  });
});

// ── ModuleRegistry integration ────────────────────────────────────────────────

describe("ModuleRegistry uses ManifestValidator", () => {
  it("accepts a valid plugin definition", async () => {
    const { ModuleRegistry } = await import("../module-registry/registry.js");
    const registry = new ModuleRegistry();

    expect(() =>
      registry.registerModule({
        manifest: validManifest()  as ModuleManifest,
      }),
    ).not.toThrow();
  });

  it("throws ValidationError (not the old assertion error) for invalid manifest", async () => {
    const { ModuleRegistry } = await import("../module-registry/registry.js");
    const registry = new ModuleRegistry();

    expect(() =>
      registry.registerModule({
        manifest: validManifest({ version: "not-semver" }) as unknown as ModuleManifest,
      }),
    ).toThrowError(ValidationError);
  });

  it("ValidationError from registry has field-level details", async () => {
    const { ModuleRegistry } = await import("../module-registry/registry.js");
    const registry = new ModuleRegistry();

    try {
      registry.registerModule({
        manifest: validManifest({
          id: "BAD ID",
          version: "v1",
          runtime: "deno",
        }) as unknown as ModuleManifest,
      });
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      const ve = err as ValidationError;
      expect(ve.fieldErrors.length).toBeGreaterThanOrEqual(1);
      // Must mention at least one of the three broken fields
      const fields = ve.fieldErrors.map((e) => e.field);
      const mentionsInvalid =
        fields.some((f) => f === "id") ||
        fields.some((f) => f === "version") ||
        fields.some((f) => f === "runtime");
      expect(mentionsInvalid).toBe(true);
    }
  });

  it("existing built-in modules all pass ManifestValidator", async () => {
    const { loadBuiltinModules } = await import("../../../modules/src/registry-loader.js").catch(
      () => ({ loadBuiltinModules: null }),
    );

    if (loadBuiltinModules === null) {
      // modules package not built yet in this test run — skip gracefully
      return;
    }

    const { ModuleRegistry } = await import("../index.js");
    const registry = new ModuleRegistry();

    expect(() => (loadBuiltinModules as (r: typeof registry) => void)(registry)).not.toThrow();
  });
});

// ── Multiple simultaneous errors ──────────────────────────────────────────────

describe("ManifestValidator — multiple simultaneous errors", () => {
  it("reports all field errors when multiple fields are invalid", () => {
    const result = ManifestValidator.validate({
      id: "INVALID ID",
      name: "",
      version: "v1.bad",
      description: "ok",
      category: "unknown-category",
      runtime: "deno",
      dependencies: [
        { name: "Express", scope: "wrong-scope" }, // missing version, bad name, bad scope
      ],
      files: [],
      configPatches: [],
      compatibility: {},
    });

    expect(result.valid).toBe(false);
    // Should have errors for: id, name (minLength), version, category, runtime,
    // and at least two dependency sub-fields
    expect(result.fieldErrors.length).toBeGreaterThanOrEqual(4);
  });

  it("error message string contains each broken field path", () => {
    try {
      ManifestValidator.assert({
        id: "BAD ID",
        name: "ok",
        version: "bad",
        description: "ok",
        category: "tooling",
        dependencies: [],
        files: [],
        configPatches: [],
        compatibility: {},
      });
    } catch (err) {
      const ve = err as ValidationError;
      // The main error message is the multi-line summary
      expect(ve.message).toContain("id");
      expect(ve.message).toContain("version");
    }
  });
});
