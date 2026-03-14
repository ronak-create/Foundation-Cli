/**
 * Phase 4 Stage 2 — ModuleLoader test suite
 *
 * Tests the full discovery pipeline:
 *   - ModuleLoader class (loadFromDirectory, formatSummary)
 *   - discoverFlat
 *   - discoverByCategory
 *   - discoverRecursive
 *   - discoverBuiltinModules (the modules-package integration)
 *   - ManifestValidator integration (bad manifests are rejected)
 *   - Idempotency (re-scanning a registry with existing modules)
 *   - loadBuiltinModules static path (unchanged behaviour)
 *
 * Strategy: we create real temporary directories on disk with fixture files
 * rather than mocking the filesystem. This gives us confidence that the
 * dynamic import machinery works end-to-end.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import {
  ModuleRegistry,
  ModuleLoader,
  discoverFlat,
  discoverByCategory,
  discoverRecursive,
  ManifestValidator,
} from "@systemlabs/foundation-core";
import {
  loadBuiltinModules,
  discoverBuiltinModules,
  nextjsModule,
  expressModule,
  postgresqlModule,
  jwtModule,
  tailwindModule,
  dockerModule,
} from "../index.js";

import { BUILTIN_MODULES } from "../registry-loader.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function makeTmp(): Promise<string> {
  const dir = path.join(os.tmpdir(), `foundation-loader-${randomUUID()}`);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function rmTmp(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}

/** Writes a valid manifest.json into `dir`. */
async function writeManifest(
  dir: string,
  overrides: Partial<Record<string, unknown>> = {},
): Promise<void> {
  const manifest = {
    id:           overrides["id"]          ?? "test-module",
    name:         overrides["name"]        ?? "Test Module",
    version:      overrides["version"]     ?? "1.0.0",
    description:  overrides["description"] ?? "A test module",
    category:     overrides["category"]    ?? "tooling",
    runtime:      overrides["runtime"]     ?? "node",
    dependencies: overrides["dependencies"] ?? [],
    files:        overrides["files"]       ?? [],
    configPatches: overrides["configPatches"] ?? [],
    compatibility: overrides["compatibility"] ?? {},
    ...overrides,
  };
  await fs.writeFile(
    path.join(dir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf-8",
  );
}

/**
 * Writes a .js file that exports a named PluginDefinition.
 * The file is plain JS (ESM) so it can be dynamically imported by the test.
 */
async function writeModuleFile(
  filePath: string,
  moduleId: string,
  exportName = "testModule",
): Promise<void> {
  const src = `
export const ${exportName} = {
  manifest: {
    id: "${moduleId}",
    name: "Module ${moduleId}",
    version: "1.0.0",
    description: "Auto-discovered test module",
    category: "tooling",
    runtime: "node",
    dependencies: [],
    files: [],
    configPatches: [],
    compatibility: {},
  },
};
`;
  await fs.writeFile(filePath, src, "utf-8");
}

/**
 * Writes a .js file that exports a default PluginFactory function.
 */
async function writeFactoryFile(
  filePath: string,
  moduleId: string,
): Promise<void> {
  const src = `
export default function() {
  return {
    manifest: {
      id: "${moduleId}",
      name: "Factory ${moduleId}",
      version: "1.0.0",
      description: "Factory-pattern test module",
      category: "tooling",
      runtime: "node",
      dependencies: [],
      files: [],
      configPatches: [],
      compatibility: {},
    },
  };
}
`;
  await fs.writeFile(filePath, src, "utf-8");
}

// ── discoverFlat ──────────────────────────────────────────────────────────────

describe("discoverFlat", () => {
  let tmp: string;
  beforeEach(async () => { tmp = await makeTmp(); });
  afterEach(async ()  => { await rmTmp(tmp); });

  it("returns empty result for an empty directory", async () => {
    const registry = new ModuleRegistry();
    const result = await discoverFlat(tmp, registry);
    expect(result.loaded).toHaveLength(0);
    expect(result.inspected).toBe(0);
  });

  it("returns empty result when directory does not exist (ENOENT)", async () => {
    const registry = new ModuleRegistry();
    const result = await discoverFlat(path.join(tmp, "nonexistent"), registry);
    expect(result.loaded).toHaveLength(0);
    expect(result.failed).toHaveLength(0);
  });

  it("loads a named PluginDefinition export (Strategy A)", async () => {
    await writeModuleFile(path.join(tmp, "my-module.js"), "flat-mod-a");

    const registry = new ModuleRegistry();
    const result = await discoverFlat(tmp, registry);

    expect(result.loaded).toContain("flat-mod-a");
    expect(registry.hasModule("flat-mod-a")).toBe(true);
    expect(registry.getSource("flat-mod-a")).toBe("builtin");
  });

  it("loads a default PluginFactory export (Strategy B)", async () => {
    await writeFactoryFile(path.join(tmp, "factory.js"), "flat-mod-b");

    const registry = new ModuleRegistry();
    const result = await discoverFlat(tmp, registry);

    expect(result.loaded).toContain("flat-mod-b");
    expect(registry.hasModule("flat-mod-b")).toBe(true);
  });

  it("loads multiple files from the same directory", async () => {
    await writeModuleFile(path.join(tmp, "alpha.js"), "flat-alpha");
    await writeModuleFile(path.join(tmp, "beta.js"),  "flat-beta");

    const registry = new ModuleRegistry();
    const result = await discoverFlat(tmp, registry);

    expect(result.loaded).toContain("flat-alpha");
    expect(result.loaded).toContain("flat-beta");
    expect(result.loaded).toHaveLength(2);
  });

  it("skips files with non-module extensions (.json, .md, .d.ts)", async () => {
    await fs.writeFile(path.join(tmp, "data.json"), "{}", "utf-8");
    await fs.writeFile(path.join(tmp, "README.md"),  "# hi", "utf-8");
    await fs.writeFile(path.join(tmp, "types.d.ts"), "export {}", "utf-8");

    const registry = new ModuleRegistry();
    const result = await discoverFlat(tmp, registry);

    expect(result.loaded).toHaveLength(0);
    expect(result.failed).toHaveLength(0);
  });

  it("skips .test.ts and .spec.ts files", async () => {
    await writeModuleFile(path.join(tmp, "real.js"),        "flat-real");
    await fs.writeFile(path.join(tmp, "real.test.ts"),  "// test", "utf-8");
    await fs.writeFile(path.join(tmp, "real.spec.js"),  "// spec", "utf-8");

    const registry = new ModuleRegistry();
    const result = await discoverFlat(tmp, registry);

    expect(result.loaded).toEqual(["flat-real"]);
  });

  it("records a failure (not an abort) when a file fails to import", async () => {
    await fs.writeFile(
      path.join(tmp, "bad-syntax.js"),
      "this is not valid js !!!",
      "utf-8",
    );

    const registry = new ModuleRegistry();
    const result = await discoverFlat(tmp, registry);

    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]!.filePath).toMatch("bad-syntax.js");
  });

  it("records duplicate as skipped (not failed)", async () => {
    await writeModuleFile(path.join(tmp, "dup.js"), "flat-dup");

    const registry = new ModuleRegistry();
    await discoverFlat(tmp, registry); // first load

    // Second load — same registry, same file
    const result2 = await discoverFlat(tmp, registry);
    expect(result2.loaded).toHaveLength(0);
    expect(result2.skipped).toContain(path.join(tmp, "dup.js"));
  });

  it("registers as source='plugin' when source parameter is 'plugin'", async () => {
    await writeModuleFile(path.join(tmp, "plug.js"), "flat-plugin-src");

    const registry = new ModuleRegistry();
    await discoverFlat(tmp, registry, "plugin");

    expect(registry.getSource("flat-plugin-src")).toBe("plugin");
  });

  it("inspected count equals number of loadable files seen", async () => {
    await writeModuleFile(path.join(tmp, "a.js"), "flat-count-a");
    await writeModuleFile(path.join(tmp, "b.js"), "flat-count-b");

    const registry = new ModuleRegistry();
    const result = await discoverFlat(tmp, registry);
    expect(result.inspected).toBe(2);
  });
});

