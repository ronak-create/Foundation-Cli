import type { PluginDefinition } from "@foundation-cli/plugin-sdk";

const DB_CLIENT_TS = `import mysql from "mysql2/promise";
import { config } from "dotenv";

config();

const {
  DB_HOST = "localhost",
  DB_PORT = "3306",
  DB_USER,
  DB_PASSWORD,
  DB_NAME,
} = process.env;

if (!DB_USER || !DB_PASSWORD || !DB_NAME) {
  throw new Error("DB_USER, DB_PASSWORD, and DB_NAME environment variables are required");
}

export const pool = mysql.createPool({
  host: DB_HOST,
  port: Number(DB_PORT),
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: process.env["NODE_ENV"] === "production" ? { rejectUnauthorized: false } : undefined,
});

export async function query<T>(sql: string, params?: unknown[]): Promise<T[]> {
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(sql, params);
  return rows as T[];
}

export async function closePool(): Promise<void> {
  await pool.end();
}
`;

const MIGRATIONS_INIT = `-- Initial schema migration
-- Created by Foundation CLI

CREATE TABLE IF NOT EXISTS users (
  id         CHAR(36)     PRIMARY KEY DEFAULT (UUID()),
  email      VARCHAR(255) NOT NULL UNIQUE,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
`;

export const mysqlModule: PluginDefinition = {
  manifest: {
    id: "database-mysql",
    name: "MySQL",
    version: "1.0.0",
    description: "MySQL database client using mysql2 with connection pooling",
    category: "database",
    dependencies: [
      { name: "mysql2", version: "^3.9.7", scope: "dependencies" },
      { name: "dotenv", version: "^16.4.5", scope: "dependencies" },
    ],
    files: [
      { relativePath: "src/db/client.ts", content: DB_CLIENT_TS },
      { relativePath: "src/db/migrations/001_init.sql", content: MIGRATIONS_INIT },
    ],
    configPatches: [
      {
        targetFile: ".env.example",
        merge: {
          DB_HOST: "localhost",
          DB_PORT: "3306",
          DB_USER: "root",
          DB_PASSWORD: "secret",
          DB_NAME: "<%= projectName %>",
        },
      },
    ],
    compatibility: {
      conflicts: ["database-postgresql", "database-mongodb", "database-sqlite", "database-supabase"],
    },
  },
};