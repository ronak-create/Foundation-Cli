import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { randomUUID } from "node:crypto";

import { ManifestValidator } from "@systemlabs/foundation-core";
import { ModuleRegistry, resolveModules, buildCompositionPlan } from "@systemlabs/foundation-core";
import {
  writeProjectState,
  readProjectState,
  FOUNDATION_DIR,
} from "@systemlabs/foundation-core";
import {
  installPlugin,
  loadPluginsFromProject,
} from "@systemlabs/foundation-core";

import {
  stripePlugin,
  redisPlugin,
  openaiPlugin,
  loadAddonPlugins,
  STRIPE_AFTER_WRITE_HOOK,
  REDIS_AFTER_WRITE_HOOK,
  OPENAI_AFTER_WRITE_HOOK,
} from "../addon/index.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function makeTmp(): Promise<string> {
  const dir = path.join(os.tmpdir(), `addon-plugin-test-${randomUUID()}`);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function rmTmp(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}

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

/**
 * Creates a local plugin directory that fetchPluginFromDirectory can read.
 * Writes both manifest.json and hooks.json from the TypeScript definitions.
 */
async function writeLocalPlugin(
  baseDir: string,
  plugin: typeof stripePlugin,
  hookSource: string,
  hookName: "afterWrite" | "afterInstall" | "beforeWrite" | "beforeInstall" = "afterWrite",
): Promise<string> {
  const pluginDir = path.join(baseDir, `plugin-src-${randomUUID()}`);
  await fs.mkdir(pluginDir, { recursive: true });

  // Write manifest.json (without content — content lives in TS source)
  const manifestForDisk = {
    ...plugin.manifest,
    files: plugin.manifest.files.map((f) => ({
      ...f,
      content: f.content, // keep real content for installation test
    })),
  };
  await fs.writeFile(
    path.join(pluginDir, "manifest.json"),
    JSON.stringify(manifestForDisk, null, 2),
  );

  // Write package.json
  await fs.writeFile(
    path.join(pluginDir, "package.json"),
    JSON.stringify({
      name: `foundation-plugin-${plugin.manifest.id.replace("plugin-", "")}`,
      version: plugin.manifest.version,
      description: plugin.manifest.description,
    }),
  );

  // Write hooks.json (sandboxed hook source map)
  await fs.writeFile(
    path.join(pluginDir, "hooks.json"),
    JSON.stringify({ [hookName]: hookSource }),
  );

  return `file:${pluginDir}`;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

// ── ManifestValidator — all three addons ──────────────────────────────────────

describe("addon plugins — manifest validation", () => {
  it("stripe manifest passes ManifestValidator", () => {
    expect(() =>
      ManifestValidator.assert(stripePlugin.manifest),
    ).not.toThrow();
  });

  it("redis manifest passes ManifestValidator", () => {
    expect(() =>
      ManifestValidator.assert(redisPlugin.manifest),
    ).not.toThrow();
  });

  it("openai manifest passes ManifestValidator", () => {
    expect(() =>
      ManifestValidator.assert(openaiPlugin.manifest),
    ).not.toThrow();
  });

  it("stripe has valid semver version", () => {
    expect(stripePlugin.manifest.version).toMatch(
      /^\d+\.\d+\.\d+/,
    );
  });

  it("redis has valid semver version", () => {
    expect(redisPlugin.manifest.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("openai has valid semver version", () => {
    expect(openaiPlugin.manifest.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("all three have unique IDs", () => {
    const ids = [
      stripePlugin.manifest.id,
      redisPlugin.manifest.id,
      openaiPlugin.manifest.id,
    ];
    expect(new Set(ids).size).toBe(3);
  });

  it("all three have runtime: node", () => {
    expect(stripePlugin.manifest.runtime).toBe("node");
    expect(redisPlugin.manifest.runtime).toBe("node");
    expect(openaiPlugin.manifest.runtime).toBe("node");
  });

  it("stripe manifest has required dependency: stripe", () => {
    const dep = stripePlugin.manifest.dependencies.find(
      (d) => d.name === "stripe",
    );
    expect(dep).toBeDefined();
    expect(dep?.scope).toBe("dependencies");
  });

  it("redis manifest has required dependency: redis", () => {
    const dep = redisPlugin.manifest.dependencies.find(
      (d) => d.name === "redis",
    );
    expect(dep).toBeDefined();
  });

  it("openai manifest has required dependency: openai", () => {
    const dep = openaiPlugin.manifest.dependencies.find(
      (d) => d.name === "openai",
    );
    expect(dep).toBeDefined();
  });

  it("stripe has .env.example configPatch with STRIPE_SECRET_KEY", () => {
    const patch = stripePlugin.manifest.configPatches.find(
      (p) => p.targetFile === ".env.example",
    );
    expect(patch).toBeDefined();
    expect(
      (patch?.merge as Record<string, unknown>)["STRIPE_SECRET_KEY"],
    ).toBeDefined();
  });

  it("redis has .env.example configPatch with REDIS_URL", () => {
    const patch = redisPlugin.manifest.configPatches.find(
      (p) => p.targetFile === ".env.example",
    );
    expect(patch).toBeDefined();
    expect(
      (patch?.merge as Record<string, unknown>)["REDIS_URL"],
    ).toBeDefined();
  });

  it("openai has .env.example configPatch with OPENAI_API_KEY", () => {
    const patch = openaiPlugin.manifest.configPatches.find(
      (p) => p.targetFile === ".env.example",
    );
    expect(patch).toBeDefined();
    expect(
      (patch?.merge as Record<string, unknown>)["OPENAI_API_KEY"],
    ).toBeDefined();
  });
});

// ── File templates ─────────────────────────────────────────────────────────────

describe("addon plugins — file templates", () => {
  it("stripe contributes 3 TypeScript files", () => {
    expect(stripePlugin.manifest.files).toHaveLength(3);
  });

  it("stripe files have non-empty content", () => {
    for (const f of stripePlugin.manifest.files) {
      expect(f.content.trim().length).toBeGreaterThan(0);
    }
  });

  it("stripe has src/payments/stripe.ts", () => {
    const file = stripePlugin.manifest.files.find(
      (f) => f.relativePath === "src/payments/stripe.ts",
    );
    expect(file).toBeDefined();
    expect(file?.content).toContain("stripe");
  });

  it("stripe webhook file contains stripeWebhookHandler export", () => {
    const file = stripePlugin.manifest.files.find(
      (f) => f.relativePath === "src/payments/stripe-webhooks.ts",
    );
    expect(file?.content).toContain("stripeWebhookHandler");
  });

  it("redis contributes 3 TypeScript files", () => {
    expect(redisPlugin.manifest.files).toHaveLength(3);
  });

  it("redis client file contains getRedisClient export", () => {
    const file = redisPlugin.manifest.files.find(
      (f) => f.relativePath === "src/cache/redis-client.ts",
    );
    expect(file?.content).toContain("getRedisClient");
  });

  it("redis cache file contains cacheGet and cacheSet exports", () => {
    const file = redisPlugin.manifest.files.find(
      (f) => f.relativePath === "src/cache/redis-cache.ts",
    );
    expect(file?.content).toContain("cacheGet");
    expect(file?.content).toContain("cacheSet");
  });

  it("openai contributes 3 TypeScript files", () => {
    expect(openaiPlugin.manifest.files).toHaveLength(3);
  });

  it("openai client file contains chat and streamChat exports", () => {
    const file = openaiPlugin.manifest.files.find(
      (f) => f.relativePath === "src/ai/openai-client.ts",
    );
    expect(file?.content).toContain("chat");
    expect(file?.content).toContain("streamChat");
  });

  it("openai embeddings file contains cosineSimilarity", () => {
    const file = openaiPlugin.manifest.files.find(
      (f) => f.relativePath === "src/ai/openai-embeddings.ts",
    );
    expect(file?.content).toContain("cosineSimilarity");
  });

  it("openai moderation file contains assertSafe", () => {
    const file = openaiPlugin.manifest.files.find(
      (f) => f.relativePath === "src/ai/openai-moderation.ts",
    );
    expect(file?.content).toContain("assertSafe");
  });
});

// ── Hook sources ──────────────────────────────────────────────────────────────

describe("addon plugins — hook sources", () => {
  it("stripe hook source is non-empty", () => {
    expect(STRIPE_AFTER_WRITE_HOOK.trim().length).toBeGreaterThan(0);
  });

  it("redis hook source is non-empty", () => {
    expect(REDIS_AFTER_WRITE_HOOK.trim().length).toBeGreaterThan(0);
  });

  it("openai hook source is non-empty", () => {
    expect(OPENAI_AFTER_WRITE_HOOK.trim().length).toBeGreaterThan(0);
  });

  it("stripe hook source evaluates to a function in a safe context", async () => {
    const { executeSandboxedHook } = await import("@systemlabs/foundation-core");
    const ctx = {
      projectRoot: "/tmp",
      config: {},
      selectedModules: ["plugin-stripe"],
    };
    await expect(
      executeSandboxedHook("plugin-stripe", STRIPE_AFTER_WRITE_HOOK, ctx),
    ).resolves.toBeUndefined();
  });

  it("redis hook source executes without error in sandbox", async () => {
    const { executeSandboxedHook } = await import("@systemlabs/foundation-core");
    const ctx = {
      projectRoot: "/tmp",
      config: {},
      selectedModules: ["plugin-redis"],
    };
    await expect(
      executeSandboxedHook("plugin-redis", REDIS_AFTER_WRITE_HOOK, ctx),
    ).resolves.toBeUndefined();
  });

  it("openai hook source executes without error in sandbox", async () => {
    const { executeSandboxedHook } = await import("@systemlabs/foundation-core");
    const ctx = {
      projectRoot: "/tmp",
      config: {},
      selectedModules: ["plugin-openai"],
    };
    await expect(
      executeSandboxedHook("plugin-openai", OPENAI_AFTER_WRITE_HOOK, ctx),
    ).resolves.toBeUndefined();
  });

  it("hook sources do not use require('fs') — would throw in sandbox", async () => {
    // Verify none of the hooks attempt to access blocked modules
    for (const [source] of [
      ["stripe", STRIPE_AFTER_WRITE_HOOK],
      ["redis", REDIS_AFTER_WRITE_HOOK],
      ["openai", OPENAI_AFTER_WRITE_HOOK],
    ]) {
      expect(source).not.toContain("require('fs')");
      expect(source).not.toContain('require("fs")');
      expect(source).not.toContain("require('net')");
      expect(source).not.toContain("require('child_process')");
    }
  });
});

// ── loadAddonPlugins ──────────────────────────────────────────────────────────

describe("loadAddonPlugins", () => {
  it("registers all three plugins into registry", () => {
    const registry = new ModuleRegistry();
    loadAddonPlugins(registry);
    expect(registry.hasModule("plugin-stripe")).toBe(true);
    expect(registry.hasModule("plugin-redis")).toBe(true);
    expect(registry.hasModule("plugin-openai")).toBe(true);
  });

  it("registers them as plugin source (not builtin)", () => {
    const registry = new ModuleRegistry();
    loadAddonPlugins(registry);
    expect(registry.getSource("plugin-stripe")).toBe("plugin");
    expect(registry.getSource("plugin-redis")).toBe("plugin");
    expect(registry.getSource("plugin-openai")).toBe("plugin");
  });

  it("is idempotent — calling twice does not throw", () => {
    const registry = new ModuleRegistry();
    loadAddonPlugins(registry);
    expect(() => loadAddonPlugins(registry)).not.toThrow();
    expect(registry.listPlugins()).toHaveLength(3);
  });

  it("sandboxedHooks are attached after registration", () => {
    const registry = new ModuleRegistry();
    loadAddonPlugins(registry);

    // Retrieve and verify hook sources are accessible via getModule
    const stripe = registry.getModule("plugin-stripe") as typeof stripePlugin & {
      sandboxedHooks?: Record<string, string>;
    };
    expect(stripe.sandboxedHooks?.["afterWrite"]).toBeDefined();
    expect(stripe.sandboxedHooks?.["afterWrite"]).toContain("Stripe");
  });

  it("plugins do not conflict with each other", () => {
    const registry = new ModuleRegistry();
    loadAddonPlugins(registry);

    expect(() =>
      resolveModules(
        ["plugin-stripe", "plugin-redis", "plugin-openai"],
        registry,
      ),
    ).not.toThrow();
  });

  it("all three plugins can be composed into a single plan", () => {
    const registry = new ModuleRegistry();
    loadAddonPlugins(registry);

    const resolution = resolveModules(
      ["plugin-stripe", "plugin-redis", "plugin-openai"],
      registry,
    );
    const plan = buildCompositionPlan(resolution.ordered);

    expect(plan.files.length).toBe(9); // 3 + 3 + 3
    expect(plan.dependencies.length).toBeGreaterThanOrEqual(3);
    expect(plan.configPatches.length).toBe(3); // one .env.example patch each
  });
});

// ── installPlugin integration — stripe ────────────────────────────────────────

describe("installPlugin — stripe", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await makeTmp();
    await initProject(tmp);
  });

  afterEach(async () => { await rmTmp(tmp); });

  it("installs stripe plugin successfully", async () => {
    const localPath = await writeLocalPlugin(
      tmp,
      stripePlugin,
      STRIPE_AFTER_WRITE_HOOK,
    );

    const result = await installPlugin({ projectRoot: tmp, pluginName: localPath });
    expect(result.pluginId).toBe("plugin-stripe");
  });

  it("plugin-stripe directory is created", async () => {
    const localPath = await writeLocalPlugin(
      tmp,
      stripePlugin,
      STRIPE_AFTER_WRITE_HOOK,
    );
    await installPlugin({ projectRoot: tmp, pluginName: localPath });

    expect(
      await fileExists(
        path.join(tmp, FOUNDATION_DIR, "plugins", "plugin-stripe"),
      ),
    ).toBe(true);
  });

  it("manifest.json is written to plugin-stripe dir", async () => {
    const localPath = await writeLocalPlugin(
      tmp,
      stripePlugin,
      STRIPE_AFTER_WRITE_HOOK,
    );
    await installPlugin({ projectRoot: tmp, pluginName: localPath });

    const manifestPath = path.join(
      tmp, FOUNDATION_DIR, "plugins", "plugin-stripe", "manifest.json",
    );
    const written = JSON.parse(await fs.readFile(manifestPath, "utf-8")) as {
      id: string;
    };
    expect(written.id).toBe("plugin-stripe");
  });

  it("stripe is added to project.lock plugins array", async () => {
    const localPath = await writeLocalPlugin(
      tmp,
      stripePlugin,
      STRIPE_AFTER_WRITE_HOOK,
    );
    await installPlugin({ projectRoot: tmp, pluginName: localPath });

    const { lockfile } = await readProjectState(tmp);
    expect(lockfile?.plugins.some((p) => p.id === "plugin-stripe")).toBe(true);
  });

  it("stripe is added to foundation.config.json plugins array", async () => {
    const localPath = await writeLocalPlugin(
      tmp,
      stripePlugin,
      STRIPE_AFTER_WRITE_HOOK,
    );
    await installPlugin({ projectRoot: tmp, pluginName: localPath });

    const { config } = await readProjectState(tmp);
    expect(config?.plugins).toContain("plugin-stripe");
  });

  it("stripe file templates are written into plugin dir", async () => {
    const localPath = await writeLocalPlugin(
      tmp,
      stripePlugin,
      STRIPE_AFTER_WRITE_HOOK,
    );
    await installPlugin({ projectRoot: tmp, pluginName: localPath });

    const clientFile = path.join(
      tmp, FOUNDATION_DIR, "plugins", "plugin-stripe",
      "files", "src", "payments", "stripe.ts",
    );
    expect(await fileExists(clientFile)).toBe(true);
  });

  it("hooks.json is written to plugin-stripe dir", async () => {
    const localPath = await writeLocalPlugin(
      tmp,
      stripePlugin,
      STRIPE_AFTER_WRITE_HOOK,
    );
    await installPlugin({ projectRoot: tmp, pluginName: localPath });

    const hooksPath = path.join(
      tmp, FOUNDATION_DIR, "plugins", "plugin-stripe", "hooks.json",
    );
    expect(await fileExists(hooksPath)).toBe(true);
    const hooks = JSON.parse(await fs.readFile(hooksPath, "utf-8")) as Record<
      string,
      string
    >;
    expect(hooks["afterWrite"]).toBeDefined();
    expect(hooks["afterWrite"]).toContain("Stripe");
  });
});

// ── installPlugin integration — redis ─────────────────────────────────────────

describe("installPlugin — redis", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await makeTmp();
    await initProject(tmp);
  });

  afterEach(async () => { await rmTmp(tmp); });

  it("installs redis plugin successfully", async () => {
    const localPath = await writeLocalPlugin(tmp, redisPlugin, REDIS_AFTER_WRITE_HOOK);
    const result = await installPlugin({ projectRoot: tmp, pluginName: localPath });
    expect(result.pluginId).toBe("plugin-redis");
  });

  it("plugin-redis directory is created", async () => {
    const localPath = await writeLocalPlugin(tmp, redisPlugin, REDIS_AFTER_WRITE_HOOK);
    await installPlugin({ projectRoot: tmp, pluginName: localPath });
    expect(
      await fileExists(path.join(tmp, FOUNDATION_DIR, "plugins", "plugin-redis")),
    ).toBe(true);
  });

  it("redis is added to project.lock", async () => {
    const localPath = await writeLocalPlugin(tmp, redisPlugin, REDIS_AFTER_WRITE_HOOK);
    await installPlugin({ projectRoot: tmp, pluginName: localPath });
    const { lockfile } = await readProjectState(tmp);
    expect(lockfile?.plugins.some((p) => p.id === "plugin-redis")).toBe(true);
  });

  it("redis cache file templates are written", async () => {
    const localPath = await writeLocalPlugin(tmp, redisPlugin, REDIS_AFTER_WRITE_HOOK);
    await installPlugin({ projectRoot: tmp, pluginName: localPath });

    const cacheFile = path.join(
      tmp, FOUNDATION_DIR, "plugins", "plugin-redis",
      "files", "src", "cache", "redis-cache.ts",
    );
    expect(await fileExists(cacheFile)).toBe(true);
  });

  it("redis resolved version matches manifest version", async () => {
    const localPath = await writeLocalPlugin(tmp, redisPlugin, REDIS_AFTER_WRITE_HOOK);
    const result = await installPlugin({ projectRoot: tmp, pluginName: localPath });
    expect(result.resolvedVersion).toBe(redisPlugin.manifest.version);
  });
});

// ── installPlugin integration — openai ────────────────────────────────────────

describe("installPlugin — openai", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await makeTmp();
    await initProject(tmp);
  });

  afterEach(async () => { await rmTmp(tmp); });

  it("installs openai plugin successfully", async () => {
    const localPath = await writeLocalPlugin(
      tmp,
      openaiPlugin,
      OPENAI_AFTER_WRITE_HOOK,
    );
    const result = await installPlugin({ projectRoot: tmp, pluginName: localPath });
    expect(result.pluginId).toBe("plugin-openai");
  });

  it("plugin-openai directory is created", async () => {
    const localPath = await writeLocalPlugin(
      tmp,
      openaiPlugin,
      OPENAI_AFTER_WRITE_HOOK,
    );
    await installPlugin({ projectRoot: tmp, pluginName: localPath });
    expect(
      await fileExists(
        path.join(tmp, FOUNDATION_DIR, "plugins", "plugin-openai"),
      ),
    ).toBe(true);
  });

  it("openai is added to project.lock", async () => {
    const localPath = await writeLocalPlugin(
      tmp,
      openaiPlugin,
      OPENAI_AFTER_WRITE_HOOK,
    );
    await installPlugin({ projectRoot: tmp, pluginName: localPath });
    const { lockfile } = await readProjectState(tmp);
    expect(lockfile?.plugins.some((p) => p.id === "plugin-openai")).toBe(true);
  });

  it("openai AI files are written to plugin dir", async () => {
    const localPath = await writeLocalPlugin(
      tmp,
      openaiPlugin,
      OPENAI_AFTER_WRITE_HOOK,
    );
    await installPlugin({ projectRoot: tmp, pluginName: localPath });

    const clientFile = path.join(
      tmp, FOUNDATION_DIR, "plugins", "plugin-openai",
      "files", "src", "ai", "openai-client.ts",
    );
    expect(await fileExists(clientFile)).toBe(true);
  });

  it("openai hooks.json contains afterWrite source", async () => {
    const localPath = await writeLocalPlugin(
      tmp,
      openaiPlugin,
      OPENAI_AFTER_WRITE_HOOK,
    );
    await installPlugin({ projectRoot: tmp, pluginName: localPath });

    const hooksPath = path.join(
      tmp, FOUNDATION_DIR, "plugins", "plugin-openai", "hooks.json",
    );
    const hooks = JSON.parse(await fs.readFile(hooksPath, "utf-8")) as Record<
      string,
      string
    >;
    expect(hooks["afterWrite"]).toContain("OpenAI");
  });
});

