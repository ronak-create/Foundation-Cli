import type { PluginDefinition } from "@foundation-cli/plugin-sdk";

const APP_SVELTE = `<script lang="ts">
  let count = 0;
</script>

<main class="min-h-screen flex flex-col items-center justify-center">
  <h1 class="text-4xl font-bold mb-4">Welcome to <%= projectName %></h1>
  <p class="text-gray-500 mb-6">Your foundation is ready. Start building.</p>
  <button
    class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
    on:click={() => count++}
  >
    count is {count}
  </button>
</main>
`;

const MAIN_TS = `import App from "./App.svelte";
import "./app.css";

const app = new App({ target: document.getElementById("app")! });

export default app;
`;

const APP_CSS = `@tailwind base;
@tailwind components;
@tailwind utilities;
`;

const INDEX_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" href="/favicon.ico" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title><%= projectName %></title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`;

const VITE_CONFIG = `import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: {
      "@": "/src",
    },
  },
});
`;

const SVELTE_CONFIG = `import adapter from "@sveltejs/adapter-auto";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: { adapter: adapter() },
};

export default config;
`;

export const svelteModule: PluginDefinition = {
  manifest: {
    id: "frontend-svelte",
    name: "Svelte",
    version: "1.0.0",
    description: "Svelte 4 with Vite and TypeScript",
    category: "frontend",
    dependencies: [
      { name: "svelte", version: "^4.2.17", scope: "dependencies" },
      { name: "@sveltejs/vite-plugin-svelte", version: "^3.1.0", scope: "devDependencies" },
      { name: "vite", version: "^5.2.0", scope: "devDependencies" },
      { name: "typescript", version: "^5.4.5", scope: "devDependencies" },
      { name: "svelte-check", version: "^3.7.1", scope: "devDependencies" },
    ],
    files: [
      { relativePath: "index.html", content: INDEX_HTML },
      { relativePath: "src/main.ts", content: MAIN_TS },
      { relativePath: "src/App.svelte", content: APP_SVELTE },
      { relativePath: "src/app.css", content: APP_CSS },
      { relativePath: "vite.config.ts", content: VITE_CONFIG },
      { relativePath: "svelte.config.js", content: SVELTE_CONFIG },
    ],
    configPatches: [
      {
        targetFile: "package.json",
        merge: {
          scripts: {
            dev: "vite",
            build: "vite build",
            preview: "vite preview",
            check: "svelte-check --tsconfig ./tsconfig.json",
          },
        },
      },
    ],
    compatibility: {
      conflicts: ["frontend-nextjs", "frontend-react-vite", "frontend-vue"],
    },
  },
};