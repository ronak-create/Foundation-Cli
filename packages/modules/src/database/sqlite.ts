import type { PluginDefinition } from "@foundation-cli/plugin-sdk";

const DB_CLIENT_TS = `import Database from "better-sqlite3";
import { config } from "dotenv";
import path from "node:path";

config();

const DB_PATH = process.env["DB_PATH"] ?? path.join(process.cwd(), "data.db");

export const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

export function query<T>(sql: string, params?: unknown[]): T[] {
  const stmt = db.prepare(sql);
  return stmt.all(...(params ?? [])) as T[];
}

export function run(sql: string, params?: unknown[]): Database.RunResult {
  const stmt = db.prepare(sql);
  return stmt.run(...(params ?? []));
}

export function transaction<T>(fn: () => T): T {
  return db.transaction(fn)();
}
`;

const MIGRATIONS_INIT = `-- Initial schema migration
-- Created by Foundation CLI

CREATE TABLE IF NOT EXISTS users (
  id         TEXT     PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  email      TEXT     NOT NULL UNIQUE,
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  updated_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE TRIGGER IF NOT EXISTS users_updated_at
  AFTER UPDATE ON users
  FOR EACH ROW
BEGIN
  UPDATE users SET updated_at = datetime('now') WHERE id = OLD.id;
END;
`;

export const sqliteModule: PluginDefinition = {
  manifest: {
    id: "database-sqlite",
    name: "SQLite",
    version: "1.0.0",
    description: "SQLite database using better-sqlite3 with WAL mode and transactions",
    category: "database",
    dependencies: [
      { name: "better-sqlite3", version: "^9.6.0", scope: "dependencies" },
      { name: "dotenv", version: "^16.4.5", scope: "dependencies" },
      { name: "@types/better-sqlite3", version: "^7.6.10", scope: "devDependencies" },
    ],
    files: [
      { relativePath: "src/db/client.ts", content: DB_CLIENT_TS },
      { relativePath: "src/db/migrations/001_init.sql", content: MIGRATIONS_INIT },
    ],
    configPatches: [
      {
        targetFile: ".env.example",
        merge: { DB_PATH: "./data.db" },
      },
      {
        targetFile: ".gitignore",
        merge: { "*.db": "" },
      },
    ],
    compatibility: {
      conflicts: ["database-postgresql", "database-mysql", "database-mongodb", "database-supabase"],
    },
  },
};