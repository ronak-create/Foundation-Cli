import type { PluginDefinition } from "@systemlabs/foundation-plugin-sdk";

const SERVER_TS = `import express from "express";
import cors from "cors";
import helmet from "helmet";
import { config } from "dotenv";

config();

const app = express();
const PORT = process.env["PORT"] ?? 3001;

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(\`Server running on http://localhost:\${PORT}\`);
});

export default app;
`;

// const TSCONFIG_SERVER = JSON.stringify(
//   {
//     compilerOptions: {
//       target: "ES2022",
//       module: "NodeNext",
//       moduleResolution: "NodeNext",
//       lib: ["ES2022"],
//       outDir: "dist",
//       rootDir: "src",
//       strict: true,
//       noImplicitAny: true,
//       esModuleInterop: true,
//       skipLibCheck: true,
//       declaration: true,
//       declarationMap: true,
//       sourceMap: true,
//       resolveJsonModule: true,
//     },
//     include: ["src/**/*"],
//     exclude: ["node_modules", "dist"],
//   },
//   null,
//   2,
// );

const ENV_EXAMPLE = `# Express Server
PORT=3001
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000
`;

export const expressModule: PluginDefinition = {
  manifest: {
    id: "backend-express",
    name: "Express",
    version: "1.0.0",
    description: "Express.js server with TypeScript, CORS, and Helmet",
    category: "backend",
    dependencies: [
      { name: "express", version: "^4.19.2", scope: "dependencies" },
      { name: "cors", version: "^2.8.5", scope: "dependencies" },
      { name: "helmet", version: "^7.1.0", scope: "dependencies" },
      { name: "dotenv", version: "^16.4.5", scope: "dependencies" },
      { name: "@types/express", version: "^4.17.21", scope: "devDependencies" },
      { name: "@types/cors", version: "^2.8.17", scope: "devDependencies" },
      { name: "typescript", version: "^5.4.5", scope: "devDependencies" },
      { name: "tsx", version: "^4.11.0", scope: "devDependencies" },
    ],
    files: [
      { relativePath: "src/server.ts", content: SERVER_TS },
      // { relativePath: "tsconfig.json", content: TSCONFIG_SERVER },
      { relativePath: ".env.example", content: ENV_EXAMPLE },
    ],
    configPatches: [
      {
        targetFile: "package.json",
        merge: {
          scripts: {
            dev: "tsx watch src/server.ts",
            build: "tsc",
            start: "node dist/server.js",
          },
        },
      },
      {
        targetFile: "tsconfig.json",
        merge: {
          compilerOptions: {
            paths: {
              "@/*": ["./src/*"],
              // "@backend/*": ["./src/backend/*"],
            },
          },
        },
      },
    ],
    compatibility: {
      conflicts: ["backend-fastapi", "backend-nestjs", "backend-django"],
    },
  },
};

