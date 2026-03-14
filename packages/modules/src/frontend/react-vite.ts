import type { PluginDefinition } from "@systemlabs/foundation-plugin-sdk";

const APP_TSX = `import { useState } from "react";

function App() {
  const [count, setCount] = useState(0);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center">
      <h1 className="text-4xl font-bold mb-4">Welcome to <%= projectName %></h1>
      <p className="text-gray-500 mb-6">Your foundation is ready. Start building.</p>
      <button
        onClick={() => setCount((c) => c + 1)}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        count is {count}
      </button>
    </div>
  );
}

export default App;
`;

const MAIN_TSX = `import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.js";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
`;

const INDEX_CSS = `@tailwind base;
@tailwind components;
@tailwind utilities;
`;

const INDEX_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title><%= projectName %></title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;

const VITE_CONFIG = `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": "/src",
    },
  },
});
`;

export const reactViteModule: PluginDefinition = {
  manifest: {
    id: "frontend-react-vite",
    name: "React (Vite)",
    version: "1.0.0",
    description: "React 18 with Vite, TypeScript, and fast HMR",
    category: "frontend",
    dependencies: [
      { name: "react", version: "^18.3.1", scope: "dependencies" },
      { name: "react-dom", version: "^18.3.1", scope: "dependencies" },
      { name: "@vitejs/plugin-react", version: "^4.3.1", scope: "devDependencies" },
      { name: "vite", version: "^5.2.0", scope: "devDependencies" },
      { name: "@types/react", version: "^18.3.1", scope: "devDependencies" },
      { name: "@types/react-dom", version: "^18.3.1", scope: "devDependencies" },
      { name: "typescript", version: "^5.4.5", scope: "devDependencies" },
    ],
    files: [
      { relativePath: "index.html", content: INDEX_HTML },
      { relativePath: "src/main.tsx", content: MAIN_TSX },
      { relativePath: "src/App.tsx", content: APP_TSX },
      { relativePath: "src/index.css", content: INDEX_CSS },
      { relativePath: "vite.config.ts", content: VITE_CONFIG },
    ],
    configPatches: [
      {
        targetFile: "package.json",
        merge: {
          scripts: {
            dev: "vite",
            build: "tsc && vite build",
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
            jsx: "react-jsx",
            strict: true,
            noEmit: true,
            paths: { "@/*": ["./src/*"] },
          },
        },
      },
    ],
    compatibility: {
      conflicts: ["frontend-nextjs", "frontend-vue", "frontend-svelte"],
    },
  },
};
