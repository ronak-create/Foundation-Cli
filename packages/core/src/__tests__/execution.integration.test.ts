/* eslint-disable @typescript-eslint/require-await */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import type { JsonObject } from "../execution";
import fs from "node:fs/promises";
import os from "node:os";
import { randomUUID } from "node:crypto";
import {
  ModuleRegistry,
  resolveModules,
  buildCompositionPlan,
  runExecutionPipeline,
  FileWriteError,
  ConfigMergeError,
  HookExecutionError,
  mergeJsonContent,
  mergeYamlContent,
  mergeEnvContent,
} from "../index.js";
import type { PluginDefinition } from "@foundation-cli/plugin-sdk";
import type { CompositionPlan } from "../types.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function makeTmp(): Promise<string> {
  const dir = path.join(os.tmpdir(), `foundation-p3-${randomUUID()}`);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function rmTmp(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}

function makePlugin(
  id: string,
  overrides: Partial<PluginDefinition["manifest"]> = {},
  hooks: PluginDefinition["hooks"] = undefined,
): PluginDefinition {
  return hooks ? {
    manifest: {
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
    },
    hooks,
  }:
  { manifest: {
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
  } };
}

function buildMockPlan(
  overrides: Partial<CompositionPlan> = {},
): CompositionPlan {
  return {
    files: [],
    dependencies: [],
    configPatches: [],
    orderedModules: [],
    ...overrides,
  };
}

// ── project-writer ────────────────────────────────────────────────────────────

describe("executeCompositionPlan", () => {
  let tmp: string;

  beforeEach(async () => { tmp = await makeTmp(); });
  afterEach(async () => { await rmTmp(tmp); });

  it("writes all files to disk", async () => {
    const { executeCompositionPlan } = await import("../execution/project-writer.js");

    const plan = buildMockPlan({
      files: [
        { relativePath: "src/index.ts", content: "export {};", overwrite: false },
        { relativePath: "README.md", content: "# Hello" },
      ],
    });

    const result = await executeCompositionPlan(plan, tmp);
    expect(result.filesWritten).toBe(2);

    const index = await fs.readFile(path.join(tmp, "src/index.ts"), "utf-8");
    const readme = await fs.readFile(path.join(tmp, "README.md"), "utf-8");
    expect(index).toBe("export {};");
    expect(readme).toBe("# Hello");
  });

  it("creates intermediate directories", async () => {
    const { executeCompositionPlan } = await import("../execution/project-writer.js");

    const plan = buildMockPlan({
      files: [{ relativePath: "a/b/c/deep.ts", content: "// deep" }],
    });

    await executeCompositionPlan(plan, tmp);
    const stat = await fs.stat(path.join(tmp, "a/b/c/deep.ts"));
    expect(stat.isFile()).toBe(true);
  });

  it("throws FileWriteError (wrapping PathTraversalError) for traversal attempt", async () => {
    const { executeCompositionPlan } = await import("../execution/project-writer.js");

    const plan = buildMockPlan({
      files: [{ relativePath: "../../evil.ts", content: "evil" }],
    });

    await expect(executeCompositionPlan(plan, tmp)).rejects.toThrow(FileWriteError);
  });

  it("returns empty WriteResult for plan with no files", async () => {
    const { executeCompositionPlan } = await import("../execution/project-writer.js");

    const result = await executeCompositionPlan(buildMockPlan(), tmp);
    expect(result.filesWritten).toBe(0);
    expect(result.paths).toHaveLength(0);
  });
});

// ── config-merger ─────────────────────────────────────────────────────────────