// ── discoverByCategory ────────────────────────────────────────────────────────

describe("discoverByCategory", () => {
  let tmp: string;
  beforeEach(async () => { tmp = await makeTmp(); });
  afterEach(async ()  => { await rmTmp(tmp); });

  it("returns empty result for an empty root directory", async () => {
    const registry = new ModuleRegistry();
    const result = await discoverByCategory(tmp, registry);
    expect(result.loaded).toHaveLength(0);
  });

  it("discovers modules in category subdirectories", async () => {
    await fs.mkdir(path.join(tmp, "frontend"), { recursive: true });
    await fs.mkdir(path.join(tmp, "backend"),  { recursive: true });
    await writeModuleFile(path.join(tmp, "frontend", "nextjs.js"),  "cat-frontend");
    await writeModuleFile(path.join(tmp, "backend",  "express.js"), "cat-backend");

    const registry = new ModuleRegistry();
    const result = await discoverByCategory(tmp, registry);

    expect(result.loaded).toContain("cat-frontend");
    expect(result.loaded).toContain("cat-backend");
    expect(result.loaded).toHaveLength(2);
  });

  it("does NOT recurse into nested subdirectories", async () => {
    await fs.mkdir(path.join(tmp, "auth", "nested"), { recursive: true });
    await writeModuleFile(path.join(tmp, "auth", "jwt.js"),           "cat-auth-jwt");
    await writeModuleFile(path.join(tmp, "auth", "nested", "deep.js"), "cat-auth-deep");

    const registry = new ModuleRegistry();
    const result = await discoverByCategory(tmp, registry);

    // Only the direct file is found — nested is not walked
    expect(result.loaded).toContain("cat-auth-jwt");
    expect(result.loaded).not.toContain("cat-auth-deep");
  });

  it("skips 'addon' subdirectory by default", async () => {
    await fs.mkdir(path.join(tmp, "addon",   "stripe"), { recursive: true });
    await fs.mkdir(path.join(tmp, "tooling"),           { recursive: true });
    await writeModuleFile(path.join(tmp, "tooling", "tool.js"), "cat-tool");
    await writeModuleFile(path.join(tmp, "addon",   "stripe.js"), "cat-should-skip");

    const registry = new ModuleRegistry();
    const result = await discoverByCategory(tmp, registry);

    expect(result.loaded).toContain("cat-tool");
    expect(result.loaded).not.toContain("cat-should-skip");
  });

  it("skips node_modules and __tests__ directories", async () => {
    await fs.mkdir(path.join(tmp, "node_modules", "fake"), { recursive: true });
    await fs.mkdir(path.join(tmp, "__tests__"),            { recursive: true });
    await writeModuleFile(path.join(tmp, "node_modules", "fake.js"), "cat-node-modules");
    await writeModuleFile(path.join(tmp, "__tests__", "test.js"),    "cat-tests");

    const registry = new ModuleRegistry();
    const result = await discoverByCategory(tmp, registry);

    expect(result.loaded).not.toContain("cat-node-modules");
    expect(result.loaded).not.toContain("cat-tests");
  });

  it("multiple files in the same category are all loaded", async () => {
    await fs.mkdir(path.join(tmp, "database"), { recursive: true });
    await writeModuleFile(path.join(tmp, "database", "pg.js"),     "cat-pg");
    await writeModuleFile(path.join(tmp, "database", "mysql.js"),  "cat-mysql");
    await writeModuleFile(path.join(tmp, "database", "sqlite.js"), "cat-sqlite");

    const registry = new ModuleRegistry();
    const result = await discoverByCategory(tmp, registry);

    expect(result.loaded).toContain("cat-pg");
    expect(result.loaded).toContain("cat-mysql");
    expect(result.loaded).toContain("cat-sqlite");
  });

  it("is idempotent — second call with same registry does not throw", async () => {
    await fs.mkdir(path.join(tmp, "auth"), { recursive: true });
    await writeModuleFile(path.join(tmp, "auth", "jwt.js"), "cat-idempotent");

    const registry = new ModuleRegistry();
    const r1 = await discoverByCategory(tmp, registry);
    const r2 = await discoverByCategory(tmp, registry); // second scan

    expect(r1.loaded).toContain("cat-idempotent");
    expect(r2.loaded).not.toContain("cat-idempotent"); // already registered
    expect(r2.skipped.length).toBeGreaterThan(0);       // shows up as skipped
  });
});

