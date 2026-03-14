import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { randomUUID } from "node:crypto";
import {
  ModuleRegistry,
  loadPluginsFromProject,
} from "../module-registry/registry.js";
import {
  resolveModules,
} from "../dependency-resolver/resolver.js";
import {
  buildCompositionPlan,
} from "../composition/planner.js";
import {
  DuplicateModuleError,
  ModuleNotFoundError,
  ValidationError,
  ModuleConflictError,
  MissingRequiredModuleError,
} from "../errors.js";
import {
  writeProjectState,
  FOUNDATION_DIR,
} from "../state/project-state.js";
import type { ModuleManifest, PluginDefinition } from "@systemlabs/foundation-plugin-sdk";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function makeTmp(): Promise<string> {
  const dir = path.join(os.tmpdir(), `foundation-reg-plugin-${randomUUID()}`);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function rmTmp(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}

/** Writes a valid manifest.json into .foundation/plugins/<id>/ */
async function writePluginManifest(
  projectRoot: string,
  manifest: ModuleManifest,
): Promise<void> {
  const dir = path.join(
    projectRoot,
    FOUNDATION_DIR,
    "plugins",
    manifest.id,
  );
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
}

function makeManifest(
  id: string,
  overrides: Partial<ModuleManifest> = {},
): ModuleManifest {
  return {
    id,
    name: `Plugin ${id}`,
    version: "1.0.0",
    description: "A test plugin",
    category: "tooling",
    dependencies: [],
    files: [],
    configPatches: [],
    compatibility: {},
    ...overrides,
  };
}

function makePlugin(
  id: string,
  overrides: Partial<ModuleManifest> = {},
): PluginDefinition {
  return { manifest: makeManifest(id, overrides) };
}

/** Seeds a project root with an empty .foundation/project.lock */
async function initProject(projectRoot: string): Promise<void> {
  await writeProjectState({
    projectRoot,
    orderedModules: [],
    packageManager: "npm",
    projectName: "test-project",
    selections: {},
    nowIso: "2026-01-01T00:00:00.000Z",
  });
}

// ── registerModule vs registerPlugin ─────────────────────────────────────────

describe("ModuleRegistry — source tagging", () => {
  it("registerModule tags source as 'builtin'", () => {
    const registry = new ModuleRegistry();
    registry.registerModule(makePlugin("backend-express"));
    expect(registry.getSource("backend-express")).toBe("builtin");
  });

  it("registerPlugin tags source as 'plugin'", () => {
    const registry = new ModuleRegistry();
    registry.registerPlugin(makePlugin("plugin-stripe"));
    expect(registry.getSource("plugin-stripe")).toBe("plugin");
  });

  it("getSource throws ModuleNotFoundError for unknown id", () => {
    const registry = new ModuleRegistry();
    expect(() => registry.getSource("nonexistent")).toThrowError(
      ModuleNotFoundError,
    );
  });
});

// ── listBuiltins / listPlugins ────────────────────────────────────────────────

describe("ModuleRegistry — listBuiltins / listPlugins", () => {
  it("listBuiltins returns only builtin manifests", () => {
    const registry = new ModuleRegistry();
    registry.registerModule(makePlugin("backend-express"));
    registry.registerModule(makePlugin("backend-postgresql"));
    registry.registerPlugin(makePlugin("plugin-stripe"));

    const ids = registry.listBuiltins().map((m) => m.id);
    expect(ids).toContain("backend-express");
    expect(ids).toContain("backend-postgresql");
    expect(ids).not.toContain("plugin-stripe");
  });

  it("listPlugins returns only plugin manifests", () => {
    const registry = new ModuleRegistry();
    registry.registerModule(makePlugin("backend-express"));
    registry.registerPlugin(makePlugin("plugin-stripe"));
    registry.registerPlugin(makePlugin("plugin-redis"));

    const ids = registry.listPlugins().map((m) => m.id);
    expect(ids).toContain("plugin-stripe");
    expect(ids).toContain("plugin-redis");
    expect(ids).not.toContain("backend-express");
  });

  it("listBuiltins and listPlugins are disjoint — total equals listModules", () => {
    const registry = new ModuleRegistry();
    registry.registerModule(makePlugin("builtin-a"));
    registry.registerModule(makePlugin("builtin-b"));
    registry.registerPlugin(makePlugin("plugin-a"));

    expect(registry.listBuiltins().length + registry.listPlugins().length).toBe(
      registry.listModules().length,
    );
  });
});

// ── registerPlugin strips hooks ───────────────────────────────────────────────

describe("ModuleRegistry — registerPlugin strips hooks", () => {
  it("hooks are not stored when registering a plugin", () => {
    const registry = new ModuleRegistry();
    const plugin: PluginDefinition = {
      manifest: makeManifest("plugin-with-hooks"),
      hooks: {
        afterInstall: async () => { /* would run code */ },
        beforeWrite: async () => { /* would run code */ },
      },
    };

    registry.registerPlugin(plugin);

    const retrieved = registry.getModule("plugin-with-hooks");
    expect(retrieved.hooks).toBeUndefined();
  });

  it("hooks ARE stored when registering a builtin (registerModule)", () => {
    const registry = new ModuleRegistry();
    const hookFn = async (): Promise<void> => { /* noop */ };
    const plugin: PluginDefinition = {
      manifest: makeManifest("builtin-with-hooks"),
      hooks: { afterInstall: hookFn },
    };

    registry.registerModule(plugin);

    const retrieved = registry.getModule("builtin-with-hooks");
    expect(retrieved.hooks?.afterInstall).toBe(hookFn);
  });
});

// ── registerPlugin — validation ───────────────────────────────────────────────

describe("ModuleRegistry — registerPlugin validation", () => {
  it("rejects plugin with invalid manifest (bad version)", () => {
    const registry = new ModuleRegistry();
    expect(() =>
      registry.registerPlugin(makePlugin("plugin-x", { version: "not-semver" })),
    ).toThrowError(ValidationError);
  });

  it("rejects plugin with invalid id (uppercase)", () => {
    const registry = new ModuleRegistry();
    expect(() =>
      registry.registerPlugin({ manifest: makeManifest("PLUGIN_X") }),
    ).toThrowError(ValidationError);
  });

  it("throws DuplicateModuleError if plugin id collides with builtin", () => {
    const registry = new ModuleRegistry();
    registry.registerModule(makePlugin("backend-express"));

    expect(() =>
      registry.registerPlugin(makePlugin("backend-express")),
    ).toThrowError(DuplicateModuleError);
  });

  it("throws DuplicateModuleError if two plugins share the same id", () => {
    const registry = new ModuleRegistry();
    registry.registerPlugin(makePlugin("plugin-stripe"));

    expect(() =>
      registry.registerPlugin(makePlugin("plugin-stripe")),
    ).toThrowError(DuplicateModuleError);
  });
});

// ── loadPluginsFromProject ────────────────────────────────────────────────────

describe("loadPluginsFromProject", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await makeTmp();
    await initProject(tmp);
  });

  afterEach(async () => { await rmTmp(tmp); });

  it("returns empty array when no .foundation/plugins/ directory exists", async () => {
    const registry = new ModuleRegistry();
    const loaded = await loadPluginsFromProject(tmp, registry);
    expect(loaded).toHaveLength(0);
    expect(registry.size).toBe(0);
  });

  it("loads a single valid plugin manifest", async () => {
    await writePluginManifest(tmp, makeManifest("plugin-stripe"));

    const registry = new ModuleRegistry();
    const loaded = await loadPluginsFromProject(tmp, registry);

    expect(loaded).toContain("plugin-stripe");
    expect(registry.hasModule("plugin-stripe")).toBe(true);
    expect(registry.getSource("plugin-stripe")).toBe("plugin");
  });

  it("loads multiple plugin manifests in one call", async () => {
    await writePluginManifest(tmp, makeManifest("plugin-stripe"));
    await writePluginManifest(tmp, makeManifest("plugin-redis"));
    await writePluginManifest(tmp, makeManifest("plugin-openai"));

    const registry = new ModuleRegistry();
    const loaded = await loadPluginsFromProject(tmp, registry);

    expect(loaded).toHaveLength(3);
    expect(registry.listPlugins()).toHaveLength(3);
  });

  it("all loaded plugins appear in listModules()", async () => {
    await writePluginManifest(tmp, makeManifest("plugin-stripe"));

    const registry = new ModuleRegistry();
    registry.registerModule(makePlugin("backend-express")); // builtin first
    await loadPluginsFromProject(tmp, registry);

    const ids = registry.listModules().map((m) => m.id);
    expect(ids).toContain("backend-express");
    expect(ids).toContain("plugin-stripe");
  });

  it("silently skips a directory with missing manifest.json", async () => {
    // Create a plugin directory with no manifest
    const badDir = path.join(tmp, FOUNDATION_DIR, "plugins", "plugin-bad");
    await fs.mkdir(badDir, { recursive: true });
    // No manifest.json written

    await writePluginManifest(tmp, makeManifest("plugin-stripe")); // valid one

    const registry = new ModuleRegistry();
    const loaded = await loadPluginsFromProject(tmp, registry);

    expect(loaded).toHaveLength(1);
    expect(loaded).toContain("plugin-stripe");
  });

  it("silently skips a directory with corrupt manifest.json", async () => {
    const corruptDir = path.join(tmp, FOUNDATION_DIR, "plugins", "plugin-corrupt");
    await fs.mkdir(corruptDir, { recursive: true });
    await fs.writeFile(path.join(corruptDir, "manifest.json"), "{ not json");

    await writePluginManifest(tmp, makeManifest("plugin-stripe"));

    const registry = new ModuleRegistry();
    const loaded = await loadPluginsFromProject(tmp, registry);

    expect(loaded).not.toContain("plugin-corrupt");
    expect(loaded).toContain("plugin-stripe");
  });

  it("silently skips a directory with invalid manifest (fails validation)", async () => {
    const invalidManifest = {
      ...makeManifest("plugin-invalid"),
      version: "NOT_SEMVER",       // will fail ManifestValidator
      id: "INVALID_ID_UPPERCASE",  // will fail ManifestValidator
    };

    const dir = path.join(tmp, FOUNDATION_DIR, "plugins", "plugin-invalid");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, "manifest.json"),
      JSON.stringify(invalidManifest),
    );

    await writePluginManifest(tmp, makeManifest("plugin-stripe"));

    const registry = new ModuleRegistry();
    const loaded = await loadPluginsFromProject(tmp, registry);

    expect(loaded).not.toContain("plugin-invalid");
    expect(loaded).toContain("plugin-stripe");
  });

  it("is idempotent — calling twice does not throw DuplicateModuleError", async () => {
    await writePluginManifest(tmp, makeManifest("plugin-stripe"));

    const registry = new ModuleRegistry();
    await loadPluginsFromProject(tmp, registry);

    await expect(
      loadPluginsFromProject(tmp, registry),
    ).resolves.not.toThrow();
    // Second call skips already-registered ids
    expect(registry.listPlugins()).toHaveLength(1);
  });

  it("skips id already registered as a builtin (no collision)", async () => {
    // A builtin and a plugin share an id — plugin load skips silently
    await writePluginManifest(tmp, makeManifest("backend-express"));

    const registry = new ModuleRegistry();
    registry.registerModule(makePlugin("backend-express")); // builtin

    const loaded = await loadPluginsFromProject(tmp, registry);

    expect(loaded).not.toContain("backend-express");
    expect(registry.getSource("backend-express")).toBe("builtin"); // not overwritten
  });

  it("strips hooks from loaded plugins (no plugin hooks execute)", async () => {
    await writePluginManifest(tmp, makeManifest("plugin-stripe"));

    const registry = new ModuleRegistry();
    await loadPluginsFromProject(tmp, registry);

    const plugin = registry.getModule("plugin-stripe");
    expect(plugin.hooks).toBeUndefined();
  });
});