// ── All three installed together ──────────────────────────────────────────────

describe("all three addon plugins installed together", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await makeTmp();
    await initProject(tmp);
  });

  afterEach(async () => { await rmTmp(tmp); });

  it("all three can be installed into the same project", async () => {
    const stripePath = await writeLocalPlugin(tmp, stripePlugin, STRIPE_AFTER_WRITE_HOOK);
    const redisPath = await writeLocalPlugin(tmp, redisPlugin, REDIS_AFTER_WRITE_HOOK);
    const openaiPath = await writeLocalPlugin(tmp, openaiPlugin, OPENAI_AFTER_WRITE_HOOK);

    await installPlugin({ projectRoot: tmp, pluginName: stripePath });
    await installPlugin({ projectRoot: tmp, pluginName: redisPath });
    await installPlugin({ projectRoot: tmp, pluginName: openaiPath });

    const { lockfile } = await readProjectState(tmp);
    expect(lockfile?.plugins).toHaveLength(3);
  });

  it("all three appear in project.lock after installation", async () => {
    const stripePath = await writeLocalPlugin(tmp, stripePlugin, STRIPE_AFTER_WRITE_HOOK);
    const redisPath = await writeLocalPlugin(tmp, redisPlugin, REDIS_AFTER_WRITE_HOOK);
    const openaiPath = await writeLocalPlugin(tmp, openaiPlugin, OPENAI_AFTER_WRITE_HOOK);

    await installPlugin({ projectRoot: tmp, pluginName: stripePath });
    await installPlugin({ projectRoot: tmp, pluginName: redisPath });
    await installPlugin({ projectRoot: tmp, pluginName: openaiPath });

    const { lockfile } = await readProjectState(tmp);
    const ids = lockfile!.plugins.map((p) => p.id);
    expect(ids).toContain("plugin-stripe");
    expect(ids).toContain("plugin-redis");
    expect(ids).toContain("plugin-openai");
  });

  it("all three appear in foundation.config.json plugins array", async () => {
    const stripePath = await writeLocalPlugin(tmp, stripePlugin, STRIPE_AFTER_WRITE_HOOK);
    const redisPath = await writeLocalPlugin(tmp, redisPlugin, REDIS_AFTER_WRITE_HOOK);
    const openaiPath = await writeLocalPlugin(tmp, openaiPlugin, OPENAI_AFTER_WRITE_HOOK);

    await installPlugin({ projectRoot: tmp, pluginName: stripePath });
    await installPlugin({ projectRoot: tmp, pluginName: redisPath });
    await installPlugin({ projectRoot: tmp, pluginName: openaiPath });

    const { config } = await readProjectState(tmp);
    expect(config?.plugins).toContain("plugin-stripe");
    expect(config?.plugins).toContain("plugin-redis");
    expect(config?.plugins).toContain("plugin-openai");
  });

  it("loadPluginsFromProject loads all three after installation", async () => {
    const stripePath = await writeLocalPlugin(tmp, stripePlugin, STRIPE_AFTER_WRITE_HOOK);
    const redisPath = await writeLocalPlugin(tmp, redisPlugin, REDIS_AFTER_WRITE_HOOK);
    const openaiPath = await writeLocalPlugin(tmp, openaiPlugin, OPENAI_AFTER_WRITE_HOOK);

    await installPlugin({ projectRoot: tmp, pluginName: stripePath });
    await installPlugin({ projectRoot: tmp, pluginName: redisPath });
    await installPlugin({ projectRoot: tmp, pluginName: openaiPath });

    const registry = new ModuleRegistry();
    const loaded = await loadPluginsFromProject(tmp, registry);

    expect(loaded).toHaveLength(3);
    expect(registry.hasModule("plugin-stripe")).toBe(true);
    expect(registry.hasModule("plugin-redis")).toBe(true);
    expect(registry.hasModule("plugin-openai")).toBe(true);
  });

  it("all three loaded plugins can be resolved together without conflict", async () => {
    const stripePath = await writeLocalPlugin(tmp, stripePlugin, STRIPE_AFTER_WRITE_HOOK);
    const redisPath = await writeLocalPlugin(tmp, redisPlugin, REDIS_AFTER_WRITE_HOOK);
    const openaiPath = await writeLocalPlugin(tmp, openaiPlugin, OPENAI_AFTER_WRITE_HOOK);

    await installPlugin({ projectRoot: tmp, pluginName: stripePath });
    await installPlugin({ projectRoot: tmp, pluginName: redisPath });
    await installPlugin({ projectRoot: tmp, pluginName: openaiPath });

    const registry = new ModuleRegistry();
    await loadPluginsFromProject(tmp, registry);

    expect(() =>
      resolveModules(
        ["plugin-stripe", "plugin-redis", "plugin-openai"],
        registry,
      ),
    ).not.toThrow();
  });

  it("composition plan from all three contains 9 files", async () => {
    const stripePath = await writeLocalPlugin(tmp, stripePlugin, STRIPE_AFTER_WRITE_HOOK);
    const redisPath = await writeLocalPlugin(tmp, redisPlugin, REDIS_AFTER_WRITE_HOOK);
    const openaiPath = await writeLocalPlugin(tmp, openaiPlugin, OPENAI_AFTER_WRITE_HOOK);

    await installPlugin({ projectRoot: tmp, pluginName: stripePath });
    await installPlugin({ projectRoot: tmp, pluginName: redisPath });
    await installPlugin({ projectRoot: tmp, pluginName: openaiPath });

    const registry = new ModuleRegistry();
    await loadPluginsFromProject(tmp, registry);

    const resolution = resolveModules(
      ["plugin-stripe", "plugin-redis", "plugin-openai"],
      registry,
    );
    const plan = buildCompositionPlan(resolution.ordered);

    expect(plan.files).toHaveLength(9);
  });

  it("lockfile plugin entries preserve correct version for each plugin", async () => {
    const stripePath = await writeLocalPlugin(tmp, stripePlugin, STRIPE_AFTER_WRITE_HOOK);
    const redisPath = await writeLocalPlugin(tmp, redisPlugin, REDIS_AFTER_WRITE_HOOK);
    const openaiPath = await writeLocalPlugin(tmp, openaiPlugin, OPENAI_AFTER_WRITE_HOOK);

    await installPlugin({ projectRoot: tmp, pluginName: stripePath });
    await installPlugin({ projectRoot: tmp, pluginName: redisPath });
    await installPlugin({ projectRoot: tmp, pluginName: openaiPath });

    const { lockfile } = await readProjectState(tmp);
    const byId = Object.fromEntries(lockfile!.plugins.map((p) => [p.id, p]));

    expect(byId["plugin-stripe"]?.version).toBe("1.0.0");
    expect(byId["plugin-redis"]?.version).toBe("1.0.0");
    expect(byId["plugin-openai"]?.version).toBe("1.0.0");
  });
});

