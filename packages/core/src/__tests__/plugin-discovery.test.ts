/**
 * Phase 4 Stage 3 — Plugin discovery test suite
 *
 * Tests:
 *   - loadInstalledPlugins  reads manifests + sandboxedHooks from disk
 *   - registerInstalledPlugins  populates ModuleRegistry correctly
 *   - Sandbox constraint: no live hook functions stored on the registry entry
 *   - Idempotency: re-registering already-present plugins is a no-op
 *   - Corrupt / missing manifest is silently skipped
 *   - hooks.json is optional; absent hooks.json → sandboxedHooks = {}
 *   - Plugin source is "plugin" (not "builtin") in the registry
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";

import { ModuleRegistry, ManifestValidator } from "@foundation-cli/core";
import {
  loadInstalledPlugins,
  registerInstalledPlugins,
} from "@foundation-cli/core";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function makeTmp(): Promise<string> {
  const dir = path.join(os.tmpdir(), `foundation-p4s3-${randomUUID()}`);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function rmTmp(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}

/** Writes a valid plugin directory under `projectRoot/.foundation/plugins/`. */
async function writePlugin(
  projectRoot: string,
  pluginId: string,
  opts: {
    packageName?: string;
    version?: string;
    hooks?: Record<string, string>;
    manifestOverrides?: Record<string, unknown>;
    corruptManifest?: boolean;
  } = {},
): Promise<string> {
  const pluginDir = path.join(
    projectRoot,
    ".foundation",
    "plugins",
    pluginId,
  );
  await fs.mkdir(pluginDir, { recursive: true });

  if (opts.corruptManifest) {
    await fs.writeFile(
      path.join(pluginDir, "manifest.json"),
      "{ not valid json",
      "utf-8",
    );
    return pluginDir;
  }

  const manifest = {
    id:            pluginId,
    name:          opts.manifestOverrides?.["name"] ?? `Plugin ${pluginId}`,
    version:       opts.version ?? "1.0.0",
    description:   "A test plugin",
    category:      "tooling",
    runtime:       "node",
    dependencies:  [],
    files:         [],
    configPatches: [],
    compatibility: {},
    ...opts.manifestOverrides,
  };
  await fs.writeFile(
    path.join(pluginDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf-8",
  );

  const pkgJson = { name: opts.packageName ?? `foundation-plugin-${pluginId}`, version: opts.version ?? "1.0.0" };
  await fs.writeFile(
    path.join(pluginDir, "package.json"),
    JSON.stringify(pkgJson, null, 2),
    "utf-8",
  );

  if (opts.hooks) {
    await fs.writeFile(
      path.join(pluginDir, "hooks.json"),
      JSON.stringify(opts.hooks, null, 2),
      "utf-8",
    );
  }

  return pluginDir;
}

// ── loadInstalledPlugins ──────────────────────────────────────────────────────

describe("loadInstalledPlugins", () => {
  let tmp: string;
  beforeEach(async () => { tmp = await makeTmp(); });
  afterEach(async ()  => { await rmTmp(tmp); });

  it("returns [] when .foundation/plugins/ does not exist", async () => {
    const result = await loadInstalledPlugins(tmp);
    expect(result).toEqual([]);
  });

  it("returns [] when plugins dir is empty", async () => {
    await fs.mkdir(path.join(tmp, ".foundation", "plugins"), { recursive: true });
    const result = await loadInstalledPlugins(tmp);
    expect(result).toEqual([]);
  });

  it("loads a single plugin", async () => {
    await writePlugin(tmp, "plugin-alpha");
    const result = await loadInstalledPlugins(tmp);
    expect(result).toHaveLength(1);
    expect(result[0]!.manifest.id).toBe("plugin-alpha");
  });

  it("loads multiple plugins", async () => {
    await writePlugin(tmp, "plugin-one");
    await writePlugin(tmp, "plugin-two");
    await writePlugin(tmp, "plugin-three");
    const result = await loadInstalledPlugins(tmp);
    expect(result).toHaveLength(3);
    const ids = result.map((p) => p.manifest.id).sort();
    expect(ids).toEqual(["plugin-one", "plugin-three", "plugin-two"]);
  });

  it("reads packageName from package.json 'name' field", async () => {
    await writePlugin(tmp, "pkg-name-test", {
      packageName: "foundation-plugin-custom-name",
    });
    const result = await loadInstalledPlugins(tmp);
    expect(result[0]!.packageName).toBe("foundation-plugin-custom-name");
  });

  it("falls back to dir name when package.json is absent", async () => {
    await writePlugin(tmp, "no-pkg-json");
    // Remove package.json
    await fs.rm(
      path.join(tmp, ".foundation", "plugins", "no-pkg-json", "package.json"),
    );
    const result = await loadInstalledPlugins(tmp);
    expect(result[0]!.packageName).toBe("no-pkg-json");
  });

  it("reads sandboxedHooks from hooks.json", async () => {
    await writePlugin(tmp, "hooked-plugin", {
      hooks: {
        afterWrite: "console.log('after-write ran')",
        beforeInstall: "console.log('before-install ran')",
      },
    });
    const result = await loadInstalledPlugins(tmp);
    expect(result[0]!.sandboxedHooks).toEqual({
      afterWrite:    "console.log('after-write ran')",
      beforeInstall: "console.log('before-install ran')",
    });
  });

  it("returns empty sandboxedHooks when hooks.json is absent", async () => {
    await writePlugin(tmp, "no-hooks-plugin");
    const result = await loadInstalledPlugins(tmp);
    expect(result[0]!.sandboxedHooks).toEqual({});
  });

  it("skips a plugin with corrupt manifest.json", async () => {
    await writePlugin(tmp, "good-plugin");
    await writePlugin(tmp, "corrupt-plugin", { corruptManifest: true });
    const result = await loadInstalledPlugins(tmp);
    expect(result).toHaveLength(1);
    expect(result[0]!.manifest.id).toBe("good-plugin");
  });

  it("skips a plugin with invalid manifest (fails ManifestValidator)", async () => {
    await writePlugin(tmp, "invalid-manifest-plugin", {
      manifestOverrides: {
        id: "INVALID ID with spaces", // kebab-case required
      },
    });
    const result = await loadInstalledPlugins(tmp);
    expect(result).toHaveLength(0);
  });

  it("all returned manifests pass ManifestValidator", async () => {
    await writePlugin(tmp, "valid-a", { version: "1.2.3" });
    await writePlugin(tmp, "valid-b", { version: "2.0.0" });
    const result = await loadInstalledPlugins(tmp);
    for (const { manifest } of result) {
      expect(ManifestValidator.validate(manifest).valid).toBe(true);
    }
  });

  it("sandboxedHooks values are strings, never functions", async () => {
    await writePlugin(tmp, "string-hooks-plugin", {
      hooks: { afterWrite: "module.exports = async () => { /* hook */ }" },
    });
    const result = await loadInstalledPlugins(tmp);
    const hooks = result[0]!.sandboxedHooks;
    for (const value of Object.values(hooks)) {
      expect(typeof value).toBe("string");
    }
  });
});

// ── registerInstalledPlugins ──────────────────────────────────────────────────

describe("registerInstalledPlugins", () => {
  let tmp: string;
  beforeEach(async () => { tmp = await makeTmp(); });
  afterEach(async ()  => { await rmTmp(tmp); });

  it("returns [] when no plugins are installed", async () => {
    const registry = new ModuleRegistry();
    const registered = await registerInstalledPlugins(tmp, registry);
    expect(registered).toEqual([]);
    expect(registry.size).toBe(0);
  });

  it("registers a single plugin and returns its ID", async () => {
    await writePlugin(tmp, "reg-alpha");
    const registry = new ModuleRegistry();
    const registered = await registerInstalledPlugins(tmp, registry);
    expect(registered).toContain("reg-alpha");
    expect(registry.hasModule("reg-alpha")).toBe(true);
  });

  it("registers multiple plugins", async () => {
    await writePlugin(tmp, "reg-one");
    await writePlugin(tmp, "reg-two");
    const registry = new ModuleRegistry();
    const registered = await registerInstalledPlugins(tmp, registry);
    expect(registered).toHaveLength(2);
    expect(registry.hasModule("reg-one")).toBe(true);
    expect(registry.hasModule("reg-two")).toBe(true);
  });

  it("source is 'plugin' (not 'builtin') for every registered plugin", async () => {
    await writePlugin(tmp, "src-test-plugin");
    const registry = new ModuleRegistry();
    await registerInstalledPlugins(tmp, registry);
    expect(registry.getSource("src-test-plugin")).toBe("plugin");
  });

  it("is idempotent — calling twice does not throw", async () => {
    await writePlugin(tmp, "idem-plugin");
    const registry = new ModuleRegistry();
    const r1 = await registerInstalledPlugins(tmp, registry);
    const r2 = await registerInstalledPlugins(tmp, registry);
    expect(r1).toHaveLength(1);
    expect(r2).toHaveLength(0);   // already registered — skipped
    expect(registry.size).toBe(1);
  });

  it("skips plugins already in registry without throwing", async () => {
    await writePlugin(tmp, "pre-existing");
    const registry = new ModuleRegistry();
    // Pre-register it manually
    await registerInstalledPlugins(tmp, registry);
    // Second call should not increase size
    await expect(
      registerInstalledPlugins(tmp, registry),
    ).resolves.not.toThrow();
    expect(registry.size).toBe(1);
  });

  it("coexists with builtin modules in the same registry", async () => {
    await writePlugin(tmp, "coexist-plugin");
    const registry = new ModuleRegistry();
    // Simulate a builtin registered via registerModule
    registry.registerModule({
      manifest: {
        id: "builtin-fake",
        name: "Fake Builtin",
        version: "1.0.0",
        description: "fake",
        category: "tooling",
        dependencies: [],
        files: [],
        configPatches: [],
        compatibility: {},
      },
    });
    await registerInstalledPlugins(tmp, registry);
    expect(registry.hasModule("builtin-fake")).toBe(true);
    expect(registry.hasModule("coexist-plugin")).toBe(true);
    expect(registry.getSource("builtin-fake")).toBe("builtin");
    expect(registry.getSource("coexist-plugin")).toBe("plugin");
  });

  // ── SANDBOX CONSTRAINT TESTS ────────────────────────────────────────────────

  it("SANDBOX: does not store live hook functions on the registry entry", async () => {
    await writePlugin(tmp, "sandbox-test-plugin", {
      hooks: { afterWrite: "console.log('hook')" },
    });
    const registry = new ModuleRegistry();
    await registerInstalledPlugins(tmp, registry);

    const pluginDef = registry.getModule("sandbox-test-plugin");
    // hooks property must be absent — only sandboxedHooks source strings allowed
    expect(pluginDef.hooks).toBeUndefined();
  });

  it("SANDBOX: sandboxedHooks source strings are preserved on registry entry", async () => {
    const hookSrc = "module.exports = async (ctx) => { ctx.log('ran'); }";
    await writePlugin(tmp, "sandbox-hooks-plugin", {
      hooks: { afterWrite: hookSrc },
    });
    const registry = new ModuleRegistry();
    await registerInstalledPlugins(tmp, registry);

    // The registry stores the entry as a PluginDefinition extended with
    // sandboxedHooks. Cast through unknown to access the extended field.
    const entry = registry.getModule("sandbox-hooks-plugin") as unknown as {
      sandboxedHooks?: Record<string, string>;
    };
    expect(entry.sandboxedHooks?.["afterWrite"]).toBe(hookSrc);
  });

  it("SANDBOX: plugins with no hooks.json have no sandboxedHooks on registry entry", async () => {
    await writePlugin(tmp, "no-hooks-sandbox");
    const registry = new ModuleRegistry();
    await registerInstalledPlugins(tmp, registry);

    const entry = registry.getModule("no-hooks-sandbox") as unknown as {
      sandboxedHooks?: Record<string, string>;
    };
    // Either absent or empty — either way no hook strings
    const hookCount = Object.keys(entry.sandboxedHooks ?? {}).length;
    expect(hookCount).toBe(0);
  });

  it("SANDBOX: all registered plugin manifests pass ManifestValidator", async () => {
    await writePlugin(tmp, "manifest-valid-a", { version: "1.0.0" });
    await writePlugin(tmp, "manifest-valid-b", { version: "2.3.4" });
    const registry = new ModuleRegistry();
    await registerInstalledPlugins(tmp, registry);
    for (const manifest of registry.listPlugins()) {
      expect(ManifestValidator.validate(manifest).valid).toBe(true);
    }
  });

  it("SANDBOX: corrupt plugin is skipped, valid plugins still registered", async () => {
    await writePlugin(tmp, "corrupt-skip", { corruptManifest: true });
    await writePlugin(tmp, "valid-after-corrupt");
    const registry = new ModuleRegistry();
    const registered = await registerInstalledPlugins(tmp, registry);
    expect(registered).toContain("valid-after-corrupt");
    expect(registered).not.toContain("corrupt-skip");
  });
});

// ── Integration: loadInstalledPlugins + registerInstalledPlugins ──────────────

describe("integration: load then register", () => {
  let tmp: string;
  beforeEach(async () => { tmp = await makeTmp(); });
  afterEach(async ()  => { await rmTmp(tmp); });

  it("round-trips: loaded plugins match registered plugins", async () => {
    await writePlugin(tmp, "round-trip-a", {
      packageName: "foundation-plugin-a",
      hooks: { afterWrite: "// hook a" },
    });
    await writePlugin(tmp, "round-trip-b", {
      packageName: "foundation-plugin-b",
    });

    const loaded   = await loadInstalledPlugins(tmp);
    const registry = new ModuleRegistry();
    const registered = await registerInstalledPlugins(tmp, registry);

    expect(loaded.map((p) => p.manifest.id).sort()).toEqual(registered.sort());
  });

  it("registry listPlugins() shows all registered plugins", async () => {
    await writePlugin(tmp, "list-a");
    await writePlugin(tmp, "list-b");
    const registry = new ModuleRegistry();
    await registerInstalledPlugins(tmp, registry);
    const pluginIds = registry.listPlugins().map((m) => m.id).sort();
    expect(pluginIds).toEqual(["list-a", "list-b"]);
  });

  it("registry listBuiltins() does not include plugins", async () => {
    await writePlugin(tmp, "not-a-builtin");
    const registry = new ModuleRegistry();
    await registerInstalledPlugins(tmp, registry);
    expect(registry.listBuiltins()).toHaveLength(0);
  });
});