import type { PluginDefinition } from "@foundation-cli/plugin-sdk";

const TAILWIND_CONFIG = `/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  "#f0f9ff",
          500: "#0ea5e9",
          900: "#0c4a6e",
        },
      },
    },
  },
  plugins: [],
};
`;

const POSTCSS_CONFIG = `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`;

const GLOBALS_CSS = `@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  body {
    @apply antialiased;
  }
}
`;

export const tailwindModule: PluginDefinition = {
  manifest: {
    id: "ui-tailwind",
    name: "Tailwind CSS",
    version: "1.0.0",
    description: "Tailwind CSS with PostCSS and Autoprefixer",
    category: "ui",
    dependencies: [
      { name: "tailwindcss", version: "^3.4.4", scope: "devDependencies" },
      { name: "postcss", version: "^8.4.38", scope: "devDependencies" },
      { name: "autoprefixer", version: "^10.4.19", scope: "devDependencies" },
    ],
    files: [
      { relativePath: "tailwind.config.js", content: TAILWIND_CONFIG },
      { relativePath: "postcss.config.js", content: POSTCSS_CONFIG },
      {
        relativePath: "src/styles/globals.css",
        content: GLOBALS_CSS,
      },
    ],
    configPatches: [],
    compatibility: {
      conflicts: ["ui-chakra", "ui-bootstrap"],
    },
  },
};