// ── discoverRecursive ─────────────────────────────────────────────────────────

describe("discoverRecursive", () => {
  let tmp: string;
  beforeEach(async () => { tmp = await makeTmp(); });
  afterEach(async ()  => { await rmTmp(tmp); });

  it("discovers module files at any depth", async () => {
    await fs.mkdir(path.join(tmp, "a", "b", "c"), { recursive: true });
    await writeModuleFile(path.join(tmp, "a", "b", "c", "deep.js"), "rec-deep");

    const registry = new ModuleRegistry();
    const result = await discoverRecursive(tmp, registry);

    expect(result.loaded).toContain("rec-deep");
  });

  it("stops descending into a directory when manifest.json is found", async () => {
    const modDir = path.join(tmp, "my-module");
    await fs.mkdir(modDir, { recursive: true });
    await writeManifest(modDir, { id: "rec-manifest-mod" });
    // Put a nested file that should NOT be picked up as a separate module
    await fs.mkdir(path.join(modDir, "nested"), { recursive: true });
    await writeModuleFile(path.join(modDir, "nested", "inner.js"), "rec-inner-should-not-load");

    const registry = new ModuleRegistry();
    const result = await discoverRecursive(tmp, registry);

    expect(result.loaded).toContain("rec-manifest-mod");
    expect(result.loaded).not.toContain("rec-inner-should-not-load");
  });

  it("skips node_modules regardless of depth", async () => {
    await fs.mkdir(path.join(tmp, "src", "node_modules", "pkg"), { recursive: true });
    await writeModuleFile(
      path.join(tmp, "src", "node_modules", "pkg", "index.js"),
      "rec-node-mod",
    );

    const registry = new ModuleRegistry();
    const result = await discoverRecursive(tmp, registry);

    expect(result.loaded).not.toContain("rec-node-mod");
  });
});

