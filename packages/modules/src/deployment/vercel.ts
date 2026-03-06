import type { PluginDefinition } from "@foundation-cli/plugin-sdk";

const VERCEL_JSON = JSON.stringify({
  version: 2,
  buildCommand: "npm run build",
  outputDirectory: ".next",
  framework: "nextjs",
  regions: ["iad1"],
  headers: [
    {
      source: "/api/(.*)",
      headers: [
        { key: "Access-Control-Allow-Origin", value: "*" },
        { key: "Access-Control-Allow-Methods", value: "GET,POST,PUT,DELETE,OPTIONS" },
        { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization" },
      ],
    },
  ],
}, null, 2);

const VERCEL_IGNORE = `node_modules
.next
dist
.env.local
.env
*.log
`;

export const vercelModule: PluginDefinition = {
  manifest: {
    id: "deployment-vercel",
    name: "Vercel",
    version: "1.0.0",
    description: "Vercel deployment configuration with Next.js optimisation and CORS headers",
    category: "deployment",
    dependencies: [],
    files: [
      { relativePath: "vercel.json", content: VERCEL_JSON },
      { relativePath: ".vercelignore", content: VERCEL_IGNORE },
    ],
    configPatches: [
      {
        targetFile: "package.json",
        merge: {
          scripts: {
            "vercel:deploy": "vercel --prod",
            "vercel:preview": "vercel",
            "vercel:env": "vercel env pull .env.local",
          },
        },
      },
      {
        targetFile: ".env.example",
        merge: {
          VERCEL_URL: "your-project.vercel.app",
        },
      },
    ],
    compatibility: {
      conflicts: ["deployment-render", "deployment-aws"],
    },
  },
};