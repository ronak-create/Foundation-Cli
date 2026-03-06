import type { PluginDefinition } from "@foundation-cli/plugin-sdk";

const RENDER_YAML = `# render.yaml — Infrastructure as Code for Render.com
# https://render.com/docs/blueprint-spec

services:
  - type: web
    name: <%= projectName %>-api
    runtime: node
    region: oregon
    plan: free
    buildCommand: npm ci && npm run build
    startCommand: npm start
    healthCheckPath: /health
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 3001
      - key: DATABASE_URL
        fromDatabase:
          name: <%= projectName %>-db
          property: connectionString
      - key: JWT_SECRET
        generateValue: true

databases:
  - name: <%= projectName %>-db
    region: oregon
    plan: free
    databaseName: foundation
    user: foundation
`;

export const renderModule: PluginDefinition = {
  manifest: {
    id: "deployment-render",
    name: "Render",
    version: "1.0.0",
    description: "Render Blueprint (render.yaml) with web service and managed PostgreSQL",
    category: "deployment",
    dependencies: [],
    files: [
      { relativePath: "render.yaml", content: RENDER_YAML },
    ],
    configPatches: [
      {
        targetFile: "package.json",
        merge: {
          scripts: {
            "render:validate": "npx @render.com/cli validate render.yaml",
          },
        },
      },
    ],
    compatibility: {
      conflicts: ["deployment-vercel", "deployment-aws"],
    },
  },
};