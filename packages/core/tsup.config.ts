import { defineConfig } from "tsup";

export default defineConfig({
  // worker-host.ts must be a separate entry so it emits as dist/worker-host.js.
  // plugin-sandbox.ts references it by path (not via the package index), so it
  // cannot be bundled into dist/index.js — it must exist as a standalone file.
  entry: ["src/index.ts", "src/sandbox/worker-host.ts"],
  format: ["esm"],
  target: "es2022",
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  external: ["ejs", "execa", "ajv", "ajv-formats", "js-yaml", "lodash-es"],
  // 🚨 IMPORTANT
  ignoreWatch: ["**/__tests__/**", "**/*.test.ts"],
});