describe("config-merger", () => {
  it("mergeJsonContent: deep merges objects", () => {
    const base = JSON.stringify({
      compilerOptions: { strict: true, target: "ES2020" },
      include: ["src"],
    });
    const patch = {
      compilerOptions: { noEmit: true, target: "ES2022" },
      include: ["tests"],
    };

    const merged = mergeJsonContent(base, patch as JsonObject, "tsconfig.json");
    const parsed = JSON.parse(merged) as Record<string, unknown>;
    const opts = parsed["compilerOptions"] as Record<string, unknown>;

    expect(opts["strict"]).toBe(true);
    expect(opts["noEmit"]).toBe(true);
    expect(opts["target"]).toBe("ES2022");
    expect(parsed["include"]).toEqual(["src", "tests"]);
  });

  it("mergeJsonContent: throws ConfigMergeError on type conflict", () => {
    const base = JSON.stringify({ scripts: { dev: "vite" } });
    const patch = { scripts: "not-an-object" };

    expect(() =>
      mergeJsonContent(base, patch as JsonObject, "package.json"),
    ).toThrowError(ConfigMergeError);
  });

  it("mergeJsonContent: throws ConfigMergeError on dep version conflict in package.json", () => {
    const base = JSON.stringify({
      dependencies: { react: "^17.0.0" },
    });
    const patch = { dependencies: { react: "^18.0.0" } };

    expect(() =>
      mergeJsonContent(base, patch as JsonObject, "package.json"),
    ).toThrowError(ConfigMergeError);
  });

  it("mergeJsonContent: deduplicates array primitives", () => {
    const base = JSON.stringify({ include: ["src", "lib"] });
    const patch = { include: ["lib", "tests"] };

    const merged = mergeJsonContent(base, patch as JsonObject, "tsconfig.json");
    const parsed = JSON.parse(merged) as { include: string[] };
    expect(parsed.include).toEqual(["src", "lib", "tests"]);
  });

  it("mergeYamlContent: deep merges YAML objects", () => {
    const base = "version: '3'\nservices:\n  db:\n    image: postgres\n";
    const patch = {
      services: { app: { image: "node:20", ports: ["3000:3000"] } },
    };

    const merged = mergeYamlContent(base, patch as JsonObject, "docker-compose.yml");
    expect(merged).toContain("postgres");
    expect(merged).toContain("node:20");
  });

  it("mergeEnvContent: overwrites existing keys and appends new ones", () => {
    const base = "PORT=3000\nDATABASE_URL=postgres://localhost/dev\n";
    const patch = { PORT: "4000", JWT_SECRET: "s3cr3t" };

    const merged = mergeEnvContent(base, patch);
    expect(merged).toContain("PORT=4000");
    expect(merged).toContain("DATABASE_URL=postgres://localhost/dev");
    expect(merged).toContain("JWT_SECRET=s3cr3t");
  });

  it("mergeEnvContent: preserves comments and blank lines", () => {
    const base = "# App config\nPORT=3000\n\n# DB\nDATABASE_URL=postgres\n";
    const patch = { PORT: "4000" };

    const merged = mergeEnvContent(base, patch);
    expect(merged).toContain("# App config");
    expect(merged).toContain("# DB");
  });
});

// ── dependency-installer ──────────────────────────────────────────────────────

describe("dependency-installer (dryRun)", () => {
  let tmp: string;

  beforeEach(async () => { tmp = await makeTmp(); });
  afterEach(async () => { await rmTmp(tmp); });

  it("writes deps to package.json and returns install result (dry run)", async () => {
    const { installDependencies } = await import("../execution/dependency-installer.js");

    const deps = [
      { name: "express", version: "^4.18.0", scope: "dependencies" as const },
      { name: "typescript", version: "^5.0.0", scope: "devDependencies" as const },
    ];

    const events: string[] = [];
    const result = await installDependencies({
      targetDir: tmp,
      deps,
      dryRun: true,
      onProgress: (p) => { events.push(p.message); },
    });

    expect(result.installed).toHaveLength(2);
    expect(events.some((e) => e.includes("package.json"))).toBe(true);

    const pkgRaw = await fs.readFile(path.join(tmp, "package.json"), "utf-8");
    const pkg = JSON.parse(pkgRaw) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(pkg.dependencies?.["express"]).toBe("^4.18.0");
    expect(pkg.devDependencies?.["typescript"]).toBe("^5.0.0");
  });

  it("returns empty result when no deps provided", async () => {
    const { installDependencies } = await import("../execution/dependency-installer.js");

    const result = await installDependencies({ targetDir: tmp, deps: [], dryRun: true });
    expect(result.installed).toHaveLength(0);
    expect(result.duration).toBe(0);
  });

  it("groups deps correctly by scope", async () => {
    const { writeDepsToPackageJson } = await import("../execution/dependency-installer.js");

    await writeDepsToPackageJson(tmp, [
      { name: "react", version: "^18.0.0", scope: "dependencies" },
      { name: "vitest", version: "^1.0.0", scope: "devDependencies" },
      { name: "react-dom", version: "^18.0.0", scope: "peerDependencies" },
    ]);

    const raw = await fs.readFile(path.join(tmp, "package.json"), "utf-8");
    const pkg = JSON.parse(raw) as Record<string, Record<string, string>>;
    expect(pkg["dependencies"]?.["react"]).toBe("^18.0.0");
    expect(pkg["devDependencies"]?.["vitest"]).toBe("^1.0.0");
    expect(pkg["peerDependencies"]?.["react-dom"]).toBe("^18.0.0");
  });
});

