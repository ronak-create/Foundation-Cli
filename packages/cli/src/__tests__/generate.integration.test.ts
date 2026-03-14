import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { randomUUID } from "node:crypto";
import {
  ModuleRegistry,
  buildCompositionPlan,
  resolveModules,
  FileTransaction,
} from "@systemlabs/foundation-core";
import type { PluginDefinition } from "@systemlabs/foundation-plugin-sdk";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  return path.join(os.tmpdir(), `foundation-it-${randomUUID()}`);
}

function makePlugin(
  id: string,
  overrides: Partial<PluginDefinition["manifest"]> = {},
): PluginDefinition {
  return {
    manifest: {
      id,
      name: `Module ${id}`,
      version: "1.0.0",
      description: "Integration test module",
      category: "tooling",
      dependencies: [],
      files: [],
      configPatches: [],
      compatibility: {},
      ...overrides,
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Generation pipeline — integration", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = makeTmpDir();
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // ── File writing ────────────────────────────────────────────────────────────

  it("writes staged files atomically to the project root", async () => {
    const txn = new FileTransaction({ projectRoot: tmpDir });
    await txn.open();
    await txn.stage("src/index.ts", "export const x = 1;");
    await txn.stage("README.md", "# Hello");
    await txn.commit();

    const indexContent = await fs.readFile(
      path.join(tmpDir, "src/index.ts"),
      "utf-8",
    );
    const readmeContent = await fs.readFile(
      path.join(tmpDir, "README.md"),
      "utf-8",
    );

    expect(indexContent).toBe("export const x = 1;");
    expect(readmeContent).toBe("# Hello");
  });

  it("creates intermediate directories automatically", async () => {
    const txn = new FileTransaction({ projectRoot: tmpDir });
    await txn.open();
    await txn.stage("a/b/c/deep.ts", "// deep");
    await txn.commit();

    const stat = await fs.stat(path.join(tmpDir, "a/b/c/deep.ts"));
    expect(stat.isFile()).toBe(true);
  });

  it("rolls back successfully on forced error", async () => {
    const txn = new FileTransaction({ projectRoot: tmpDir });
    await txn.open();
    await txn.stage("file.ts", "// staged");
    await txn.rollback();

    // File must NOT exist after rollback
    await expect(
      fs.access(path.join(tmpDir, "file.ts")),
    ).rejects.toThrow();

    expect(txn.state).toBe("rolled-back");
  });

  it("prevents path traversal attempts", async () => {
    const txn = new FileTransaction({ projectRoot: tmpDir });
    await txn.open();
    await expect(
      txn.stage("../../etc/passwd", "evil"),
    ).rejects.toThrow("Path traversal");
  });

  // ── Composition pipeline ────────────────────────────────────────────────────

  it("full pipeline: resolve → plan → write produces correct file structure", async () => {
    const registry = new ModuleRegistry();

    registry.registerModule(
      makePlugin("base", {
        files: [
          { relativePath: "src/index.ts", content: "// base entry" },
          { relativePath: "src/config.ts", content: "// base config" },
        ],
        dependencies: [
          { name: "typescript", version: "^5.0.0", scope: "devDependencies" },
        ],
      }),
    );

    registry.registerModule(
      makePlugin("auth", {
        files: [
          { relativePath: "src/auth/index.ts", content: "// auth module" },
        ],
        dependencies: [
          { name: "jsonwebtoken", version: "^9.0.0", scope: "dependencies" },
        ],
        compatibility: { requires: ["base"] },
      }),
    );

    const result = resolveModules(["auth"], registry);
    const plan = buildCompositionPlan(result.ordered);

    expect(plan.files).toHaveLength(3);
    expect(plan.dependencies).toHaveLength(2);
    expect(result.added).toContain("base");

    // Write to disk
    const txn = new FileTransaction({ projectRoot: tmpDir });
    await txn.open();
    for (const file of plan.files) {
      await txn.stage(file.relativePath, file.content);
    }
    await txn.commit();

    const indexStat = await fs.stat(path.join(tmpDir, "src/index.ts"));
    const authStat = await fs.stat(path.join(tmpDir, "src/auth/index.ts"));

    expect(indexStat.isFile()).toBe(true);
    expect(authStat.isFile()).toBe(true);
  });

  it("deduplicates identical dependencies across modules", async () => {
    const sharedDep = {
      name: "lodash",
      version: "^4.17.21",
      scope: "dependencies" as const,
    };

    const registry = new ModuleRegistry();
    registry.registerModule(makePlugin("mod-a", { dependencies: [sharedDep] }));
    registry.registerModule(makePlugin("mod-b", { dependencies: [sharedDep] }));

    const result = resolveModules(["mod-a", "mod-b"], registry);
    const plan = buildCompositionPlan(result.ordered);

    expect(plan.dependencies).toHaveLength(1);
    expect(plan.dependencies[0]?.name).toBe("lodash");
  });

  // ── Config merging ──────────────────────────────────────────────────────────

  it("JSON merge: deep merges two config objects correctly", async () => {
    const { mergeJson } = await import("@systemlabs/foundation-core");

    const base = JSON.stringify({
      compilerOptions: { strict: true, target: "ES2020" },
      include: ["src"],
    });

    const patch = JSON.stringify({
      compilerOptions: { noEmit: true, target: "ES2022" },
      include: ["tests"],
    });

    const merged = mergeJson(base, patch);
    const parsed = JSON.parse(merged) as Record<string, unknown>;
    const opts = parsed["compilerOptions"] as Record<string, unknown>;

    expect(opts["strict"]).toBe(true);
    expect(opts["noEmit"]).toBe(true);
    expect(opts["target"]).toBe("ES2022");
    // Arrays should be concatenated + deduplicated
    expect(parsed["include"]).toEqual(["src", "tests"]);
  });

  it("JSON merge: throws on incompatible field types", async () => {
    const { mergeJson, MergeConflictError } = await import("@systemlabs/foundation-core");
    const base = JSON.stringify({ scripts: { dev: "vite" } });
    const patch = JSON.stringify({ scripts: "not-an-object" });

    expect(() => mergeJson(base, patch)).toThrowError(MergeConflictError);
  });

  it(".env merge: overwrites existing keys and appends new keys", async () => {
    const { mergeEnv } = await import("@systemlabs/foundation-core");

    const base = "PORT=3000\nDATABASE_URL=postgres://localhost/dev\n";
    const patch = "PORT=4000\nJWT_SECRET=supersecret";

    const merged = mergeEnv(base, patch);
    expect(merged).toContain("PORT=4000");
    expect(merged).toContain("DATABASE_URL=postgres://localhost/dev");
    expect(merged).toContain("JWT_SECRET=supersecret");
  });

  // ── Template rendering ──────────────────────────────────────────────────────

  it("renders EJS templates with provided variables", async () => {
    const { renderTemplate } = await import("@systemlabs/foundation-core");

    const template = `const PROJECT = "<%= projectName %>";\nconst DB = "<%= database %>";`;
    const result = renderTemplate(template, {
      projectName: "my-saas",
      database: "postgresql",
    });

    expect(result).toBe(`const PROJECT = "my-saas";\nconst DB = "postgresql";`);
  });

  it("passes through non-template content unchanged", async () => {
    const { renderTemplate } = await import("@systemlabs/foundation-core");

    const plain = "# Plain markdown with no EJS tags";
    const result = renderTemplate(plain, { anything: "value" });
    expect(result).toBe(plain);
  });

  it("throws TemplateRenderError for malformed EJS", async () => {
    const { renderTemplate, TemplateRenderError } = await import(
      "@systemlabs/foundation-core"
    );

    const broken = "<% if (true %>";
    expect(() => renderTemplate(broken, {})).toThrowError(TemplateRenderError);
  });
});