// ── Resolution — plugins participate fully ────────────────────────────────────

describe("resolveModules — plugins included in resolution", () => {
  it("resolves a plugin by id just like a builtin", () => {
    const registry = new ModuleRegistry();
    registry.registerModule(makePlugin("backend-express"));
    registry.registerPlugin(makePlugin("plugin-stripe"));

    const result = resolveModules(
      ["backend-express", "plugin-stripe"],
      registry,
    );

    const ids = result.ordered.map((m) => m.id);
    expect(ids).toContain("backend-express");
    expect(ids).toContain("plugin-stripe");
  });

  it("plugin with requires capability is auto-injected correctly", () => {
    const registry = new ModuleRegistry();
    registry.registerModule(makePlugin("backend-express")); // builtin

    // Plugin requires backend-express to be present
    registry.registerPlugin(
      makePlugin("plugin-stripe", {
        compatibility: { requires: ["backend-express"] },
      }),
    );

    const result = resolveModules(["plugin-stripe"], registry);

    const ids = result.ordered.map((m) => m.id);
    // backend-express must appear before plugin-stripe (dependency-first)
    expect(ids).toContain("backend-express");
    expect(ids).toContain("plugin-stripe");
    expect(ids.indexOf("backend-express")).toBeLessThan(
      ids.indexOf("plugin-stripe"),
    );
    expect(result.added).toContain("backend-express");
  });

  it("plugin requires are transitively resolved", () => {
    const registry = new ModuleRegistry();
    registry.registerModule(makePlugin("database-postgresql"));
    registry.registerModule(makePlugin("backend-express", {
      compatibility: { requires: ["database-postgresql"] },
    }));
    registry.registerPlugin(
      makePlugin("plugin-stripe", {
        compatibility: { requires: ["backend-express"] },
      }),
    );

    const result = resolveModules(["plugin-stripe"], registry);
    const ids = result.ordered.map((m) => m.id);

    // database → express → stripe
    expect(ids.indexOf("database-postgresql")).toBeLessThan(
      ids.indexOf("backend-express"),
    );
    expect(ids.indexOf("backend-express")).toBeLessThan(
      ids.indexOf("plugin-stripe"),
    );
    expect(result.added).toContain("backend-express");
    expect(result.added).toContain("database-postgresql");
  });

  it("plugin conflicts with a selected builtin throws ModuleConflictError", () => {
    const registry = new ModuleRegistry();
    registry.registerModule(makePlugin("auth-session"));
    registry.registerPlugin(
      makePlugin("plugin-jwt", {
        compatibility: { conflicts: ["auth-session"] },
      }),
    );

    expect(() =>
      resolveModules(["auth-session", "plugin-jwt"], registry),
    ).toThrowError(ModuleConflictError);
  });

  it("builtin conflicts with plugin throws ModuleConflictError", () => {
    const registry = new ModuleRegistry();
    registry.registerModule(
      makePlugin("auth-session", {
        compatibility: { conflicts: ["plugin-jwt"] },
      }),
    );
    registry.registerPlugin(makePlugin("plugin-jwt"));

    expect(() =>
      resolveModules(["auth-session", "plugin-jwt"], registry),
    ).toThrowError(ModuleConflictError);
  });

  it("throws MissingRequiredModuleError when plugin requires an unregistered module", () => {
    const registry = new ModuleRegistry();
    registry.registerPlugin(
      makePlugin("plugin-stripe", {
        compatibility: { requires: ["backend-express"] }, // not registered
      }),
    );

    expect(() => resolveModules(["plugin-stripe"], registry)).toThrowError(
      MissingRequiredModuleError,
    );
  });

  it("two plugins can coexist without conflict", () => {
    const registry = new ModuleRegistry();
    registry.registerPlugin(makePlugin("plugin-stripe"));
    registry.registerPlugin(makePlugin("plugin-redis"));

    const result = resolveModules(["plugin-stripe", "plugin-redis"], registry);
    expect(result.ordered).toHaveLength(2);
  });
});