// ── manifest.json sidecar (Strategy C) ───────────────────────────────────────

describe("manifest.json sidecar loading (Strategy C)", () => {
  let tmp: string;
  beforeEach(async () => { tmp = await makeTmp(); });
  afterEach(async ()  => { await rmTmp(tmp); });

  it("loads a module from a directory with only manifest.json", async () => {
    const modDir = path.join(tmp, "my-plugin");
    await fs.mkdir(modDir, { recursive: true });
    await writeManifest(modDir, { id: "sidecar-mod" });

    const registry = new ModuleRegistry();
    const result = await discoverRecursive(tmp, registry);

    expect(result.loaded).toContain("sidecar-mod");
    expect(registry.hasModule("sidecar-mod")).toBe(true);
  });

  it("fails gracefully when manifest.json is invalid JSON", async () => {
    const modDir = path.join(tmp, "bad-json");
    await fs.mkdir(modDir, { recursive: true });
    await fs.writeFile(path.join(modDir, "manifest.json"), "{ invalid json", "utf-8");

    const registry = new ModuleRegistry();
    const result = await discoverRecursive(tmp, registry);

    expect(result.failed).toHaveLength(1);
    expect(result.loaded).toHaveLength(0);
  });

  it("fails gracefully when manifest.json fails ManifestValidator", async () => {
    const modDir = path.join(tmp, "invalid-manifest");
    await fs.mkdir(modDir, { recursive: true });
    // Missing required fields
    await fs.writeFile(
      path.join(modDir, "manifest.json"),
      JSON.stringify({ id: "no-name-or-version" }),
      "utf-8",
    );

    const registry = new ModuleRegistry();
    const result = await discoverRecursive(tmp, registry);

    expect(result.failed).toHaveLength(1);
    expect(result.loaded).not.toContain("no-name-or-version");
  });

  it("reads hooks.json when present and registers as plugin with source='plugin'", async () => {
    const modDir = path.join(tmp, "hooked-plugin");
    await fs.mkdir(modDir, { recursive: true });
    await writeManifest(modDir, { id: "hooked-plugin" });
    await fs.writeFile(
      path.join(modDir, "hooks.json"),
      JSON.stringify({ afterWrite: "console.log('hook ran')" }),
      "utf-8",
    );

    const registry = new ModuleRegistry();
    await discoverRecursive(tmp, registry, "plugin");

    expect(registry.hasModule("hooked-plugin")).toBe(true);
    expect(registry.getSource("hooked-plugin")).toBe("plugin");
  });

  it("does not fail when hooks.json is absent", async () => {
    const modDir = path.join(tmp, "no-hooks");
    await fs.mkdir(modDir, { recursive: true });
    await writeManifest(modDir, { id: "no-hooks-mod" });

    const registry = new ModuleRegistry();
    const result = await discoverRecursive(tmp, registry);

    expect(result.loaded).toContain("no-hooks-mod");
    expect(result.failed).toHaveLength(0);
  });
});

