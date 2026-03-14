/**
 * Phase 1 — Credential System Tests
 *
 * Tests credential definitions, validation logic, derivation,
 * the collectCredentials() runner, and the env-writer override-merge fix.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  getCredentialGroup,
  getRequiredCredentialGroups,
  CREDENTIAL_MAP,
} from "../prompt/credentials.js";
import { collectCredentials } from "../prompt/credential-collector.js";
import { writeEnvFiles } from "../execution/env-writer.js";
import type { PromptAdapter } from "../prompt/graph.js";

// ── Stub adapter ───────────────────────────────────────────────────────────────

function makeStubAdapter(answers: Record<string, string>): PromptAdapter {
  return {
    async select() { return "none"; },
    async text({ message }) {
      const key = Object.keys(answers).find((k) =>
        message.toLowerCase().includes(k.toLowerCase()),
      );
      return key ? answers[key]! : "";
    },
    async confirm() { return true; },
  };
}

// ── Unit: CREDENTIAL_MAP ───────────────────────────────────────────────────────

describe("CREDENTIAL_MAP", () => {
  it("has an entry for every expected module selection", () => {
    const expectedKeys = [
      "postgresql", "mysql", "mongodb", "supabase",
      "jwt", "session", "clerk", "auth0", "oauth",
      "stripe", "redis", "openai",
    ];
    for (const key of expectedKeys) {
      expect(CREDENTIAL_MAP).toHaveProperty(key);
    }
  });

  it("all entries have a heading and at least one field", () => {
    for (const [key, group] of Object.entries(CREDENTIAL_MAP)) {
      expect(group.heading, `${key} missing heading`).toBeTruthy();
      expect(group.fields.length, `${key} has no fields`).toBeGreaterThan(0);
    }
  });

  it("all fields have envKey and label", () => {
    for (const [key, group] of Object.entries(CREDENTIAL_MAP)) {
      for (const field of group.fields) {
        expect(field.envKey, `${key} field missing envKey`).toBeTruthy();
        expect(field.label, `${key} field missing label`).toBeTruthy();
      }
    }
  });
});

// ── Unit: getCredentialGroup ───────────────────────────────────────────────────

describe("getCredentialGroup", () => {
  it("returns group for known selections", () => {
    expect(getCredentialGroup("postgresql")).toBeDefined();
    expect(getCredentialGroup("jwt")).toBeDefined();
    expect(getCredentialGroup("stripe")).toBeDefined();
  });

  it("returns undefined for selections with no credentials", () => {
    expect(getCredentialGroup("tailwind")).toBeUndefined();
    expect(getCredentialGroup("none")).toBeUndefined();
    expect(getCredentialGroup("express")).toBeUndefined();
    expect(getCredentialGroup("nextjs")).toBeUndefined();
  });
});

// ── Unit: getRequiredCredentialGroups ──────────────────────────────────────────

describe("getRequiredCredentialGroups", () => {
  it("returns only groups for selections that need credentials", () => {
    const result = getRequiredCredentialGroups([
      "nextjs", "express", "mongodb", "jwt", "tailwind", "none",
    ]);
    const keys = result.map((r) => r.selectionValue);
    expect(keys).toContain("mongodb");
    expect(keys).toContain("jwt");
    expect(keys).not.toContain("nextjs");
    expect(keys).not.toContain("express");
    expect(keys).not.toContain("tailwind");
  });

  it("de-duplicates repeated selection values", () => {
    const result = getRequiredCredentialGroups(["mongodb", "mongodb"]);
    expect(result.length).toBe(1);
  });

  it("returns empty array when nothing needs credentials", () => {
    expect(getRequiredCredentialGroups(["nextjs", "tailwind", "none"])).toHaveLength(0);
  });
});

// ── Unit: validators ───────────────────────────────────────────────────────────

describe("credential validators", () => {
  describe("postgresql port", () => {
    const f = CREDENTIAL_MAP["postgresql"]!.fields.find((f) => f.envKey === "POSTGRES_PORT")!;
    it("accepts valid ports", () => {
      expect(f.validate!("5432")).toBe(true);
      expect(f.validate!("1")).toBe(true);
      expect(f.validate!("65535")).toBe(true);
    });
    it("rejects invalid ports", () => {
      expect(f.validate!("abc")).not.toBe(true);
      expect(f.validate!("0")).not.toBe(true);
      expect(f.validate!("65536")).not.toBe(true);
    });
  });

  describe("mongodb URI", () => {
    const f = CREDENTIAL_MAP["mongodb"]!.fields.find((f) => f.envKey === "MONGODB_URI")!;
    it("accepts mongodb:// and mongodb+srv://", () => {
      expect(f.validate!("mongodb://localhost:27017/db")).toBe(true);
      expect(f.validate!("mongodb+srv://cluster.mongodb.net/db")).toBe(true);
    });
    it("rejects non-mongo URIs", () => {
      expect(f.validate!("postgres://localhost")).not.toBe(true);
      expect(f.validate!("localhost:27017")).not.toBe(true);
    });
  });

  describe("JWT secret", () => {
    const f = CREDENTIAL_MAP["jwt"]!.fields.find((f) => f.envKey === "JWT_SECRET")!;
    it("accepts blank (triggers auto-generate)", () => {
      expect(f.validate!("")).toBe(true);
    });
    it("accepts 32+ char secrets", () => {
      expect(f.validate!("a".repeat(32))).toBe(true);
    });
    it("rejects non-empty secrets shorter than 32 chars", () => {
      expect(f.validate!("short")).not.toBe(true);
    });
  });

  describe("Clerk keys", () => {
    const pk = CREDENTIAL_MAP["clerk"]!.fields.find((f) => f.envKey === "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY")!;
    const sk = CREDENTIAL_MAP["clerk"]!.fields.find((f) => f.envKey === "CLERK_SECRET_KEY")!;
    it("pk_ prefix for publishable key", () => {
      expect(pk.validate!("pk_test_abc123")).toBe(true);
      expect(pk.validate!("sk_test_abc123")).not.toBe(true);
    });
    it("sk_ prefix for secret key", () => {
      expect(sk.validate!("sk_live_abc123")).toBe(true);
      expect(sk.validate!("pk_test_abc123")).not.toBe(true);
    });
  });

  describe("Stripe keys", () => {
    const sk = CREDENTIAL_MAP["stripe"]!.fields.find((f) => f.envKey === "STRIPE_SECRET_KEY")!;
    const pk = CREDENTIAL_MAP["stripe"]!.fields.find((f) => f.envKey === "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY")!;
    it("sk_ for secret key", () => {
      expect(sk.validate!("sk_test_abc")).toBe(true);
      expect(sk.validate!("pk_test_abc")).not.toBe(true);
    });
    it("pk_ for publishable key", () => {
      expect(pk.validate!("pk_test_abc")).toBe(true);
      expect(pk.validate!("sk_test_abc")).not.toBe(true);
    });
  });
});

// ── Integration: collectCredentials ───────────────────────────────────────────

describe("collectCredentials", () => {
  it("returns empty maps when no credentials needed", async () => {
    const adapter = makeStubAdapter({});
    const result = await collectCredentials(["nextjs", "tailwind", "none"], adapter);
    expect(result.envVars).toEqual({});
    expect(result.exampleVars).toEqual({});
  });

  it("auto-generates blank JWT secret", async () => {
    const adapter: PromptAdapter = {
      async select() { return "none"; },
      async text({ message }) {
        if (message.toLowerCase().includes("secret")) return "";
        if (message.toLowerCase().includes("expiry")) return "1d";
        return "";
      },
      async confirm() { return true; },
    };
    const result = await collectCredentials(["jwt"], adapter);
    expect(result.envVars["JWT_SECRET"]).toBeTruthy();
    expect(result.envVars["JWT_SECRET"]!.length).toBeGreaterThanOrEqual(32);
    expect(result.envVars["JWT_EXPIRES_IN"]).toBe("1d");
    // Secret must be redacted in .env.example
    expect(result.exampleVars["JWT_SECRET"]).not.toBe(result.envVars["JWT_SECRET"]);
    // Non-secret expiry preserved in .env.example
    expect(result.exampleVars["JWT_EXPIRES_IN"]).toBe("1d");
  });

  it("collects MongoDB URI and does NOT expose it in .env.example", async () => {
    const adapter: PromptAdapter = {
      async select() { return "none"; },
      async text() { return "mongodb+srv://user:pass@cluster.mongodb.net/mydb"; },
      async confirm() { return true; },
    };
    const result = await collectCredentials(["mongodb"], adapter);
    expect(result.envVars["MONGODB_URI"]).toBe(
      "mongodb+srv://user:pass@cluster.mongodb.net/mydb",
    );
    // MongoDB URI is a secret — should be redacted
    expect(result.exampleVars["MONGODB_URI"]).not.toContain("pass");
  });

  it("derives DATABASE_URL from PostgreSQL parts", async () => {
    const adapter: PromptAdapter = {
      async select() { return "none"; },
      async text({ message }) {
        const m = message.toLowerCase();
        if (m.includes("host"))     return "db.example.com";
        if (m.includes("port"))     return "5432";
        if (m.includes("database")) return "myapp";
        if (m.includes("username")) return "admin";
        if (m.includes("password")) return "s3cr3t";
        return "";
      },
      async confirm() { return true; },
    };
    const result = await collectCredentials(["postgresql"], adapter);
    expect(result.envVars["DATABASE_URL"]).toBe(
      "postgresql://admin:s3cr3t@db.example.com:5432/myapp",
    );
    expect(result.exampleVars["DATABASE_URL"]).not.toContain("s3cr3t");
  });

  it("derives REDIS_URL without password", async () => {
    const adapter: PromptAdapter = {
      async select() { return "none"; },
      async text({ message }) {
        const m = message.toLowerCase();
        if (m.includes("host"))     return "localhost";
        if (m.includes("port"))     return "6379";
        if (m.includes("password")) return "";
        return "";
      },
      async confirm() { return true; },
    };
    const result = await collectCredentials(["redis"], adapter);
    expect(result.envVars["REDIS_URL"]).toBe("redis://localhost:6379");
  });

  it("derives REDIS_URL with password", async () => {
    const adapter: PromptAdapter = {
      async select() { return "none"; },
      async text({ message }) {
        const m = message.toLowerCase();
        if (m.includes("host"))     return "redis.example.com";
        if (m.includes("port"))     return "6380";
        if (m.includes("password")) return "mypass";
        return "";
      },
      async confirm() { return true; },
    };
    const result = await collectCredentials(["redis"], adapter);
    expect(result.envVars["REDIS_URL"]).toBe("redis://:mypass@redis.example.com:6380");
  });

  it("CI mode skips prompts and auto-generates secrets", async () => {
    const adapter: PromptAdapter = {
      async select() { return "none"; },
      async text() { throw new Error("Should not prompt in CI mode"); },
      async confirm() { return true; },
    };
    const result = await collectCredentials(["jwt"], adapter, true);
    expect(result.envVars["JWT_SECRET"]).toBeTruthy();
    expect(result.envVars["JWT_EXPIRES_IN"]).toBe("7d"); // default
  });
});

// ── Integration: env-writer override-merge (THE BUG FIX) ─────────────────────

describe("writeEnvFiles — override-merge", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "foundation-env-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("creates .env and .env.example from scratch when files don't exist", async () => {
    await writeEnvFiles({
      targetDir: tmpDir,
      envVars: { MONGODB_URI: "mongodb+srv://user:pass@cluster/db" },
      exampleVars: { MONGODB_URI: "<your-mongodb-uri>" },
    });

    const env = await fs.readFile(path.join(tmpDir, ".env"), "utf-8");
    const example = await fs.readFile(path.join(tmpDir, ".env.example"), "utf-8");

    expect(env).toContain("MONGODB_URI=mongodb+srv://user:pass@cluster/db");
    expect(example).toContain("MONGODB_URI=<your-mongodb-uri>");
  });

  it("OVERRIDES placeholder values written by module patches", async () => {
    // Simulate what the module pipeline writes first (the bug scenario)
    await fs.writeFile(
      path.join(tmpDir, ".env"),
      "MONGODB_URI=mongodb://localhost:27017\nDB_NAME=my-app\n",
    );
    await fs.writeFile(
      path.join(tmpDir, ".env.example"),
      "MONGODB_URI=mongodb://localhost:27017\nDB_NAME=my-app\n",
    );

    // Now the credential collector runs with the real values
    await writeEnvFiles({
      targetDir: tmpDir,
      envVars: { MONGODB_URI: "mongodb+srv://user:pass@cluster/db" },
      exampleVars: { MONGODB_URI: "<your-mongodb-uri>" },
    });

    const env = await fs.readFile(path.join(tmpDir, ".env"), "utf-8");
    const example = await fs.readFile(path.join(tmpDir, ".env.example"), "utf-8");

    // Real value must WIN over the placeholder
    expect(env).toContain("MONGODB_URI=mongodb+srv://user:pass@cluster/db");
    expect(env).not.toContain("MONGODB_URI=mongodb://localhost:27017");

    // Redacted placeholder must WIN over the module default
    expect(example).toContain("MONGODB_URI=<your-mongodb-uri>");
    expect(example).not.toContain("MONGODB_URI=mongodb://localhost:27017");

    // Non-credential keys from the module patch must be PRESERVED
    expect(env).toContain("DB_NAME=my-app");
    expect(example).toContain("DB_NAME=my-app");
  });

  it("reproduces the exact bug scenario from the user report", async () => {
    // This is what the module pipeline wrote before the fix
    const moduleOutput = [
      "# Express Server",
      "PORT=3001",
      "NODE_ENV=development",
      "CORS_ORIGIN=http://localhost:3000",
      "",
      "NEXT_PUBLIC_APP_URL=http://localhost:3000",
      "MONGODB_URI=mongodb://localhost:27017",
      "DB_NAME=my-app",
      "JWT_SECRET=change-me-to-a-long-random-secret-in-production",
      "JWT_EXPIRES_IN=7d",
    ].join("\n");

    await fs.writeFile(path.join(tmpDir, ".env"), moduleOutput);
    await fs.writeFile(path.join(tmpDir, ".env.example"), moduleOutput);

    const realJwtSecret = "a".repeat(64);

    await writeEnvFiles({
      targetDir: tmpDir,
      envVars: {
        MONGODB_URI: "mongodb+srv://ronakparmar2428_db_user:abc123ronak@cluster0.xukooqr.mongodb.net/?appName=Cluster0",
        JWT_SECRET: realJwtSecret,
        JWT_EXPIRES_IN: "1d",
      },
      exampleVars: {
        MONGODB_URI: "<your-mongodb-uri>",
        JWT_SECRET: "<auto-generated-leave-blank-to-generate>",
        JWT_EXPIRES_IN: "1d",
      },
    });

    const env = await fs.readFile(path.join(tmpDir, ".env"), "utf-8");

    // Real credentials must appear
    expect(env).toContain("mongodb+srv://ronakparmar2428_db_user:abc123ronak");
    expect(env).toContain(`JWT_SECRET=${realJwtSecret}`);
    expect(env).toContain("JWT_EXPIRES_IN=1d");

    // Placeholders must NOT appear
    expect(env).not.toContain("mongodb://localhost:27017");
    expect(env).not.toContain("change-me-to-a-long-random-secret-in-production");
    expect(env).not.toContain("JWT_EXPIRES_IN=7d");

    // Non-credential module keys must be preserved
    expect(env).toContain("PORT=3001");
    expect(env).toContain("NODE_ENV=development");
    expect(env).toContain("CORS_ORIGIN=http://localhost:3000");
  });

  it("appends new credential keys not present in module output", async () => {
    await fs.writeFile(
      path.join(tmpDir, ".env"),
      "PORT=3001\nNODE_ENV=development\n",
    );

    await writeEnvFiles({
      targetDir: tmpDir,
      envVars: { OPENAI_API_KEY: "sk-abc123" },
      exampleVars: { OPENAI_API_KEY: "<your-openai-api-key>" },
    });

    const env = await fs.readFile(path.join(tmpDir, ".env"), "utf-8");
    expect(env).toContain("PORT=3001");
    expect(env).toContain("OPENAI_API_KEY=sk-abc123");
  });

  it("handles values with special characters correctly", async () => {
    await writeEnvFiles({
      targetDir: tmpDir,
      envVars: { DB_PASS: 'p@ss"word #1' },
      exampleVars: { DB_PASS: "<your-password>" },
    });
    const env = await fs.readFile(path.join(tmpDir, ".env"), "utf-8");
    // Should be quoted
    expect(env).toContain('DB_PASS=');
    expect(env).toContain('p@ss');
  });

  it("does nothing when both maps are empty", async () => {
    await writeEnvFiles({ targetDir: tmpDir, envVars: {}, exampleVars: {} });
    const files = await fs.readdir(tmpDir);
    expect(files).toHaveLength(0);
  });
});

