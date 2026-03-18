import { defineConfig } from "vitest/config";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["src/__tests__/**/*.test.ts"],
    // Ensure worker-host.js exists before any test runs.
    // vitest runs .ts source via esbuild transform, but worker_threads Workers
    // cannot use that transform — they need a real compiled .js file.
    globalSetup: ["src/__tests__/setup/build-worker.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/__tests__/**"],
    },
  },
});