// ── ModuleLoader class ────────────────────────────────────────────────────────

describe("ModuleLoader", () => {
  let tmp: string;
  beforeEach(async () => { tmp = await makeTmp(); });
  afterEach(async ()  => { await rmTmp(tmp); });

  it("loadFromDirectory defaults to 'category' mode", async () => {
    await fs.mkdir(path.join(tmp, "tooling"), { recursive: true });
    await writeModuleFile(path.join(tmp, "tooling", "tool.js"), "loader-tool");

    const registry = new ModuleRegistry();
    const loader = new ModuleLoader(registry);
    const result = await loader.loadFromDirectory(tmp);

    expect(result.loaded).toContain("loader-tool");
  });

  it("loadFromDirectory respects 'flat' mode", async () => {
    await writeModuleFile(path.join(tmp, "direct.js"), "loader-flat");

    const registry = new ModuleRegistry();
    const loader = new ModuleLoader(registry);
    const result = await loader.loadFromDirectory(tmp, "flat");

    expect(result.loaded).toContain("loader-flat");
  });

  it("loadFromDirectory respects 'recursive' mode", async () => {
    await fs.mkdir(path.join(tmp, "deep", "nested"), { recursive: true });
    await writeModuleFile(path.join(tmp, "deep", "nested", "mod.js"), "loader-recursive");

    const registry = new ModuleRegistry();
    const loader = new ModuleLoader(registry);
    const result = await loader.loadFromDirectory(tmp, "recursive");

    expect(result.loaded).toContain("loader-recursive");
  });

  it("calls the log callback with progress messages", async () => {
    const logMessages: string[] = [];
    const registry = new ModuleRegistry();
    const loader = new ModuleLoader(registry, (msg) => logMessages.push(msg));
    await loader.loadFromDirectory(tmp);
    expect(logMessages.length).toBeGreaterThan(0);
  });

  it("formatSummary returns 'Loaded modules:' header", async () => {
    await fs.mkdir(path.join(tmp, "auth"), { recursive: true });
    await writeModuleFile(path.join(tmp, "auth", "jwt.js"), "fmt-jwt");

    const registry = new ModuleRegistry();
    const loader = new ModuleLoader(registry);
    const result = await loader.loadFromDirectory(tmp);
    const summary = loader.formatSummary(result);

    expect(summary).toMatch("Loaded modules:");
    expect(summary).toMatch("- fmt-jwt");
  });

  it("formatSummary shows '(none)' when nothing was loaded", async () => {
    const registry = new ModuleRegistry();
    const loader = new ModuleLoader(registry);
    const result = await loader.loadFromDirectory(tmp);
    const summary = loader.formatSummary(result);
    expect(summary).toMatch("(none)");
  });

  it("formatSummary includes loaded count", async () => {
    await fs.mkdir(path.join(tmp, "db"), { recursive: true });
    await writeModuleFile(path.join(tmp, "db", "pg.js"),    "fmt-pg");
    await writeModuleFile(path.join(tmp, "db", "mysql.js"), "fmt-mysql");

    const registry = new ModuleRegistry();
    const loader = new ModuleLoader(registry);
    const result = await loader.loadFromDirectory(tmp);
    const summary = loader.formatSummary(result);

    expect(summary).toMatch("2 loaded");
  });

  it("formatSummary includes failed count when failures exist", async () => {
    await fs.writeFile(path.join(tmp, "bad.js"), "!!invalid!!", "utf-8");
    // Need a category dir for category mode
    await fs.mkdir(path.join(tmp, "broken"), { recursive: true });
    await fs.writeFile(path.join(tmp, "broken", "bad.js"), "!!invalid!!", "utf-8");

    const registry = new ModuleRegistry();
    const loader = new ModuleLoader(registry);
    // const result = await loader.loadFromDirectory(tmp); // category mode skips root files
    // Use flat mode to hit the bad file directly
    const result2 = await loader.loadFromDirectory(tmp, "flat");
    const summary = loader.formatSummary(result2);

    expect(summary).toMatch("failed");
  });
});

// ── ManifestValidator integration ─────────────────────────────────────────────

