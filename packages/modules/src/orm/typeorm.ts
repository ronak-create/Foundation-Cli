import type { PluginDefinition } from "@foundation-cli/plugin-sdk";

const DATA_SOURCE_TS = `import "reflect-metadata";
import { DataSource } from "typeorm";
import { config } from "dotenv";

config();

export const AppDataSource = new DataSource({
  type: "postgres",
  url: process.env["DATABASE_URL"],
  ssl: process.env["NODE_ENV"] === "production" ? { rejectUnauthorized: false } : false,
  synchronize: process.env["NODE_ENV"] !== "production",
  logging: process.env["NODE_ENV"] === "development",
  entities: ["src/entities/**/*.ts"],
  migrations: ["src/migrations/**/*.ts"],
  subscribers: [],
});
`;

const USER_ENTITY_TS = `import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("users")
export class User {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ unique: true })
  email!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
`;

export const typeormModule: PluginDefinition = {
  manifest: {
    id: "orm-typeorm",
    name: "TypeORM",
    version: "1.0.0",
    description: "TypeORM with decorators and Active Record / Data Mapper patterns",
    category: "orm",
    provides: ["orm", "database-client"],
    // requires: ["database"],
    runtime: "node",
    compatibility: {
      conflicts: ["orm-prisma", "orm-mongoose", "orm-sqlalchemy"],
    },
    dependencies: [
      { name: "typeorm",         version: "^0.3.20", scope: "dependencies" },
      { name: "reflect-metadata", version: "^0.2.2",  scope: "dependencies" },
      { name: "pg",              version: "^8.11.5", scope: "dependencies" },
      { name: "dotenv",          version: "^16.4.5", scope: "dependencies" },
    ],
    files: [
      { relativePath: "src/data-source.ts",        content: DATA_SOURCE_TS },
      { relativePath: "src/entities/User.entity.ts", content: USER_ENTITY_TS },
    ],
    configPatches: [
      {
        targetFile: "package.json",
        merge: { scripts: { "migration:run": "typeorm migration:run -d src/data-source.ts", "migration:revert": "typeorm migration:revert -d src/data-source.ts" } },
      },
      {
        targetFile: "tsconfig.json",
        merge: { compilerOptions: { experimentalDecorators: true, emitDecoratorMetadata: true } },
      },
      {
        targetFile: ".env.example",
        merge: { DATABASE_URL: "postgresql://user:password@localhost:5432/<%= projectName %>" },
      },
    ],
    postInstallInstructions: "Add `import 'reflect-metadata'` at the top of your entry file. Run `npm run migration:run` to sync your schema.",
  },
};