import type { PluginDefinition } from "@systemlabs/foundation-plugin-sdk";

const DB_CLIENT_TS = `import { Pool } from "pg";
import { config } from "dotenv";

config();

const connectionString = process.env["DATABASE_URL"];

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required");
}

export const pool = new Pool({
  connectionString,
  ssl:
    process.env["NODE_ENV"] === "production"
      ? { rejectUnauthorized: false }
      : false,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 2_000,
});

export async function query<T extends object>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const client = await pool.connect();
  try {
    const result = await client.query<T>(text, params);
    return result.rows;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}
`;

const MIGRATIONS_INIT = `-- Initial schema migration
-- Created by Foundation CLI

CREATE TABLE IF NOT EXISTS users (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

// const ENV_EXAMPLE = `# PostgreSQL
// DATABASE_URL=postgresql://user:password@localhost:5432/<%= projectName %>
// `;

export const postgresqlModule: PluginDefinition = {
  manifest: {
    id: "database-postgresql",
    name: "PostgreSQL",
    version: "1.0.0",
    description: "PostgreSQL database client using node-postgres (pg)",
    category: "database",
    dependencies: [
      { name: "pg", version: "^8.11.5", scope: "dependencies" },
      { name: "dotenv", version: "^16.4.5", scope: "dependencies" },
      { name: "@types/pg", version: "^8.11.6", scope: "devDependencies" },
    ],
    files: [
      { relativePath: "src/db/client.ts", content: DB_CLIENT_TS },
      { relativePath: "src/db/migrations/001_init.sql", content: MIGRATIONS_INIT },
    ],
    configPatches: [
      {
        targetFile: ".env.example",
        merge: {
          DATABASE_URL: "postgresql://user:password@localhost:5432/<%= projectName %>",
        },
      },
    ],
    compatibility: {
      conflicts: ["database-mysql", "database-mongodb", "database-sqlite"],
    },
  },
};

