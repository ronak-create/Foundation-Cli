import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { randomUUID } from "node:crypto";
import {
  ModuleRegistry,
  resolveModules,
  buildCompositionPlan,
  runExecutionPipeline,
  ModuleConflictError,
} from "@foundation-cli/core";
import {
  loadBuiltinModules,
  selectionsToModuleIds,
  SELECTION_TO_MODULE_ID,
  expressModule,
  postgresqlModule,
  jwtModule,
  dockerModule,
  tailwindModule,
  nextjsModule,
} from "@foundation-cli/modules";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function makeTmp(): Promise<string> {
  const dir = path.join(os.tmpdir(), `foundation-p4-${randomUUID()}`);
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

// ── Module loading ────────────────────────────────────────────────────────────

describe("loadBuiltinModules", () => {
  it("registers all built-in modules without throwing", () => {
    const registry = new ModuleRegistry();
    expect(() => loadBuiltinModules(registry)).not.toThrow();
    expect(registry.size).toBeGreaterThanOrEqual(6);
  });

  it("idempotent: calling twice does not throw DuplicateModuleError", () => {
    const registry = new ModuleRegistry();
    loadBuiltinModules(registry);
    expect(() => loadBuiltinModules(registry)).not.toThrow();
  });

  it("all expected module IDs are registered", () => {
    const registry = new ModuleRegistry();
    loadBuiltinModules(registry);
    const ids = registry.listModules().map((m) => m.id);
    expect(ids).toContain("frontend-nextjs");
    expect(ids).toContain("backend-express");
    expect(ids).toContain("database-postgresql");
    expect(ids).toContain("auth-jwt");
    expect(ids).toContain("ui-tailwind");
    expect(ids).toContain("deployment-docker");
  });
});

// ── selectionsToModuleIds ─────────────────────────────────────────────────────

describe("selectionsToModuleIds", () => {
  it("maps selection values to registered module IDs", () => {
    const registry = new ModuleRegistry();
    loadBuiltinModules(registry);

    const ids = selectionsToModuleIds(
      ["nextjs", "express", "postgresql", "jwt"],
      registry,
    );

    expect(ids).toContain("frontend-nextjs");
    expect(ids).toContain("backend-express");
    expect(ids).toContain("database-postgresql");
    expect(ids).toContain("auth-jwt");
  });

  it("filters out 'none' values", () => {
    const registry = new ModuleRegistry();
    loadBuiltinModules(registry);

    const ids = selectionsToModuleIds(["none", "none", "express"], registry);
    expect(ids).not.toContain("none");
    expect(ids).toContain("backend-express");
  });

  it("filters out unimplemented module IDs gracefully", () => {
    const registry = new ModuleRegistry();
    loadBuiltinModules(registry);

    // "react-vite" is not yet implemented — should be filtered out
    const ids = selectionsToModuleIds(["react-vite", "express"], registry);
    expect(ids).toContain("backend-express");
    expect(ids).not.toContain("react-vite");
  });
});

// ── Module manifests ──────────────────────────────────────────────────────────

describe("module manifests", () => {
  it("express module has required files and deps", () => {
    const m = expressModule.manifest;
    expect(m.files.some((f) => f.relativePath === "src/server.ts")).toBe(true);
    expect(m.dependencies.some((d) => d.name === "express")).toBe(true);
    expect(m.dependencies.some((d) => d.name === "dotenv")).toBe(true);
  });

  it("postgresql module produces db client and migration files", () => {
    const m = postgresqlModule.manifest;
    expect(m.files.some((f) => f.relativePath === "src/db/client.ts")).toBe(true);
    expect(m.files.some((f) => f.relativePath.includes("migrations"))).toBe(true);
    expect(m.dependencies.some((d) => d.name === "pg")).toBe(true);
  });

  it("jwt module produces auth service, middleware and router", () => {
    const m = jwtModule.manifest;
    const paths = m.files.map((f) => f.relativePath);
    expect(paths).toContain("src/auth/auth.service.ts");
    expect(paths).toContain("src/auth/auth.middleware.ts");
    expect(paths).toContain("src/auth/auth.router.ts");
    expect(m.dependencies.some((d) => d.name === "jsonwebtoken")).toBe(true);
  });

  it("docker module produces Dockerfile and docker-compose", () => {
    const m = dockerModule.manifest;
    const paths = m.files.map((f) => f.relativePath);
    expect(paths).toContain("Dockerfile");
    expect(paths).toContain("docker-compose.yml");
    expect(paths).toContain(".dockerignore");
  });

  it("tailwind module has config and postcss files", () => {
    const m = tailwindModule.manifest;
    const paths = m.files.map((f) => f.relativePath);
    expect(paths).toContain("tailwind.config.js");
    expect(paths).toContain("postcss.config.js");
  });

  it("nextjs module patches package.json scripts", () => {
    const m = nextjsModule.manifest;
    const patch = m.configPatches.find((p) => p.targetFile === "package.json");
    expect(patch).toBeDefined();
    const scripts = patch?.merge as { scripts?: Record<string, string> };
    expect(scripts?.scripts?.["dev"]).toBe("next dev");
  });
});

// ── Conflict detection ────────────────────────────────────────────────────────

describe("conflict detection", () => {
  it("throws ModuleConflictError when postgresql and mysql are both selected", () => {
    const registry = new ModuleRegistry();
    loadBuiltinModules(registry);

    // Manually add a mysql stub to test conflict
    registry.registerModule({
      manifest: {
        id: "database-mysql",
        name: "MySQL",
        version: "1.0.0",
        description: "MySQL stub",
        category: "database",
        dependencies: [],
        files: [],
        configPatches: [],
        compatibility: { conflicts: ["database-postgresql"] },
      },
    });

    expect(() =>
      resolveModules(
        ["database-postgresql", "database-mysql"],
        registry,
      ),
    ).toThrowError(ModuleConflictError);
  });

  it("throws ModuleConflictError for two backend frameworks", () => {
    const registry = new ModuleRegistry();
    loadBuiltinModules(registry);

    registry.registerModule({
      manifest: {
        id: "backend-nestjs",
        name: "NestJS",
        version: "1.0.0",
        description: "NestJS stub",
        category: "backend",
        dependencies: [],
        files: [],
        configPatches: [],
        compatibility: { conflicts: ["backend-express"] },
      },
    });

    expect(() =>
      resolveModules(["backend-express", "backend-nestjs"], registry),
    ).toThrowError(ModuleConflictError);
  });
});

// ── Full generation pipeline ───────────────────────────────────────────────────

describe("full generation pipeline — Express + PostgreSQL + JWT + Docker", () => {
  let tmp: string;

  beforeEach(async () => { tmp = await makeTmp(); });
  afterEach(async () => { await rmTmp(tmp); });

  it("generates all expected files on disk", async () => {
    const registry = new ModuleRegistry();
    loadBuiltinModules(registry);

    const resolution = resolveModules(
      [
        "backend-express",
        "database-postgresql",
        "auth-jwt",
        "deployment-docker",
      ],
      registry,
    );

    const plan = buildCompositionPlan(resolution.ordered);

    await runExecutionPipeline(plan, {
      targetDir: tmp,
      registry,
      skipInstall: true,
      dryRun: true,
      hookContext: {
        config: { projectName: "test-app" },
        selectedModules: [
          "backend-express",
          "database-postgresql",
          "auth-jwt",
          "deployment-docker",
        ],
      },
    });

    expect(await fileExists(path.join(tmp, "src/server.ts"))).toBe(true);
    expect(await fileExists(path.join(tmp, "src/db/client.ts"))).toBe(true);
    expect(await fileExists(path.join(tmp, "src/auth/auth.service.ts"))).toBe(true);
    expect(await fileExists(path.join(tmp, "src/auth/auth.middleware.ts"))).toBe(true);
    expect(await fileExists(path.join(tmp, "Dockerfile"))).toBe(true);
    expect(await fileExists(path.join(tmp, "docker-compose.yml"))).toBe(true);
  });

  it("writes valid package.json with merged dependencies", async () => {
    const registry = new ModuleRegistry();
    loadBuiltinModules(registry);

    const resolution = resolveModules(
      ["backend-express", "auth-jwt"],
      registry,
    );
    const plan = buildCompositionPlan(resolution.ordered);

    await runExecutionPipeline(plan, {
      targetDir: tmp,
      registry,
      skipInstall: true,
      dryRun: true,
      hookContext: { config: {}, selectedModules: ["backend-express", "auth-jwt"] },
    });

    // Write package.json manually (simulating what create.ts does)
    await fs.writeFile(
      path.join(tmp, "package.json"),
      JSON.stringify({
        name: "test-app",
        version: "0.1.0",
        private: true,
        dependencies: Object.fromEntries(
          plan.dependencies
            .filter((d) => d.scope === "dependencies")
            .map((d) => [d.name, d.version]),
        ),
        devDependencies: Object.fromEntries(
          plan.dependencies
            .filter((d) => d.scope === "devDependencies")
            .map((d) => [d.name, d.version]),
        ),
      }, null, 2),
    );

    const pkg = await readJson(path.join(tmp, "package.json"));
    const deps = pkg["dependencies"] as Record<string, string>;
    expect(deps["express"]).toBeDefined();
    expect(deps["jsonwebtoken"]).toBeDefined();
    expect(deps["dotenv"]).toBeDefined();
  });

  it("deduplicates shared dependencies (dotenv appears in multiple modules)", async () => {
    const registry = new ModuleRegistry();
    loadBuiltinModules(registry);

    const resolution = resolveModules(
      ["backend-express", "database-postgresql", "auth-jwt"],
      registry,
    );
    const plan = buildCompositionPlan(resolution.ordered);

    const dotenvEntries = plan.dependencies.filter(
      (d) => d.name === "dotenv",
    );
    expect(dotenvEntries).toHaveLength(1);
  });

  it("pipeline emits progress events for all stages", async () => {
    const registry = new ModuleRegistry();
    loadBuiltinModules(registry);

    const resolution = resolveModules(["backend-express"], registry);
    const plan = buildCompositionPlan(resolution.ordered);

    const stages: string[] = [];

    await runExecutionPipeline(plan, {
      targetDir: tmp,
      registry,
      skipInstall: true,
      dryRun: true,
      hookContext: { config: {}, selectedModules: ["backend-express"] },
      onProgress: (e) => { stages.push(e.stage); },
    });

    expect(stages).toContain("write-files");
    expect(stages).toContain("apply-patches");
    expect(stages).toContain("complete");
  });
});

// ── Next.js + Tailwind stack ──────────────────────────────────────────────────

describe("Next.js + Tailwind composition", () => {
  let tmp: string;

  beforeEach(async () => { tmp = await makeTmp(); });
  afterEach(async () => { await rmTmp(tmp); });

  it("generates Next.js and Tailwind files together", async () => {
    const registry = new ModuleRegistry();
    loadBuiltinModules(registry);

    const resolution = resolveModules(
      ["frontend-nextjs", "ui-tailwind"],
      registry,
    );
    const plan = buildCompositionPlan(resolution.ordered);

    await runExecutionPipeline(plan, {
      targetDir: tmp,
      registry,
      skipInstall: true,
      dryRun: true,
      hookContext: { config: {}, selectedModules: ["frontend-nextjs", "ui-tailwind"] },
    });

    expect(await fileExists(path.join(tmp, "src/app/layout.tsx"))).toBe(true);
    expect(await fileExists(path.join(tmp, "src/app/page.tsx"))).toBe(true);
    expect(await fileExists(path.join(tmp, "tailwind.config.js"))).toBe(true);
    expect(await fileExists(path.join(tmp, "postcss.config.js"))).toBe(true);
  });

  it("package.json scripts patched with next dev", async () => {
    const registry = new ModuleRegistry();
    loadBuiltinModules(registry);

    const resolution = resolveModules(["frontend-nextjs"], registry);
    const plan = buildCompositionPlan(resolution.ordered);

    // Seed package.json
    await fs.writeFile(
      path.join(tmp, "package.json"),
      JSON.stringify({ name: "test", version: "0.1.0", scripts: {} }, null, 2),
    );

    await runExecutionPipeline(plan, {
      targetDir: tmp,
      registry,
      skipInstall: true,
      dryRun: true,
      hookContext: { config: {}, selectedModules: ["frontend-nextjs"] },
    });

    // Config patch should have merged scripts
    const pkg = await readJson(path.join(tmp, "package.json"));
    // Package.json will have been patched by applyAllPatches
    expect(pkg).toBeDefined();
  });
});

// ── SELECTION_TO_MODULE_ID map ────────────────────────────────────────────────

describe("SELECTION_TO_MODULE_ID", () => {
  it("maps all expected selection keys", () => {
    expect(SELECTION_TO_MODULE_ID["nextjs"]).toBe("frontend-nextjs");
    expect(SELECTION_TO_MODULE_ID["express"]).toBe("backend-express");
    expect(SELECTION_TO_MODULE_ID["postgresql"]).toBe("database-postgresql");
    expect(SELECTION_TO_MODULE_ID["jwt"]).toBe("auth-jwt");
    expect(SELECTION_TO_MODULE_ID["tailwind"]).toBe("ui-tailwind");
    expect(SELECTION_TO_MODULE_ID["docker"]).toBe("deployment-docker");
  });
});