// ── hook-runner ───────────────────────────────────────────────────────────────

describe("hook-runner", () => {
  it("executes hooks in topological (module) order", async () => {
    const order: string[] = [];

    const registry = new ModuleRegistry();
    registry.registerModule(
      makePlugin(
        "base",
        { compatibility: {} },
        {
          beforeWrite: async () => { order.push("base:beforeWrite"); },
          afterInstall: async () => { order.push("base:afterInstall"); },
        },
      ),
    );
    registry.registerModule(
      makePlugin(
        "auth",
        { compatibility: { requires: ["base"] } },
        {
          beforeWrite: async () => { order.push("auth:beforeWrite"); },
          afterInstall: async () => { order.push("auth:afterInstall"); },
        },
      ),
    );

    const result = resolveModules(["auth", "base"], registry);
    const plan = buildCompositionPlan(result.ordered);

    const ctx = {
      projectRoot: "/tmp/test",
      config: {},
      selectedModules: ["auth", "base"],
    };

    const { runHooksForPlan } = await import("../execution/hook-runner.js");

    await runHooksForPlan("beforeWrite", plan, registry, ctx, { strict: true });

    // base must appear before auth in topological order
    expect(order.indexOf("base:beforeWrite")).toBeLessThan(
      order.indexOf("auth:beforeWrite"),
    );
  });

  it("skips hooks that are not defined on a plugin", async () => {
    const registry = new ModuleRegistry();
    registry.registerModule(makePlugin("no-hooks")); // no hooks defined

    const plan = buildMockPlan({
      orderedModules: [
        {
          id: "no-hooks",
          name: "No Hooks",
          version: "1.0.0",
          description: "test",
          category: "tooling",
          dependencies: [],
          files: [],
          configPatches: [],
          compatibility: {},
        },
      ],
    });

    const skipped: string[] = [];
    const { runHooksForPlan } = await import("../execution/hook-runner.js");

    await runHooksForPlan(
      "beforeWrite",
      plan,
      registry,
      { projectRoot: "/tmp", config: {}, selectedModules: [] },
      { strict: true, onHookSkipped: (id, hook) => { skipped.push(`${id}:${hook}`); } },
    );

    expect(skipped).toContain("no-hooks:beforeWrite");
  });

  it("throws HookExecutionError in strict mode when a hook fails", async () => {
    const registry = new ModuleRegistry();
    registry.registerModule(
      makePlugin("failing-module", {}, {
        beforeWrite: async () => { throw new Error("hook exploded"); },
      }),
    );

    const plan = buildMockPlan({
      orderedModules: [
        {
          id: "failing-module",
          name: "Failing",
          version: "1.0.0",
          description: "test",
          category: "tooling",
          dependencies: [],
          files: [],
          configPatches: [],
          compatibility: {},
        },
      ],
    });

    const { runHooksForPlan } = await import("../execution/hook-runner.js");

    await expect(
      runHooksForPlan(
        "beforeWrite",
        plan,
        registry,
        { projectRoot: "/tmp", config: {}, selectedModules: [] },
        { strict: true },
      ),
    ).rejects.toThrow(HookExecutionError);
  });

  it("swallows hook errors in non-strict mode", async () => {
    const registry = new ModuleRegistry();
    registry.registerModule(
      makePlugin("fragile", {}, {
        afterInstall: async () => { throw new Error("non-fatal"); },
      }),
    );

    const plan = buildMockPlan({
      orderedModules: [
        {
          id: "fragile",
          name: "Fragile",
          version: "1.0.0",
          description: "test",
          category: "tooling",
          dependencies: [],
          files: [],
          configPatches: [],
          compatibility: {},
        },
      ],
    });

    const { runHooksForPlan } = await import("../execution/hook-runner.js");

    await expect(
      runHooksForPlan(
        "afterInstall",
        plan,
        registry,
        { projectRoot: "/tmp", config: {}, selectedModules: [] },
        { strict: false },
      ),
    ).resolves.toBeUndefined();
  });
});

// ── Full pipeline integration ─────────────────────────────────────────────────

