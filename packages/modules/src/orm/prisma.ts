import type { PluginDefinition } from "@foundation-cli/plugin-sdk";

const PRISMA_SCHEMA = `// This is your Prisma schema file,
// learn more about it in the docs: https://pris.ly/d/prisma-schema

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
`;

const DB_TS = `import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

// Prevent multiple instances of Prisma Client in development
export const db =
  globalThis.__prisma ??
  new PrismaClient({
    log: process.env["NODE_ENV"] === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env["NODE_ENV"] !== "production") {
  globalThis.__prisma = db;
}
`;

export const prismaModule: PluginDefinition = {
  manifest: {
    id: "orm-prisma",
    name: "Prisma",
    version: "1.0.0",
    description: "Prisma ORM with type-safe database client and migrations",
    category: "orm",
    provides: ["orm", "database-client"],
    // requires: ["database"],
    runtime: "node",
    compatibility: {
      conflicts: ["orm-typeorm", "orm-mongoose"],
      compatibleWith: {
        database: ["database-postgresql", "database-mysql", "database-sqlite", "database-mongodb"],
      },
    },
    dependencies: [
      { name: "@prisma/client", version: "^5.14.0", scope: "dependencies" },
      { name: "prisma",         version: "^5.14.0", scope: "devDependencies" },
    ],
    files: [
      { relativePath: "prisma/schema.prisma", content: PRISMA_SCHEMA },
      { relativePath: "src/lib/db.ts",        content: DB_TS },
    ],
    configPatches: [
      {
        targetFile: "package.json",
        merge: { scripts: { "db:generate": "prisma generate", "db:migrate": "prisma migrate dev", "db:studio": "prisma studio", "db:push": "prisma db push" } },
      },
      {
        targetFile: ".env.example",
        merge: { DATABASE_URL: "postgresql://user:password@localhost:5432/<%= projectName %>" },
      },
    ],
    postInstallInstructions: "Run `npm run db:migrate` to apply your first migration, then `npm run db:generate` to regenerate the Prisma client.",
  },
};