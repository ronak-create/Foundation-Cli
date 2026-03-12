import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { randomUUID } from "node:crypto";
import {
  installPlugin,
  loadInstalledPlugins,
  pluginInstallDir,
  resolvePackageName,
  PluginAlreadyInstalledError,
  PluginManifestMissingError,
  // NotAFoundationProjectError,
} from "../plugin-installer/index.js";
import { ValidationError } from "../errors.js";
import {
  writeProjectState,
  readProjectState,
  FOUNDATION_DIR,
  LOCKFILE_NAME,
  // CONFIG_NAME,
} from "../state/project-state.js";
// import type { ModuleManifest } from "@foundation-cli/plugin-sdk";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function makeTmp(): Promise<string> {
  const dir = path.join(os.tmpdir(), `foundation-plugin-test-${randomUUID()}`);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function rmTmp(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}

async function readJson<T = Record<string, unknown>>(p: string): Promise<T> {
  return JSON.parse(await fs.readFile(p, "utf-8")) as T;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Creates a minimal local plugin directory that fetchPluginFromDirectory
 * can read, and returns its path prefixed with "file:" for installPlugin.
 */
async function makeLocalPlugin(
  baseDir: string,
  overrides: {
    manifest?: Partial<Record<string, unknown>>;
    packageJson?: Partial<Record<string, unknown>>;
  } = {},
): Promise<string> {
  const pluginDir = path.join(baseDir, `mock-plugin-${randomUUID()}`);
  await fs.mkdir(pluginDir, { recursive: true });

  const manifest: Record<string, unknown> = {
    id: "plugin-stripe",
    name: "Stripe Payments",
    version: "1.0.0",
    description: "Stripe payment integration for Foundation projects",
    category: "tooling",
    dependencies: [
      { name: "stripe", version: "^15.0.0", scope: "dependencies" },
    ],
    files: [
      {
        relativePath: "src/payments/stripe.ts",
        content:
          "import Stripe from 'stripe';\nexport const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);",
      },
    ],
    configPatches: [],
    compatibility: {},
    ...overrides.manifest,
  };

  const packageJson: Record<string, unknown> = {
    name: "foundation-plugin-stripe",
    version: "1.0.0",
    description: "Stripe plugin for Foundation CLI",
    main: "index.js",
    ...overrides.packageJson,
  };

  await fs.writeFile(
    path.join(pluginDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
  await fs.writeFile(
    path.join(pluginDir, "package.json"),
    JSON.stringify(packageJson, null, 2),
  );

  return `file:${pluginDir}`;
}

/**
 * Initialises a project root with a valid .foundation/ state
 * so installPlugin's project check passes.
 */
async function initProject(projectRoot: string): Promise<void> {
  await writeProjectState({
    projectRoot,
    orderedModules: [],
    packageManager: "npm",
    projectName: "test-project",
    selections: { backend: "express" },
    nowIso: "2026-01-01T00:00:00.000Z",
  });
}

// ── resolvePackageName ────────────────────────────────────────────────────────

describe("resolvePackageName", () => {
  it("prefixes short name with foundation-plugin-", () => {
    expect(resolvePackageName("stripe")).toBe("foundation-plugin-stripe");
  });

  it("leaves full name unchanged", () => {
    expect(resolvePackageName("foundation-plugin-stripe")).toBe(
      "foundation-plugin-stripe",
    );
  });

  it("leaves scoped name unchanged", () => {
    expect(resolvePackageName("@foundation/plugin-stripe")).toBe(
      "@foundation/plugin-stripe",
    );
  });

  it("prefixes 'redis' correctly", () => {
    expect(resolvePackageName("redis")).toBe("foundation-plugin-redis");
  });

  it("prefixes 'openai' correctly", () => {
    expect(resolvePackageName("openai")).toBe("foundation-plugin-openai");
  });
});

// ── pluginInstallDir ──────────────────────────────────────────────────────────

describe("pluginInstallDir", () => {
  it("returns correct path", () => {
    const result = pluginInstallDir("/project", "plugin-stripe");
    expect(result).toBe(
      path.join("/project", ".foundation", "plugins", "plugin-stripe"),
    );
  });
});

// ── NotAFoundationProjectError ────────────────────────────────────────────────

describe("installPlugin — duplicate guard", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await makeTmp();
    await initProject(tmp);
  });

  afterEach(async () => { await rmTmp(tmp); });

  it("throws PluginAlreadyInstalledError on second install of same plugin", async () => {
    // 🔥 CREATE FRESH PLUGIN FOR EACH CALL - don't reuse path
    const pluginPath1 = await makeLocalPlugin(tmp);
    await installPlugin({ projectRoot: tmp, pluginName: pluginPath1 });

    // Create NEW plugin with SAME manifest.id - simulates "same plugin"
    const pluginPath2 = await makeLocalPlugin(tmp, {
      manifest: { id: "plugin-stripe" },  // Same canonical ID
      packageJson: { name: "foundation-plugin-stripe" }
    });

    await expect(
      installPlugin({ projectRoot: tmp, pluginName: pluginPath2 })
    ).rejects.toThrow(PluginAlreadyInstalledError);
  });

  it("does not modify lockfile on duplicate install attempt", async () => {
    const pluginPath = await makeLocalPlugin(tmp);
    await installPlugin({ projectRoot: tmp, pluginName: pluginPath });

    try {
      const pluginPath2 = await makeLocalPlugin(tmp, {  // Fresh copy
        manifest: { id: "plugin-stripe" }
      });
      await installPlugin({ projectRoot: tmp, pluginName: pluginPath2 });
    } catch {
      // expected
    }

    const { lockfile } = await readProjectState(tmp);
    expect(lockfile!.plugins).toHaveLength(1);
  });
});

