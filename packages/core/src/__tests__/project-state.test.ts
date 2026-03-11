import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { randomUUID } from "node:crypto";
import {
  writeProjectState,
  readProjectState,
  isFoundationProject,
  serialiseLockfile,
  parseLockfile,
  FOUNDATION_DIR,
  LOCKFILE_NAME,
  CONFIG_NAME,
  FOUNDATION_CLI_VERSION,
  // StateWriteError,
  type WriteStateOptions,
  type ProjectLockfile,
} from "../state/index.js";
import type { ModuleManifest } from "@foundation-cli/plugin-sdk";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function makeTmp(): Promise<string> {
  const dir = path.join(os.tmpdir(), `foundation-state-${randomUUID()}`);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function rmTmp(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function readJson(p: string): Promise<Record<string, unknown>> {
  const raw = await fs.readFile(p, "utf-8");
  return JSON.parse(raw) as Record<string, unknown>;
}

function makeManifest(
  id: string,
  version = "1.0.0",
): ModuleManifest {
  return {
    id,
    name: `Module ${id}`,
    version,
    description: "Test",
    category: "tooling",
    dependencies: [],
    files: [],
    configPatches: [],
    compatibility: {},
  };
}

function baseOptions(
  projectRoot: string,
  overrides: Partial<WriteStateOptions> = {},
): WriteStateOptions {
  return {
    projectRoot,
    orderedModules: [
      makeManifest("backend-express", "1.0.0"),
      makeManifest("database-postgresql", "1.0.0"),
      makeManifest("auth-jwt", "1.0.0"),
    ],
    packageManager: "npm",
    projectName: "test-project",
    selections: {
      frontend: "none",
      backend: "express",
      database: "postgresql",
      auth: "jwt",
      ui: "none",
      stateManagement: "none",
      deployment: "none",
    },
    nowIso: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

// ── serialiseLockfile ─────────────────────────────────────────────────────────

describe("serialiseLockfile", () => {
  it("produces stable JSON with deterministic key order", () => {
    const lockfile: ProjectLockfile = {
      foundationCliVersion: "0.0.1",
      generatedAt: "2026-01-01T00:00:00.000Z",
      packageManager: "npm",
      modules: [
        { id: "backend-express", version: "1.0.0" },
        { id: "auth-jwt", version: "1.0.0" },
      ],
      plugins: [],
    };

    const serialised = serialiseLockfile(lockfile);
    const parsed = JSON.parse(serialised) as Record<string, unknown>;
    const keys = Object.keys(parsed);

    expect(keys[0]).toBe("foundationCliVersion");
    expect(keys[1]).toBe("generatedAt");
    expect(keys[2]).toBe("packageManager");
    expect(keys[3]).toBe("modules");
    expect(keys[4]).toBe("plugins");
  });

  it("sorts modules array by id for stability", () => {
    const lockfile: ProjectLockfile = {
      foundationCliVersion: "0.0.1",
      generatedAt: "2026-01-01T00:00:00.000Z",
      packageManager: "npm",
      modules: [
        { id: "database-postgresql", version: "1.0.0" },
        { id: "auth-jwt", version: "1.0.0" },
        { id: "backend-express", version: "1.0.0" },
      ],
      plugins: [],
    };

    const serialised = serialiseLockfile(lockfile);
    const parsed = JSON.parse(serialised) as { modules: Array<{ id: string }> };

    expect(parsed.modules[0]?.id).toBe("auth-jwt");
    expect(parsed.modules[1]?.id).toBe("backend-express");
    expect(parsed.modules[2]?.id).toBe("database-postgresql");
  });

  it("produces identical output for same input on repeated calls", () => {
    const lockfile: ProjectLockfile = {
      foundationCliVersion: "0.0.1",
      generatedAt: "2026-01-01T00:00:00.000Z",
      packageManager: "pnpm",
      modules: [
        { id: "backend-express", version: "1.0.0" },
        { id: "auth-jwt", version: "2.0.0" },
      ],
      plugins: [],
    };

    expect(serialiseLockfile(lockfile)).toBe(serialiseLockfile(lockfile));
  });

  it("always includes plugins array even when empty", () => {
    const lockfile: ProjectLockfile = {
      foundationCliVersion: "0.0.1",
      generatedAt: "2026-01-01T00:00:00.000Z",
      packageManager: "npm",
      modules: [],
      plugins: [],
    };

    const serialised = serialiseLockfile(lockfile);
    const parsed = JSON.parse(serialised) as { plugins: unknown[] };
    expect(Array.isArray(parsed.plugins)).toBe(true);
    expect(parsed.plugins).toHaveLength(0);
  });
});

// ── parseLockfile ─────────────────────────────────────────────────────────────

describe("parseLockfile", () => {
  it("round-trips a valid lockfile", () => {
    const lockfile: ProjectLockfile = {
      foundationCliVersion: "0.0.1",
      generatedAt: "2026-01-01T00:00:00.000Z",
      packageManager: "pnpm",
      modules: [{ id: "backend-express", version: "1.0.0" }],
      plugins: [],
    };

    const raw = serialiseLockfile(lockfile);
    const reparsed = parseLockfile(raw);

    expect(reparsed).not.toBeNull();
    expect(reparsed?.foundationCliVersion).toBe("0.0.1");
    expect(reparsed?.packageManager).toBe("pnpm");
    expect(reparsed?.modules).toHaveLength(1);
    expect(reparsed?.modules[0]?.id).toBe("backend-express");
    expect(reparsed?.plugins).toHaveLength(0);
  });

  it("returns null for empty string", () => {
    expect(parseLockfile("")).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    expect(parseLockfile("not json {{{")).toBeNull();
  });

  it("returns null when required fields are missing", () => {
    expect(parseLockfile(JSON.stringify({ foundationCliVersion: "0.0.1" }))).toBeNull();
  });

  it("defaults plugins to empty array when missing from file", () => {
    const raw = JSON.stringify({
      foundationCliVersion: "0.0.1",
      generatedAt: "2026-01-01T00:00:00.000Z",
      packageManager: "npm",
      modules: [],
    });
    const result = parseLockfile(raw);
    expect(result?.plugins).toEqual([]);
  });
});

// ── writeProjectState ─────────────────────────────────────────────────────────

describe("writeProjectState", () => {
  let tmp: string;

  beforeEach(async () => { tmp = await makeTmp(); });
  afterEach(async () => { await rmTmp(tmp); });

  it("creates .foundation/ directory", async () => {
    await writeProjectState(baseOptions(tmp));
    expect(await fileExists(path.join(tmp, FOUNDATION_DIR))).toBe(true);
  });

  it("creates project.lock inside .foundation/", async () => {
    await writeProjectState(baseOptions(tmp));
    expect(
      await fileExists(path.join(tmp, FOUNDATION_DIR, LOCKFILE_NAME)),
    ).toBe(true);
  });

  it("creates foundation.config.json inside .foundation/", async () => {
    await writeProjectState(baseOptions(tmp));
    expect(
      await fileExists(path.join(tmp, FOUNDATION_DIR, CONFIG_NAME)),
    ).toBe(true);
  });

  it("project.lock contains correct foundationCliVersion", async () => {
    await writeProjectState(baseOptions(tmp));
    const raw = await fs.readFile(
      path.join(tmp, FOUNDATION_DIR, LOCKFILE_NAME),
      "utf-8",
    );
    const parsed = JSON.parse(raw) as { foundationCliVersion: string };
    expect(parsed.foundationCliVersion).toBe(FOUNDATION_CLI_VERSION);
  });

  it("project.lock contains correct generatedAt timestamp", async () => {
    await writeProjectState(baseOptions(tmp, { nowIso: "2026-06-15T12:00:00.000Z" }));
    const raw = await fs.readFile(
      path.join(tmp, FOUNDATION_DIR, LOCKFILE_NAME),
      "utf-8",
    );
    const parsed = JSON.parse(raw) as { generatedAt: string };
    expect(parsed.generatedAt).toBe("2026-06-15T12:00:00.000Z");
  });

  it("project.lock contains correct packageManager", async () => {
    await writeProjectState(baseOptions(tmp, { packageManager: "pnpm" }));
    const raw = await readJson(path.join(tmp, FOUNDATION_DIR, LOCKFILE_NAME));
    expect(raw["packageManager"]).toBe("pnpm");
  });

  it("project.lock contains all selected module IDs", async () => {
    await writeProjectState(baseOptions(tmp));
    const raw = await readJson(path.join(tmp, FOUNDATION_DIR, LOCKFILE_NAME));
    const modules = raw["modules"] as Array<{ id: string; version: string }>;
    const ids = modules.map((m) => m.id);
    expect(ids).toContain("backend-express");
    expect(ids).toContain("database-postgresql");
    expect(ids).toContain("auth-jwt");
  });

  it("project.lock modules array is sorted by id (deterministic)", async () => {
    await writeProjectState(baseOptions(tmp));
    const raw = await readJson(path.join(tmp, FOUNDATION_DIR, LOCKFILE_NAME));
    const modules = raw["modules"] as Array<{ id: string }>;
    const ids = modules.map((m) => m.id);
    expect(ids).toEqual([...ids].sort());
  });

  it("project.lock plugins is an empty array", async () => {
    await writeProjectState(baseOptions(tmp));
    const raw = await readJson(path.join(tmp, FOUNDATION_DIR, LOCKFILE_NAME));
    expect(raw["plugins"]).toEqual([]);
  });

  it("project.lock key order is deterministic", async () => {
    await writeProjectState(baseOptions(tmp));
    const raw = await fs.readFile(
      path.join(tmp, FOUNDATION_DIR, LOCKFILE_NAME),
      "utf-8",
    );
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const keys = Object.keys(parsed);
    expect(keys[0]).toBe("foundationCliVersion");
    expect(keys[1]).toBe("generatedAt");
    expect(keys[2]).toBe("packageManager");
    expect(keys[3]).toBe("modules");
    expect(keys[4]).toBe("plugins");
  });

  it("foundation.config.json contains projectName", async () => {
    await writeProjectState(baseOptions(tmp, { projectName: "my-saas" }));
    const raw = await readJson(path.join(tmp, FOUNDATION_DIR, CONFIG_NAME));
    expect(raw["projectName"]).toBe("my-saas");
  });

  it("foundation.config.json contains selections matching input", async () => {
    const selections = {
      frontend: "none",
      backend: "express",
      database: "postgresql",
      auth: "jwt",
      ui: "none",
      stateManagement: "none",
      deployment: "docker",
    };

    await writeProjectState(baseOptions(tmp, { selections }));
    const raw = await readJson(path.join(tmp, FOUNDATION_DIR, CONFIG_NAME));
    const storedSelections = raw["selections"] as Record<string, string>;

    expect(storedSelections["backend"]).toBe("express");
    expect(storedSelections["database"]).toBe("postgresql");
    expect(storedSelections["auth"]).toBe("jwt");
    expect(storedSelections["deployment"]).toBe("docker");
  });

  it("foundation.config.json plugins is an empty array", async () => {
    await writeProjectState(baseOptions(tmp));
    const raw = await readJson(path.join(tmp, FOUNDATION_DIR, CONFIG_NAME));
    expect(raw["plugins"]).toEqual([]);
  });

  it("foundation.config.json key order is deterministic", async () => {
    await writeProjectState(baseOptions(tmp));
    const raw = await fs.readFile(
      path.join(tmp, FOUNDATION_DIR, CONFIG_NAME),
      "utf-8",
    );
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const keys = Object.keys(parsed);
    expect(keys[0]).toBe("projectName");
    expect(keys[1]).toBe("createdAt");
    expect(keys[2]).toBe("selections");
    expect(keys[3]).toBe("plugins");
  });

  it("creates parent directory when it does not exist", async () => {
    const nested = path.join(tmp, "deep", "nested", "project");
    await writeProjectState(baseOptions(nested));
    expect(
      await fileExists(path.join(nested, FOUNDATION_DIR, LOCKFILE_NAME)),
    ).toBe(true);
  });

  it("overwrites existing state files on re-run", async () => {
    await writeProjectState(
      baseOptions(tmp, { nowIso: "2026-01-01T00:00:00.000Z" }),
    );
    await writeProjectState(
      baseOptions(tmp, { nowIso: "2026-06-01T00:00:00.000Z" }),
    );

    const raw = await readJson(path.join(tmp, FOUNDATION_DIR, LOCKFILE_NAME));
    expect(raw["generatedAt"]).toBe("2026-06-01T00:00:00.000Z");
  });
});

// ── readProjectState ──────────────────────────────────────────────────────────

describe("readProjectState", () => {
  let tmp: string;

  beforeEach(async () => { tmp = await makeTmp(); });
  afterEach(async () => { await rmTmp(tmp); });

  it("returns null lockfile and config when .foundation/ does not exist", async () => {
    const result = await readProjectState(tmp);
    expect(result.lockfile).toBeNull();
    expect(result.config).toBeNull();
  });

  it("reads back a previously written state correctly", async () => {
    const opts = baseOptions(tmp, {
      projectName: "round-trip-app",
      packageManager: "yarn",
      nowIso: "2026-03-15T09:30:00.000Z",
    });

    await writeProjectState(opts);
    const result = await readProjectState(tmp);

    expect(result.lockfile).not.toBeNull();
    expect(result.lockfile?.packageManager).toBe("yarn");
    expect(result.lockfile?.generatedAt).toBe("2026-03-15T09:30:00.000Z");
    expect(result.lockfile?.foundationCliVersion).toBe(FOUNDATION_CLI_VERSION);
    expect(result.lockfile?.plugins).toEqual([]);

    expect(result.config).not.toBeNull();
    expect(result.config?.projectName).toBe("round-trip-app");
    expect(result.config?.plugins).toEqual([]);
  });

  it("reads back module list correctly", async () => {
    await writeProjectState(baseOptions(tmp));
    const result = await readProjectState(tmp);

    const ids = result.lockfile?.modules.map((m) => m.id) ?? [];
    expect(ids).toContain("backend-express");
    expect(ids).toContain("database-postgresql");
    expect(ids).toContain("auth-jwt");
  });

  it("reads back selections correctly", async () => {
    const selections = {
      frontend: "nextjs",
      backend: "express",
      database: "postgresql",
      auth: "jwt",
      ui: "tailwind",
      stateManagement: "none",
      deployment: "docker",
    };

    await writeProjectState(baseOptions(tmp, { selections }));
    const result = await readProjectState(tmp);

    expect(result.config?.selections["frontend"]).toBe("nextjs");
    expect(result.config?.selections["deployment"]).toBe("docker");
  });

  it("returns null lockfile when project.lock is corrupt", async () => {
    const foundationDir = path.join(tmp, FOUNDATION_DIR);
    await fs.mkdir(foundationDir, { recursive: true });
    await fs.writeFile(
      path.join(foundationDir, LOCKFILE_NAME),
      "this is not json",
      "utf-8",
    );

    const result = await readProjectState(tmp);
    expect(result.lockfile).toBeNull();
  });

  it("returns null config when foundation.config.json is corrupt", async () => {
    const foundationDir = path.join(tmp, FOUNDATION_DIR);
    await fs.mkdir(foundationDir, { recursive: true });
    await fs.writeFile(
      path.join(foundationDir, CONFIG_NAME),
      "{ broken json",
      "utf-8",
    );

    const result = await readProjectState(tmp);
    expect(result.config).toBeNull();
  });
});

// ── isFoundationProject ───────────────────────────────────────────────────────

describe("isFoundationProject", () => {
  let tmp: string;

  beforeEach(async () => { tmp = await makeTmp(); });
  afterEach(async () => { await rmTmp(tmp); });

  it("returns false when .foundation/ does not exist", async () => {
    expect(await isFoundationProject(tmp)).toBe(false);
  });

  it("returns false when .foundation/ exists but project.lock is missing", async () => {
    await fs.mkdir(path.join(tmp, FOUNDATION_DIR), { recursive: true });
    expect(await isFoundationProject(tmp)).toBe(false);
  });

  it("returns true after writeProjectState", async () => {
    await writeProjectState(baseOptions(tmp));
    expect(await isFoundationProject(tmp)).toBe(true);
  });
});

// ── Pipeline integration: stateOptions writes state ──────────────────────────

describe("runExecutionPipeline — state integration", () => {
  let tmp: string;

  beforeEach(async () => { tmp = await makeTmp(); });
  afterEach(async () => { await rmTmp(tmp); });

  it("writes .foundation/ when stateOptions is provided", async () => {
    const { runExecutionPipeline } = await import("../execution/pipeline.js");
    const { ModuleRegistry } = await import("../module-registry/registry.js");

    const registry = new ModuleRegistry();
    const plan = {
      files: [{ relativePath: "src/index.ts", content: "// entry" }],
      dependencies: [],
      configPatches: [],
      orderedModules: [makeManifest("backend-express", "1.0.0")],
    };

    await runExecutionPipeline(plan, {
      targetDir: tmp,
      registry,
      skipInstall: true,
      dryRun: true,
      hookContext: { config: {}, selectedModules: ["backend-express"] },
      stateOptions: {
        projectName: "pipeline-test",
        selections: { backend: "express" },
      },
    });

    expect(
      await fileExists(path.join(tmp, FOUNDATION_DIR, LOCKFILE_NAME)),
    ).toBe(true);
    expect(
      await fileExists(path.join(tmp, FOUNDATION_DIR, CONFIG_NAME)),
    ).toBe(true);
  });

  it("does NOT write .foundation/ when stateOptions is omitted", async () => {
    const { runExecutionPipeline } = await import("../execution/pipeline.js");
    const { ModuleRegistry } = await import("../module-registry/registry.js");

    const registry = new ModuleRegistry();
    const plan = {
      files: [],
      dependencies: [],
      configPatches: [],
      orderedModules: [],
    };

    const result = await runExecutionPipeline(plan, {
      targetDir: tmp,
      registry,
      skipInstall: true,
      dryRun: true,
      hookContext: { config: {}, selectedModules: [] },
      // stateOptions deliberately omitted
    });

    expect(result.stateWritten).toBe(false);
    expect(
      await fileExists(path.join(tmp, FOUNDATION_DIR)),
    ).toBe(false);
  });

  it("stateWritten is true when stateOptions is provided", async () => {
    const { runExecutionPipeline } = await import("../execution/pipeline.js");
    const { ModuleRegistry } = await import("../module-registry/registry.js");

    const registry = new ModuleRegistry();
    const plan = {
      files: [],
      dependencies: [],
      configPatches: [],
      orderedModules: [makeManifest("auth-jwt")],
    };

    const result = await runExecutionPipeline(plan, {
      targetDir: tmp,
      registry,
      skipInstall: true,
      dryRun: true,
      hookContext: { config: {}, selectedModules: [] },
      stateOptions: {
        projectName: "state-flag-test",
        selections: { auth: "jwt" },
      },
    });

    expect(result.stateWritten).toBe(true);
  });

  it("lockfile modules match the plan's orderedModules", async () => {
    const { runExecutionPipeline } = await import("../execution/pipeline.js");
    const { ModuleRegistry } = await import("../module-registry/registry.js");

    const registry = new ModuleRegistry();
    const orderedModules = [
      makeManifest("backend-express", "1.0.0"),
      makeManifest("auth-jwt", "1.0.0"),
    ];

    const plan = {
      files: [],
      dependencies: [],
      configPatches: [],
      orderedModules,
    };

    await runExecutionPipeline(plan, {
      targetDir: tmp,
      registry,
      skipInstall: true,
      dryRun: true,
      hookContext: { config: {}, selectedModules: [] },
      stateOptions: {
        projectName: "module-match-test",
        selections: {},
      },
    });

    const result = await readProjectState(tmp);
    const lockIds = result.lockfile?.modules.map((m) => m.id) ?? [];
    expect(lockIds).toContain("backend-express");
    expect(lockIds).toContain("auth-jwt");
  });

  it("emits write-state pipeline event", async () => {
    const { runExecutionPipeline } = await import("../execution/pipeline.js");
    const { ModuleRegistry } = await import("../module-registry/registry.js");

    const registry = new ModuleRegistry();
    const plan = {
      files: [],
      dependencies: [],
      configPatches: [],
      orderedModules: [],
    };

    const stages: string[] = [];

    await runExecutionPipeline(plan, {
      targetDir: tmp,
      registry,
      skipInstall: true,
      dryRun: true,
      hookContext: { config: {}, selectedModules: [] },
      stateOptions: { projectName: "event-test", selections: {} },
      onProgress: (e) => { stages.push(e.stage); },
    });

    expect(stages).toContain("write-state");
  });
});