// ── Composition — plugins contribute files/deps/patches ──────────────────────

describe("buildCompositionPlan — plugins contribute correctly", () => {
  it("plugin files are included in the composition plan", () => {
    const registry = new ModuleRegistry();
    registry.registerPlugin(
      makePlugin("plugin-stripe", {
        files: [
          {
            relativePath: "src/payments/stripe.ts",
            content: "// stripe",
          },
        ],
      }),
    );

    const result = resolveModules(["plugin-stripe"], registry);
    const plan = buildCompositionPlan(result.ordered);

    expect(plan.files.some((f) => f.relativePath === "src/payments/stripe.ts")).toBe(
      true,
    );
  });

  it("plugin dependencies are included in the composition plan", () => {
    const registry = new ModuleRegistry();
    registry.registerPlugin(
      makePlugin("plugin-stripe", {
        dependencies: [
          { name: "stripe", version: "^15.0.0", scope: "dependencies" },
        ],
      }),
    );

    const result = resolveModules(["plugin-stripe"], registry);
    const plan = buildCompositionPlan(result.ordered);

    expect(plan.dependencies.some((d) => d.name === "stripe")).toBe(true);
  });

  it("plugin configPatches are included in the composition plan", () => {
    const registry = new ModuleRegistry();
    registry.registerPlugin(
      makePlugin("plugin-stripe", {
        configPatches: [
          {
            targetFile: "package.json",
            merge: { scripts: { "stripe:listen": "stripe listen" } },
          },
        ],
      }),
    );

    const result = resolveModules(["plugin-stripe"], registry);
    const plan = buildCompositionPlan(result.ordered);

    expect(
      plan.configPatches.some((p) => p.targetFile === "package.json"),
    ).toBe(true);
  });

  it("plugin + builtin together deduplicate shared deps", () => {
    const sharedDep = {
      name: "dotenv",
      version: "^16.0.0",
      scope: "dependencies" as const,
    };

    const registry = new ModuleRegistry();
    registry.registerModule(makePlugin("backend-express", { dependencies: [sharedDep] }));
    registry.registerPlugin(makePlugin("plugin-stripe", { dependencies: [sharedDep] }));

    const result = resolveModules(["backend-express", "plugin-stripe"], registry);
    const plan = buildCompositionPlan(result.ordered);

    const dotenvEntries = plan.dependencies.filter((d) => d.name === "dotenv");
    expect(dotenvEntries).toHaveLength(1);
  });

  it("plugin file conflict with builtin is detected", () => {
    // const { DuplicateFilePathError } = require("../errors.js");

    const registry = new ModuleRegistry();
    registry.registerModule(
      makePlugin("backend-express", {
        files: [{ relativePath: "src/server.ts", content: "// express" }],
      }),
    );
    registry.registerPlugin(
      makePlugin("plugin-custom-server", {
        files: [{ relativePath: "src/server.ts", content: "// custom" }],
      }),
    );

    const result = resolveModules(
      ["backend-express", "plugin-custom-server"],
      registry,
    );

    expect(() => buildCompositionPlan(result.ordered)).toThrowError();
  });
});