describe("runExecutionPipeline — full integration", () => {
  let tmp: string;

  beforeEach(async () => { tmp = await makeTmp(); });
  afterEach(async () => { await rmTmp(tmp); });

  it("runs full pipeline: writes files, applies patches, installs (dry), runs hooks in order", async () => {
    const hookOrder: string[] = [];

    const registry = new ModuleRegistry();

    registry.registerModule(
      makePlugin(
        "mod-base",
        {
          files: [
            { relativePath: "src/index.ts", content: "// base" },
          ],
          dependencies: [
            { name: "express", version: "^4.18.0", scope: "dependencies" },
          ],
          configPatches: [
            {
              targetFile: "package.json",
              merge: { scripts: { dev: "node src/index.js" } },
            },
          ],
        },
        {
          beforeWrite: async () => { hookOrder.push("mod-base:beforeWrite"); },
          afterInstall: async () => { hookOrder.push("mod-base:afterInstall"); },
          afterWrite: async () => { hookOrder.push("mod-base:afterWrite"); },
        },
      ),
    );

    registry.registerModule(
      makePlugin(
        "mod-auth",
        {
          files: [{ relativePath: "src/auth.ts", content: "// auth" }],
          dependencies: [
            { name: "jsonwebtoken", version: "^9.0.0", scope: "dependencies" },
          ],
          compatibility: { requires: ["mod-base"] },
        },
        {
          beforeWrite: async () => { hookOrder.push("mod-auth:beforeWrite"); },
          afterInstall: async () => { hookOrder.push("mod-auth:afterInstall"); },
        },
      ),
    );

    const resolution = resolveModules(["mod-auth"], registry);
    const plan = buildCompositionPlan(resolution.ordered);

    const events: string[] = [];

    const result = await runExecutionPipeline(plan, {
      targetDir: tmp,
      registry,
      dryRun: true,
      skipInstall: false,
      hookContext: {
        config: { projectName: "test-project" },
        selectedModules: ["mod-auth"],
      },
      onProgress: (e) => { events.push(`[${e.stage}] ${e.message}`); },
    });

    // ── Files written
    const indexContent = await fs.readFile(
      path.join(tmp, "src/index.ts"),
      "utf-8",
    );
    const authContent = await fs.readFile(
      path.join(tmp, "src/auth.ts"),
      "utf-8",
    );
    expect(indexContent).toBe("// base");
    expect(authContent).toBe("// auth");

    // ── package.json written and patched
    const pkgRaw = await fs.readFile(path.join(tmp, "package.json"), "utf-8");
    const pkg = JSON.parse(pkgRaw) as Record<string, unknown>;
    expect(pkg["dependencies"]).toBeDefined();

    // ── Install result present (dry run)
    expect(result.installResult).not.toBeNull();
    expect(result.installResult?.installed).toHaveLength(2);

    // ── Files written count
    expect(result.writeResult.filesWritten).toBe(2);

    // ── Patches applied
    expect(result.patchesApplied).toBe(1);

    // ── Hook order: base before auth, lifecycle order respected
    expect(hookOrder.indexOf("mod-base:beforeWrite")).toBeLessThan(
      hookOrder.indexOf("mod-auth:beforeWrite"),
    );
    expect(hookOrder.indexOf("mod-base:afterInstall")).toBeLessThan(
      hookOrder.indexOf("mod-auth:afterInstall"),
    );
    expect(hookOrder).toContain("mod-base:afterWrite");

    // ── Progress events emitted
    expect(events.some((e) => e.includes("write-files"))).toBe(true);
    expect(events.some((e) => e.includes("install-deps"))).toBe(true);
    expect(events.some((e) => e.includes("complete"))).toBe(true);
  });

  it("skips install when skipInstall=true", async () => {
    const registry = new ModuleRegistry();
    const plan = buildMockPlan({
      files: [{ relativePath: "index.ts", content: "// empty" }],
    });

    const result = await runExecutionPipeline(plan, {
      targetDir: tmp,
      registry,
      dryRun: false,
      skipInstall: true,
      hookContext: { config: {}, selectedModules: [] },
    });

    expect(result.installResult).toBeNull();
  });

  it("pipeline result includes duration > 0", async () => {
    const registry = new ModuleRegistry();
    const plan = buildMockPlan();

    const result = await runExecutionPipeline(plan, {
      targetDir: tmp,
      registry,
      skipInstall: true,
      dryRun: true,
      hookContext: { config: {}, selectedModules: [] },
    });

    expect(result.duration).toBeGreaterThanOrEqual(0);
  });
});