describe("ManifestValidator integration", () => {
  let tmp: string;
  beforeEach(async () => { tmp = await makeTmp(); });
  afterEach(async ()  => { await rmTmp(tmp); });

  it("rejects a module whose manifest has an invalid id (not kebab-case)", async () => {
    const modDir = path.join(tmp, "invalid-id");
    await fs.mkdir(modDir, { recursive: true });
    await writeManifest(modDir, { id: "Invalid_ID" }); // uppercase + underscore

    const registry = new ModuleRegistry();
    const result = await discoverRecursive(tmp, registry);

    expect(result.failed).toHaveLength(1);
    expect(result.loaded).not.toContain("Invalid_ID");
  });

  it("rejects a module whose manifest has an invalid semver version", async () => {
    const modDir = path.join(tmp, "bad-version");
    await fs.mkdir(modDir, { recursive: true });
    await writeManifest(modDir, { id: "bad-version-mod", version: "not-semver" });

    const registry = new ModuleRegistry();
    const result = await discoverRecursive(tmp, registry);

    expect(result.failed).toHaveLength(1);
  });

  it("accepts a module with full valid manifest", async () => {
    const modDir = path.join(tmp, "valid");
    await fs.mkdir(modDir, { recursive: true });
    await writeManifest(modDir, {
      id:          "valid-full-mod",
      name:        "Valid Full Module",
      version:     "2.3.4",
      description: "A fully valid manifest",
      category:    "backend",
      runtime:     "node",
    });

    const registry = new ModuleRegistry();
    const result = await discoverRecursive(tmp, registry);

    expect(result.loaded).toContain("valid-full-mod");
    const manifest = registry.getModule("valid-full-mod").manifest;
    expect(ManifestValidator.validate(manifest).valid).toBe(true);
  });
});

// ── discoverBuiltinModules (integration with real module files) ───────────────

describe("discoverBuiltinModules", () => {
  it("is exported from @systemlabs/foundation-modules", () => {
    expect(typeof discoverBuiltinModules).toBe("function");
  });

  it("loads modules into an empty registry", async () => {
    const registry = new ModuleRegistry();
    const result = await discoverBuiltinModules(registry);

    // We expect at least the 6 known built-in modules
    expect(result.loaded.length).toBeGreaterThanOrEqual(6);
    expect(registry.size).toBeGreaterThanOrEqual(6);
  });

  it("registers all 6 expected builtin IDs", async () => {
    const registry = new ModuleRegistry();
    await discoverBuiltinModules(registry);

    expect(registry.hasModule("frontend-nextjs")).toBe(true);
    expect(registry.hasModule("backend-express")).toBe(true);
    expect(registry.hasModule("database-postgresql")).toBe(true);
    expect(registry.hasModule("auth-jwt")).toBe(true);
    expect(registry.hasModule("ui-tailwind")).toBe(true);
    expect(registry.hasModule("deployment-docker")).toBe(true);
  });

  it("all discovered modules pass ManifestValidator", async () => {
    const registry = new ModuleRegistry();
    await discoverBuiltinModules(registry);

    for (const manifest of registry.listModules()) {
      const result = ManifestValidator.validate(manifest);
      expect(result.valid, `Manifest for "${manifest.id}" failed validation`).toBe(true);
    }
  });

  it("all discovered modules are registered as 'builtin'", async () => {
    const registry = new ModuleRegistry();
    await discoverBuiltinModules(registry);

    for (const manifest of registry.listBuiltins()) {
      expect(registry.getSource(manifest.id)).toBe("builtin");
    }
  });

  it("is idempotent — calling twice with the same registry does not throw", async () => {
    const registry = new ModuleRegistry();
    await discoverBuiltinModules(registry);
    const firstCount = registry.size;

    await expect(discoverBuiltinModules(registry)).resolves.not.toThrow();
    expect(registry.size).toBe(firstCount);
  });

  it("is idempotent with a registry pre-populated by loadBuiltinModules", async () => {
    const registry = new ModuleRegistry();
    loadBuiltinModules(registry);
    const afterStatic = registry.size;

    const result = await discoverBuiltinModules(registry);
    // Nothing new should have been loaded (all 6 already present)
    expect(result.loaded).toHaveLength(0);
    expect(registry.size).toBe(afterStatic);
  });

  it("produces zero failed entries (all built-in manifests are valid)", async () => {
    const registry = new ModuleRegistry();
    const result = await discoverBuiltinModules(registry);
    expect(result.failed).toHaveLength(0);
  });

  it("accepts an explicit modulesDir path", async () => {
    // Use a real temp dir with a single category + module
    const tmp = await makeTmp();
    try {
      await fs.mkdir(path.join(tmp, "tooling"), { recursive: true });
      await writeModuleFile(path.join(tmp, "tooling", "mytool.js"), "explicit-dir-mod");

      const registry = new ModuleRegistry();
      const result = await discoverBuiltinModules(registry, tmp);

      expect(result.loaded).toContain("explicit-dir-mod");
    } finally {
      await rmTmp(tmp);
    }
  });

  it("accepts an optional log callback", async () => {
    const messages: string[] = [];
    const registry = new ModuleRegistry();
    await discoverBuiltinModules(registry, undefined, (msg) => messages.push(msg));
    expect(messages.length).toBeGreaterThan(0);
  });

  it("returned DiscoveryResult has correct shape", async () => {
    const registry = new ModuleRegistry();
    const result = await discoverBuiltinModules(registry);

    expect(Array.isArray(result.loaded)).toBe(true);
    expect(Array.isArray(result.skipped)).toBe(true);
    expect(Array.isArray(result.failed)).toBe(true);
    expect(typeof result.inspected).toBe("number");
    expect(result.inspected).toBeGreaterThan(0);
  });
});

