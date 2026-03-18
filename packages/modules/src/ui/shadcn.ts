import type { PluginDefinition } from "@systemlabs/foundation-plugin-sdk";

const TAILWIND_CONFIG = `import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        border:     "hsl(var(--border))",
        input:      "hsl(var(--input))",
        ring:       "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT:    "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT:    "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT:    "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT:    "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT:    "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        card: {
          DEFAULT:    "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT:    "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
`;

const GLOBALS_CSS = `@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 222.2 84% 4.9%;
    --radius: 0.5rem;
  }
  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --primary: 210 40% 98%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
  }
}
`;

const UTILS_TS = `import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
`;

const COMPONENTS_JSON = JSON.stringify({
  $schema: "https://ui.shadcn.com/schema.json",
  style: "default",
  rsc: true,
  tsx: true,
  tailwind: {
    config: "tailwind.config.ts",
    css: "src/app/globals.css",
    baseColor: "slate",
    cssVariables: true,
  },
  aliases: {
    components: "@/components",
    utils: "@/lib/utils",
  },
}, null, 2);

export const shadcnModule: PluginDefinition = {
  manifest: {
    id: "ui-shadcn",
    name: "ShadCN/UI",
    version: "1.0.0",
    description: "ShadCN/UI with Tailwind CSS variables, dark mode tokens, and utility helpers",
    category: "ui",
    dependencies: [
      { name: "tailwindcss", version: "^3.4.4", scope: "devDependencies" },
      { name: "tailwindcss-animate", version: "^1.0.7", scope: "devDependencies" },
      { name: "postcss", version: "^8.4.38", scope: "devDependencies" },
      { name: "autoprefixer", version: "^10.4.19", scope: "devDependencies" },
      { name: "clsx", version: "^2.1.1", scope: "dependencies" },
      { name: "tailwind-merge", version: "^2.3.0", scope: "dependencies" },
      { name: "class-variance-authority", version: "^0.7.0", scope: "dependencies" },
      { name: "lucide-react", version: "^0.395.0", scope: "dependencies" },
      { name: "@radix-ui/react-slot", version: "^1.0.2", scope: "dependencies" },
    ],
    files: [
      { relativePath: "tailwind.config.ts", content: TAILWIND_CONFIG },
      { relativePath: "src/app/globals.css", content: GLOBALS_CSS, overwrite: true },
      { relativePath: "src/lib/utils.ts", content: UTILS_TS },
      { relativePath: "components.json", content: COMPONENTS_JSON },
    ],
    configPatches: [],
    compatibility: {
      conflicts: ["ui-chakra", "ui-bootstrap", "ui-mui"],
    },
  },
};