// ── End-to-end: loadPluginsFromProject → resolve → plan ───────────────────────

describe("end-to-end: disk → loadPluginsFromProject → resolve → plan", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await makeTmp();
    await initProject(tmp);
  });

  afterEach(async () => { await rmTmp(tmp); });

  it("full flow: plugin on disk is loaded, resolved, and planned", async () => {
    await writePluginManifest(
      tmp,
      makeManifest("plugin-stripe", {
        dependencies: [
          { name: "stripe", version: "^15.0.0", scope: "dependencies" },
        ],
        files: [
          {
            relativePath: "src/payments/stripe.ts",
            content: "// stripe integration",
          },
        ],
        configPatches: [
          {
            targetFile: ".env.example",
            merge: { STRIPE_SECRET_KEY: "sk_test_..." },
          },
        ],
      }),
    );

    // Also write a builtin-level module
    const registry = new ModuleRegistry();
    registry.registerModule(makePlugin("backend-express"));

    // Load plugins from disk
    const loaded = await loadPluginsFromProject(tmp, registry);
    expect(loaded).toContain("plugin-stripe");

    // Resolve both
    const resolution = resolveModules(
      ["backend-express", "plugin-stripe"],
      registry,
    );
    expect(resolution.ordered).toHaveLength(2);

    // Build plan
    const plan = buildCompositionPlan(resolution.ordered);
    expect(plan.files.some((f) => f.relativePath === "src/payments/stripe.ts")).toBe(true);
    expect(plan.dependencies.some((d) => d.name === "stripe")).toBe(true);
    expect(plan.configPatches.some((p) => p.targetFile === ".env.example")).toBe(true);
  });

  it("plugin with requires: loads and injects required builtin", async () => {
    // Write a plugin that requires backend-express
    await writePluginManifest(
      tmp,
      makeManifest("plugin-stripe", {
        compatibility: { requires: ["backend-express"] },
        files: [
          { relativePath: "src/payments/stripe.ts", content: "// stripe" },
        ],
      }),
    );

    const registry = new ModuleRegistry();
    registry.registerModule(makePlugin("backend-express")); // builtin available

    await loadPluginsFromProject(tmp, registry);

    // Only select plugin — backend-express should be auto-added
    const resolution = resolveModules(["plugin-stripe"], registry);

    expect(resolution.added).toContain("backend-express");

    const ids = resolution.ordered.map((m) => m.id);
    expect(ids.indexOf("backend-express")).toBeLessThan(
      ids.indexOf("plugin-stripe"),
    );
  });

  it("multiple plugins loaded from disk all participate in resolution", async () => {
    await writePluginManifest(tmp, makeManifest("plugin-stripe"));
    await writePluginManifest(tmp, makeManifest("plugin-redis"));

    const registry = new ModuleRegistry();
    await loadPluginsFromProject(tmp, registry);

    const resolution = resolveModules(["plugin-stripe", "plugin-redis"], registry);
    const plan = buildCompositionPlan(resolution.ordered);

    expect(plan.orderedModules.map((m) => m.id)).toContain("plugin-stripe");
    expect(plan.orderedModules.map((m) => m.id)).toContain("plugin-redis");
  });

  it("corrupt plugin on disk does not prevent valid plugins from loading", async () => {
    // Corrupt plugin
    const corruptDir = path.join(tmp, FOUNDATION_DIR, "plugins", "plugin-bad");
    await fs.mkdir(corruptDir, { recursive: true });
    await fs.writeFile(path.join(corruptDir, "manifest.json"), "CORRUPT");

    // Valid plugin
    await writePluginManifest(tmp, makeManifest("plugin-stripe"));

    const registry = new ModuleRegistry();
    const loaded = await loadPluginsFromProject(tmp, registry);

    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toBe("plugin-stripe");

    const resolution = resolveModules(["plugin-stripe"], registry);
    expect(resolution.ordered).toHaveLength(1);
  });
});
