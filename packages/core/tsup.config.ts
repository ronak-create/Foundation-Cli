import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "es2022",
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  external: [],
  // 🚨 IMPORTANT
  ignoreWatch: ["**/__tests__/**", "**/*.test.ts"],
});