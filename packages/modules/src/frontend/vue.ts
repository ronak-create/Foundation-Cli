import type { PluginDefinition } from "@foundation-cli/plugin-sdk";

const APP_VUE = `<template>
  <main class="min-h-screen flex flex-col items-center justify-center">
    <h1 class="text-4xl font-bold mb-4">Welcome to <%= projectName %></h1>
    <p class="text-gray-500 mb-6">Your foundation is ready. Start building.</p>
    <button
      class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
      @click="count++"
    >
      count is {{ count }}
    </button>
  </main>
</template>

<script setup lang="ts">
import { ref } from "vue";

const count = ref(0);
</script>
`;

const MAIN_TS = `import { createApp } from "vue";
import App from "./App.vue";
import "./style.css";

createApp(App).mount("#app");
`;

const STYLE_CSS = `@tailwind base;
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
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": "/src",
    },
  },
});
`;

export const vueModule: PluginDefinition = {
  manifest: {
    id: "frontend-vue",
    name: "Vue",
    version: "1.0.0",
    description: "Vue 3 with Vite, TypeScript, and Composition API",
    category: "frontend",
    dependencies: [
      { name: "vue", version: "^3.4.27", scope: "dependencies" },
      { name: "@vitejs/plugin-vue", version: "^5.0.4", scope: "devDependencies" },
      { name: "vite", version: "^5.2.0", scope: "devDependencies" },
      { name: "typescript", version: "^5.4.5", scope: "devDependencies" },
      { name: "vue-tsc", version: "^2.0.12", scope: "devDependencies" },
    ],
    files: [
      { relativePath: "index.html", content: INDEX_HTML },
      { relativePath: "src/main.ts", content: MAIN_TS },
      { relativePath: "src/App.vue", content: APP_VUE },
      { relativePath: "src/style.css", content: STYLE_CSS },
      { relativePath: "vite.config.ts", content: VITE_CONFIG },
    ],
    configPatches: [
      {
        targetFile: "package.json",
        merge: {
          scripts: {
            dev: "vite",
            build: "vue-tsc && vite build",
            preview: "vite preview",
          },
        },
      },
      {
        targetFile: "tsconfig.json",
        merge: {
          compilerOptions: {
            target: "ES2020",
            lib: ["ES2020", "DOM", "DOM.Iterable"],
            module: "ESNext",
            moduleResolution: "bundler",
            jsx: "preserve",
            strict: true,
            paths: { "@/*": ["./src/*"] },
          },
        },
      },
    ],
    compatibility: {
      conflicts: ["frontend-nextjs", "frontend-react-vite", "frontend-svelte"],
    },
  },
};