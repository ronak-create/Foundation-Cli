// packages/testing/src/fixtures.ts
import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { ModuleManifest } from "@foundation-cli/plugin-sdk";

/**
 * Creates a temporary directory and returns its path.
 * Automatically cleaned up when `cleanup()` is called.
 */
export interface TempDir {
  readonly path: string;
  cleanup: () => Promise<void>;
}

export async function createTempDir(): Promise<TempDir> {
  const dirPath = path.join(os.tmpdir(), `foundation-test-${randomUUID()}`);
  await fs.mkdir(dirPath, { recursive: true });
  return {
    path: dirPath,
    cleanup: async () => {
      await fs.rm(dirPath, { recursive: true, force: true });
    },
  };
}

/**
 * Returns a minimal valid ModuleManifest for use in unit tests.
 * Accepts a partial override to customise individual fields.
 */
export function makeManifestFixture(
  overrides: Partial<ModuleManifest> = {},
): ModuleManifest {
  return {
    id: "test-module",
    name: "Test Module",
    version: "1.0.0",
    description: "A fixture module for testing.",
    category: "tooling",
    dependencies: [],
    files: [],
    configPatches: [],
    compatibility: {},
    ...overrides,
  };
}

/**
 * Writes a file relative to `root`, creating parent directories as needed.
 */
export async function writeFixtureFile(
  root: string,
  relativePath: string,
  content: string,
): Promise<string> {
  const absolute = path.join(root, relativePath);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, content, "utf-8");
  return absolute;
}

/**
 * Reads a file relative to `root` and returns its UTF-8 content.
 */
export async function readFixtureFile(
  root: string,
  relativePath: string,
): Promise<string> {
  return fs.readFile(path.join(root, relativePath), "utf-8");
}