import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "es2022",
  dts: {
    resolve: true,
    compilerOptions: {
      composite: false,
    },
  },
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
});
