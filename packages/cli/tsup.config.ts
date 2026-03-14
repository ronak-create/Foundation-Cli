// packages/cli/tsup.config.ts
import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm"],
    target: "es2022",
    dts: true,
    sourcemap: true,
    clean: true,
    splitting: false,
    treeshake: true,
  },
  {
    entry: ["src/bin.ts"],
    format: ["esm"],
    target: "es2022",
    dts: false,
    sourcemap: true,
    clean: false,
    splitting: false,
    banner: {
      js: "#!/usr/bin/env node",
    },
  },
]);