// ── Core install flow ─────────────────────────────────────────────────────────

describe("installPlugin — successful local install", () => {
  let tmp: string;
  let pluginPath: string;

  beforeEach(async () => {
    tmp = await makeTmp();
    await initProject(tmp);
    pluginPath = await makeLocalPlugin(tmp);
  });

  afterEach(async () => { await rmTmp(tmp); });

  it("returns a PluginInstallResult with correct pluginId", async () => {
    const result = await installPlugin({
      projectRoot: tmp,
      pluginName: pluginPath,
    });
    expect(result.pluginId).toBe("plugin-stripe");
  });

  it("returns resolvedVersion from package.json", async () => {
    const result = await installPlugin({
      projectRoot: tmp,
      pluginName: pluginPath,
    });
    expect(result.resolvedVersion).toBe("1.0.0");
  });

  it("creates .foundation/plugins/<pluginId>/ directory", async () => {
    await installPlugin({ projectRoot: tmp, pluginName: pluginPath });
    expect(
      await fileExists(
        path.join(tmp, FOUNDATION_DIR, "plugins", "plugin-stripe"),
      ),
    ).toBe(true);
  });

  it("writes manifest.json into plugin directory", async () => {
    await installPlugin({ projectRoot: tmp, pluginName: pluginPath });
    const manifestPath = path.join(
      tmp,
      FOUNDATION_DIR,
      "plugins",
      "plugin-stripe",
      "manifest.json",
    );
    expect(await fileExists(manifestPath)).toBe(true);

    const written = await readJson(manifestPath);
    expect(written["id"]).toBe("plugin-stripe");
    expect(written["version"]).toBe("1.0.0");
  });

  it("writes package.json into plugin directory", async () => {
    await installPlugin({ projectRoot: tmp, pluginName: pluginPath });
    const pkgPath = path.join(
      tmp,
      FOUNDATION_DIR,
      "plugins",
      "plugin-stripe",
      "package.json",
    );
    expect(await fileExists(pkgPath)).toBe(true);

    const pkg = await readJson(pkgPath);
    expect(pkg["name"]).toBe("foundation-plugin-stripe");
  });

  it("copies module files into plugins/<id>/files/", async () => {
    await installPlugin({ projectRoot: tmp, pluginName: pluginPath });
    const filePath = path.join(
      tmp,
      FOUNDATION_DIR,
      "plugins",
      "plugin-stripe",
      "files",
      "src",
      "payments",
      "stripe.ts",
    );
    expect(await fileExists(filePath)).toBe(true);
  });
});

// ── Lockfile update ───────────────────────────────────────────────────────────

