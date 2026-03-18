/**
 * Vitest globalSetup — compiles worker-host.ts to dist/sandbox/worker-host.js
 * before any tests run. Required because worker_threads Workers cannot use
 * vitest's TypeScript transform; they need a real .js file on disk.
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export async function setup(): Promise<void> {
  const pkgRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../..",   // src/__tests__/setup → src/__tests__ → src → packages/core
  );

  const workerOut = path.join(pkgRoot, "dist", "sandbox", "worker-host.js");

  if (!existsSync(workerOut)) {
    // Build only the worker entry — fast, no full rebuild needed
    execSync("pnpm exec tsup", { cwd: pkgRoot, stdio: "inherit" });
  }
}