// ── loadBuiltinModules (static path — unchanged behaviour) ────────────────────

describe("loadBuiltinModules (static path — regression)", () => {
  it("registers all 6 built-in modules", () => {
    const registry = new ModuleRegistry();
    loadBuiltinModules(registry);
    expect(registry.size).toBeGreaterThanOrEqual(6);
    expect(registry.hasModule("frontend-nextjs")).toBe(true);
    expect(registry.hasModule("backend-express")).toBe(true);
    expect(registry.hasModule("database-postgresql")).toBe(true);
    expect(registry.hasModule("auth-jwt")).toBe(true);
    expect(registry.hasModule("ui-tailwind")).toBe(true);
    expect(registry.hasModule("deployment-docker")).toBe(true);
  });

  it("is idempotent — calling twice does not throw", () => {
    const registry = new ModuleRegistry();
    loadBuiltinModules(registry);
    expect(() => loadBuiltinModules(registry)).not.toThrow();
    expect(registry.size).toBe(BUILTIN_MODULES.length);
  });

  it("all 6 modules are registered as 'builtin'", () => {
    const registry = new ModuleRegistry();
    loadBuiltinModules(registry);
    for (const m of registry.listBuiltins()) {
      expect(registry.getSource(m.id)).toBe("builtin");
    }
    expect(registry.listPlugins()).toHaveLength(0);
  });

  it("all 6 manifest objects pass ManifestValidator", () => {
    const modules = [nextjsModule, expressModule, postgresqlModule, jwtModule, tailwindModule, dockerModule];
    for (const mod of modules) {
      const r = ManifestValidator.validate(mod.manifest);
      expect(r.valid, `${mod.manifest.id} failed`).toBe(true);
    }
  });
});

// ── Combined: static + dynamic together ──────────────────────────────────────

describe("static + dynamic combined", () => {
  it("loadBuiltinModules then discoverBuiltinModules equals the same registry size", async () => {
    const staticRegistry  = new ModuleRegistry();
    const dynamicRegistry = new ModuleRegistry();

    loadBuiltinModules(staticRegistry);
    await discoverBuiltinModules(dynamicRegistry);

    // Both should have the same 6 core modules
    const staticIds  = staticRegistry.listModules().map((m) => m.id).sort();
    const dynamicIds = dynamicRegistry.listBuiltins().map((m) => m.id).sort();

    for (const id of staticIds) {
      expect(dynamicIds).toContain(id);
    }
  });

  it("loadBuiltinModules + discoverBuiltinModules on same registry = no duplicates", async () => {
    const registry = new ModuleRegistry();
    loadBuiltinModules(registry);
    const afterStatic = registry.size;

    await discoverBuiltinModules(registry);

    // Size should not have grown (all 6 already present)
    expect(registry.size).toBe(afterStatic);
  });
});