describe("installPlugin — lockfile update", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await makeTmp();
    await initProject(tmp);
  });

  afterEach(async () => { await rmTmp(tmp); });

  it("adds plugin entry to project.lock", async () => {
    const pluginPath = await makeLocalPlugin(tmp);
    await installPlugin({ projectRoot: tmp, pluginName: pluginPath });

    const { lockfile } = await readProjectState(tmp);
    expect(lockfile).not.toBeNull();
    expect(lockfile!.plugins).toHaveLength(1);
    expect(lockfile!.plugins[0]?.id).toBe("plugin-stripe");
    expect(lockfile!.plugins[0]?.version).toBe("1.0.0");
  });

  it("plugin entry in lockfile has correct source package name", async () => {
    const pluginPath = await makeLocalPlugin(tmp);
    await installPlugin({ projectRoot: tmp, pluginName: pluginPath });

    const { lockfile } = await readProjectState(tmp);
    expect(lockfile!.plugins[0]?.source).toBe("foundation-plugin-stripe");
  });

  it("preserves existing modules in lockfile when adding plugin", async () => {
    // Re-init with some modules
    await writeProjectState({
      projectRoot: tmp,
      orderedModules: [
        {
          id: "backend-express",
          name: "Express",
          version: "1.0.0",
          description: "test",
          category: "backend",
          dependencies: [],
          files: [],
          configPatches: [],
          compatibility: {},
        },
      ],
      packageManager: "npm",
      projectName: "test-project",
      selections: {},
      nowIso: "2026-01-01T00:00:00.000Z",
    });

    const pluginPath = await makeLocalPlugin(tmp);
    await installPlugin({ projectRoot: tmp, pluginName: pluginPath });

    const { lockfile } = await readProjectState(tmp);
    const moduleIds = lockfile!.modules.map((m) => m.id);
    expect(moduleIds).toContain("backend-express");
    expect(lockfile!.plugins).toHaveLength(1);
  });

  it("lockfile key order remains deterministic after plugin add", async () => {
    const pluginPath = await makeLocalPlugin(tmp);
    await installPlugin({ projectRoot: tmp, pluginName: pluginPath });

    const raw = await fs.readFile(
      path.join(tmp, FOUNDATION_DIR, LOCKFILE_NAME),
      "utf-8",
    );
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const keys = Object.keys(parsed);
    expect(keys[0]).toBe("foundationCliVersion");
    expect(keys[1]).toBe("generatedAt");
    expect(keys[4]).toBe("plugins");
  });
});

// ── Config update ─────────────────────────────────────────────────────────────

describe("installPlugin — foundation.config.json update", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await makeTmp();
    await initProject(tmp);
  });

  afterEach(async () => { await rmTmp(tmp); });

  it("appends plugin id to plugins array in foundation.config.json", async () => {
    const pluginPath = await makeLocalPlugin(tmp);
    await installPlugin({ projectRoot: tmp, pluginName: pluginPath });

    const { config } = await readProjectState(tmp);
    expect(config).not.toBeNull();
    expect(config!.plugins).toContain("plugin-stripe");
  });

  it("foundation.config.json plugins array has one entry after single install", async () => {
    const pluginPath = await makeLocalPlugin(tmp);
    await installPlugin({ projectRoot: tmp, pluginName: pluginPath });

    const { config } = await readProjectState(tmp);
    expect(config!.plugins).toHaveLength(1);
  });

  it("two different plugins append two entries", async () => {
    const plugin1 = await makeLocalPlugin(tmp, {
      manifest: { id: "plugin-stripe", name: "Stripe" },
      packageJson: { name: "foundation-plugin-stripe" },
    });
    const plugin2 = await makeLocalPlugin(tmp, {
      manifest: { id: "plugin-redis", name: "Redis" },
      packageJson: { name: "foundation-plugin-redis" },
    });

    await installPlugin({ projectRoot: tmp, pluginName: plugin1 });
    await installPlugin({ projectRoot: tmp, pluginName: plugin2 });

    const { config } = await readProjectState(tmp);
    expect(config!.plugins).toHaveLength(2);
    expect(config!.plugins).toContain("plugin-stripe");
    expect(config!.plugins).toContain("plugin-redis");
  });
});

