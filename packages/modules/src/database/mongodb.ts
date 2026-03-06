import type { PluginDefinition } from "@foundation-cli/plugin-sdk";

const DB_CLIENT_TS = `import { MongoClient, type Db } from "mongodb";
import { config } from "dotenv";

config();

const MONGODB_URI = process.env["MONGODB_URI"];
const DB_NAME = process.env["DB_NAME"];

if (!MONGODB_URI || !DB_NAME) {
  throw new Error("MONGODB_URI and DB_NAME environment variables are required");
}

let client: MongoClient;
let db: Db;

export async function connect(): Promise<Db> {
  if (db) return db;
  client = new MongoClient(MONGODB_URI!, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
  });
  await client.connect();
  db = client.db(DB_NAME);
  return db;
}

export async function getDb(): Promise<Db> {
  if (!db) await connect();
  return db;
}

export async function disconnect(): Promise<void> {
  await client?.close();
}
`;

const MIGRATIONS_INIT = `/**
 * MongoDB initialisation script.
 * Run with: mongosh $MONGODB_URI --file src/db/migrations/001_init.js
 */

db.createCollection("users");
db.users.createIndex({ email: 1 }, { unique: true });
`;

export const mongodbModule: PluginDefinition = {
  manifest: {
    id: "database-mongodb",
    name: "MongoDB",
    version: "1.0.0",
    description: "MongoDB client using the official Node.js driver with connection pooling",
    category: "database",
    dependencies: [
      { name: "mongodb", version: "^6.6.2", scope: "dependencies" },
      { name: "dotenv", version: "^16.4.5", scope: "dependencies" },
    ],
    files: [
      { relativePath: "src/db/client.ts", content: DB_CLIENT_TS },
      { relativePath: "src/db/migrations/001_init.js", content: MIGRATIONS_INIT },
    ],
    configPatches: [
      {
        targetFile: ".env.example",
        merge: {
          MONGODB_URI: "mongodb://localhost:27017",
          DB_NAME: "<%= projectName %>",
        },
      },
    ],
    compatibility: {
      conflicts: ["database-postgresql", "database-mysql", "database-sqlite", "database-supabase"],
    },
  },
};