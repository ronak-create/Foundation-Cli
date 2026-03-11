import type { PluginDefinition } from "@foundation-cli/plugin-sdk";

const DB_TS = `import mongoose from "mongoose";
import { config } from "dotenv";

config();

const MONGODB_URI = process.env["MONGODB_URI"];

if (!MONGODB_URI) {
  throw new Error("MONGODB_URI environment variable is required");
}

let isConnected = false;

export async function connectDB(): Promise<void> {
  if (isConnected) return;

  await mongoose.connect(MONGODB_URI, {
    bufferCommands: false,
  });

  isConnected = true;
  console.log("MongoDB connected");
}

export async function disconnectDB(): Promise<void> {
  if (!isConnected) return;
  await mongoose.disconnect();
  isConnected = false;
}
`;

const USER_MODEL_TS = `import mongoose, { type Document, Schema } from "mongoose";

export interface IUser extends Document {
  email: string;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  },
  { timestamps: true },
);

export const User = mongoose.models.User ?? mongoose.model<IUser>("User", UserSchema);
`;

export const mongooseModule: PluginDefinition = {
  manifest: {
    id: "orm-mongoose",
    name: "Mongoose",
    version: "1.0.0",
    description: "Mongoose ODM for MongoDB with schema validation and TypeScript support",
    category: "orm",
    provides: ["orm", "database-client"],
    // requires: ["database"],
    runtime: "node",
    compatibility: {
      conflicts: ["orm-prisma", "orm-typeorm", "orm-sqlalchemy"],
      compatibleWith: {
        database: ["database-mongodb"],
      },
    },
    dependencies: [
      { name: "mongoose", version: "^8.4.0", scope: "dependencies" },
      { name: "dotenv",   version: "^16.4.5", scope: "dependencies" },
    ],
    files: [
      { relativePath: "src/lib/db.ts",           content: DB_TS },
      { relativePath: "src/models/User.model.ts", content: USER_MODEL_TS },
    ],
    configPatches: [
      {
        targetFile: ".env.example",
        merge: { MONGODB_URI: "mongodb://localhost:27017/<%= projectName %>" },
      },
    ],
    postInstallInstructions: "Call `connectDB()` at app startup. Mongoose models are auto-registered on first import.",
  },
};