// ── Duplicate install guard ───────────────────────────────────────────────────

describe("installPlugin — duplicate guard", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await makeTmp();
    await initProject(tmp);
  });

  afterEach(async () => { await rmTmp(tmp); });

  it("throws PluginAlreadyInstalledError on second install of same plugin", async () => {
    const pluginPath = await makeLocalPlugin(tmp);
    await installPlugin({ projectRoot: tmp, pluginName: pluginPath });

    await expect(
      installPlugin({ projectRoot: tmp, pluginName: pluginPath }),
    ).rejects.toThrow(PluginAlreadyInstalledError);
  });

  it("does not modify lockfile on duplicate install attempt", async () => {
    const pluginPath = await makeLocalPlugin(tmp);
    await installPlugin({ projectRoot: tmp, pluginName: pluginPath });

    try {
      await installPlugin({ projectRoot: tmp, pluginName: pluginPath });
    } catch {
      // expected
    }

    const { lockfile } = await readProjectState(tmp);
    expect(lockfile!.plugins).toHaveLength(1);
  });
});

// ── Manifest validation ───────────────────────────────────────────────────────

describe("installPlugin — manifest validation", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await makeTmp();
    await initProject(tmp);
  });

  afterEach(async () => { await rmTmp(tmp); });

  it("throws ValidationError for manifest with invalid version", async () => {
    const pluginPath = await makeLocalPlugin(tmp, {
      manifest: { version: "v1-bad" },
    });

    await expect(
      installPlugin({ projectRoot: tmp, pluginName: pluginPath }),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError for manifest with invalid id (uppercase)", async () => {
    const pluginPath = await makeLocalPlugin(tmp, {
      manifest: { id: "PLUGIN_STRIPE" },
    });

    await expect(
      installPlugin({ projectRoot: tmp, pluginName: pluginPath }),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError for manifest with invalid runtime", async () => {
    const pluginPath = await makeLocalPlugin(tmp, {
      manifest: { runtime: "deno" },
    });

    await expect(
      installPlugin({ projectRoot: tmp, pluginName: pluginPath }),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError for manifest with malformed dependencies", async () => {
    const pluginPath = await makeLocalPlugin(tmp, {
      manifest: {
        dependencies: [
          { name: "stripe" }, // missing version and scope
        ],
      },
    });

    await expect(
      installPlugin({ projectRoot: tmp, pluginName: pluginPath }),
    ).rejects.toThrow(ValidationError);
  });

  it("ValidationError carries field-level details", async () => {
    const pluginPath = await makeLocalPlugin(tmp, {
      manifest: { version: "not-semver", runtime: "ruby" },
    });

    try {
      await installPlugin({ projectRoot: tmp, pluginName: pluginPath });
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      const ve = err as ValidationError;
      expect(ve.fieldErrors.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("throws PluginManifestMissingError when manifest.json absent", async () => {
    const dir = path.join(tmp, `no-manifest-${randomUUID()}`);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ name: "foundation-plugin-no-manifest", version: "1.0.0" }),
    );

    await expect(
      installPlugin({ projectRoot: tmp, pluginName: `file:${dir}` }),
    ).rejects.toThrow(PluginManifestMissingError);
  });

  it("does not write any files when manifest is invalid", async () => {
    const pluginPath = await makeLocalPlugin(tmp, {
      manifest: { id: "INVALID", version: "bad" },
    });

    try {
      await installPlugin({ projectRoot: tmp, pluginName: pluginPath });
    } catch {
      // expected
    }

    const pluginsDir = path.join(tmp, FOUNDATION_DIR, "plugins");
    const exists = await fileExists(pluginsDir);
    if (exists) {
      const entries = await fs.readdir(pluginsDir);
      expect(entries).toHaveLength(0);
    } else {
      expect(exists).toBe(false);
    }
  });
});

// ── loadInstalledPlugins ──────────────────────────────────────────────────────

describe("loadInstalledPlugins", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await makeTmp();
    await initProject(tmp);
  });

  afterEach(async () => { await rmTmp(tmp); });

  it("returns empty array when no plugins installed", async () => {
    const plugins = await loadInstalledPlugins(tmp);
    expect(plugins).toHaveLength(0);
  });

  it("returns installed plugin manifest after install", async () => {
    const pluginPath = await makeLocalPlugin(tmp);
    await installPlugin({ projectRoot: tmp, pluginName: pluginPath });

    const plugins = await loadInstalledPlugins(tmp);
    expect(plugins).toHaveLength(1);
    expect(plugins[0]?.manifest.id).toBe("plugin-stripe");
  });

  it("returns correct package name alongside manifest", async () => {
    const pluginPath = await makeLocalPlugin(tmp);
    await installPlugin({ projectRoot: tmp, pluginName: pluginPath });

    const plugins = await loadInstalledPlugins(tmp);
    expect(plugins[0]?.packageName).toBe("foundation-plugin-stripe");
  });

  it("returns multiple plugins when multiple installed", async () => {
    const p1 = await makeLocalPlugin(tmp, {
      manifest: { id: "plugin-stripe", name: "Stripe" },
      packageJson: { name: "foundation-plugin-stripe" },
    });
    const p2 = await makeLocalPlugin(tmp, {
      manifest: { id: "plugin-redis", name: "Redis" },
      packageJson: { name: "foundation-plugin-redis" },
    });

    await installPlugin({ projectRoot: tmp, pluginName: p1 });
    await installPlugin({ projectRoot: tmp, pluginName: p2 });

    const plugins = await loadInstalledPlugins(tmp);
    expect(plugins).toHaveLength(2);

    const ids = plugins.map((p: { manifest: { id: string } }) => p.manifest.id);
    expect(ids).toContain("plugin-stripe");
    expect(ids).toContain("plugin-redis");
  });

  it("silently skips a corrupted plugin directory", async () => {
    // Create a corrupt plugin dir with invalid manifest.json
    const corruptDir = path.join(
      tmp,
      FOUNDATION_DIR,
      "plugins",
      "plugin-corrupt",
    );
    await fs.mkdir(corruptDir, { recursive: true });
    await fs.writeFile(
      path.join(corruptDir, "manifest.json"),
      "{ not valid json",
    );

    // Install a valid one alongside
    const pluginPath = await makeLocalPlugin(tmp);
    await installPlugin({ projectRoot: tmp, pluginName: pluginPath });

    const plugins = await loadInstalledPlugins(tmp);
    // Only the valid one is returned
    expect(plugins).toHaveLength(1);
    expect(plugins[0]?.manifest.id).toBe("plugin-stripe");
  });

  it("loaded manifests pass ManifestValidator", async () => {
    const { ManifestValidator } = await import(
      "../manifest-validator/validator.js"
    );

    const pluginPath = await makeLocalPlugin(tmp);
    await installPlugin({ projectRoot: tmp, pluginName: pluginPath });

    const plugins = await loadInstalledPlugins(tmp);
    for (const { manifest } of plugins) {
      expect(() => ManifestValidator.assert(manifest)).not.toThrow();
    }
  });

  it("hooks are NOT present on loaded plugin definitions (Phase 3 safety)", async () => {
    const pluginPath = await makeLocalPlugin(tmp);
    await installPlugin({ projectRoot: tmp, pluginName: pluginPath });

    const plugins = await loadInstalledPlugins(tmp);
    // loadInstalledPlugins returns { manifest, packageName } — no hooks property
    for (const plugin of plugins) {
      expect((plugin as unknown as Record<string, unknown>)["hooks"]).toBeUndefined();
    }
  });
});

// ── onProgress events ─────────────────────────────────────────────────────────

describe("installPlugin — progress events", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await makeTmp();
    await initProject(tmp);
  });

  afterEach(async () => { await rmTmp(tmp); });

  it("emits progress messages during install", async () => {
    const messages: string[] = [];
    const pluginPath = await makeLocalPlugin(tmp);

    await installPlugin({
      projectRoot: tmp,
      pluginName: pluginPath,
      onProgress: (msg) => messages.push(msg),
    });

    expect(messages.length).toBeGreaterThan(0);
    expect(messages.some((m) => m.toLowerCase().includes("manifest"))).toBe(true);
    expect(messages.some((m) => m.toLowerCase().includes("installed"))).toBe(true);
  });
});