import fs from "node:fs/promises";
import path from "node:path";
import {
  StateWriteError,
  StateReadError,
} from "../errors.js";
import {
  serialiseLockfile,
  parseLockfile,
  type ProjectLockfile,
  type LockfileModuleEntry,
  type LockfilePluginEntry,
} from "./lockfile.js";
import type { ModuleManifest } from "@foundation-cli/plugin-sdk";

// ── Constants ─────────────────────────────────────────────────────────────────

export const FOUNDATION_DIR = ".foundation";
export const LOCKFILE_NAME = "project.lock";
export const CONFIG_NAME = "foundation.config.json";
export const FOUNDATION_CLI_VERSION = "0.0.1";

export { StateWriteError, StateReadError };

// ── Types ─────────────────────────────────────────────────────────────────────

export type ProjectSelections = Readonly<Record<string, string>>;

export interface FoundationConfig {
  readonly projectName: string;
  readonly createdAt: string;
  readonly selections: ProjectSelections;
  readonly plugins: ReadonlyArray<string>;
}

export interface WriteStateOptions {
  readonly projectRoot: string;
  readonly orderedModules: ReadonlyArray<ModuleManifest>;
  readonly packageManager: string;
  readonly projectName: string;
  readonly selections: ProjectSelections;
  readonly nowIso?: string;
}

export interface ReadStateResult {
  readonly lockfile: ProjectLockfile | null;
  readonly config: FoundationConfig | null;
}

// ── Write (initial) ───────────────────────────────────────────────────────────

export async function writeProjectState(
  options: WriteStateOptions,
): Promise<void> {
  const {
    projectRoot,
    orderedModules,
    packageManager,
    projectName,
    selections,
    nowIso = new Date().toISOString(),
  } = options;

  const foundationDir = path.join(projectRoot, FOUNDATION_DIR);

  try {
    await fs.mkdir(foundationDir, { recursive: true });
  } catch (err) {
    throw new StateWriteError(FOUNDATION_DIR, err);
  }

  const moduleEntries: LockfileModuleEntry[] = orderedModules.map((m) => ({
    id: m.id,
    version: m.version,
  }));

  const lockfile: ProjectLockfile = {
    foundationCliVersion: FOUNDATION_CLI_VERSION,
    generatedAt: nowIso,
    packageManager,
    modules: moduleEntries,
    plugins: [],
  };

  const lockfilePath = path.join(foundationDir, LOCKFILE_NAME);
  try {
    await fs.writeFile(lockfilePath, serialiseLockfile(lockfile), "utf-8");
  } catch (err) {
    throw new StateWriteError(LOCKFILE_NAME, err);
  }

  const config: FoundationConfig = {
    projectName,
    createdAt: nowIso,
    selections,
    plugins: [],
  };

  const configPath = path.join(foundationDir, CONFIG_NAME);
  try {
    await fs.writeFile(configPath, serialiseConfig(config), "utf-8");
  } catch (err) {
    throw new StateWriteError(CONFIG_NAME, err);
  }
}

// ── Plugin state mutations ────────────────────────────────────────────────────

/**
 * Appends a plugin entry to project.lock.
 * Reads the existing lockfile, adds the entry, and writes back atomically.
 * Throws StateWriteError if the lockfile cannot be read or written.
 */
export async function addPluginToLockfile(
  projectRoot: string,
  pluginEntry: LockfilePluginEntry,
): Promise<void> {
  const lockfilePath = path.join(
    projectRoot,
    FOUNDATION_DIR,
    LOCKFILE_NAME,
  );

  let existing: ProjectLockfile;
  try {
    const raw = await fs.readFile(lockfilePath, "utf-8");
    const parsed = parseLockfile(raw);
    if (parsed === null) {
      throw new Error("project.lock is corrupt or missing required fields.");
    }
    existing = parsed;
  } catch (err) {
    throw new StateReadError(LOCKFILE_NAME, err);
  }

  // Deduplicate — silently skip if already present
  if (existing.plugins.some((p) => p.id === pluginEntry.id)) {
    return;
  }

  const updated: ProjectLockfile = {
    ...existing,
    plugins: [...existing.plugins, pluginEntry],
  };

  try {
    await fs.writeFile(lockfilePath, serialiseLockfile(updated), "utf-8");
  } catch (err) {
    throw new StateWriteError(LOCKFILE_NAME, err);
  }
}

/**
 * Appends a plugin id string to foundation.config.json's plugins array.
 * Reads, updates, and writes back atomically.
 */
export async function addPluginToConfig(
  projectRoot: string,
  pluginId: string,
): Promise<void> {
  const configPath = path.join(
    projectRoot,
    FOUNDATION_DIR,
    CONFIG_NAME,
  );

  let existing: FoundationConfig;
  try {
    const raw = await fs.readFile(configPath, "utf-8");
    const parsed = parseConfig(raw);
    if (parsed === null) {
      throw new Error("foundation.config.json is corrupt or missing required fields.");
    }
    existing = parsed;
  } catch (err) {
    throw new StateReadError(CONFIG_NAME, err);
  }

  // Deduplicate
  if (existing.plugins.includes(pluginId)) return;

  const updated: FoundationConfig = {
    ...existing,
    plugins: [...existing.plugins, pluginId],
  };

  try {
    await fs.writeFile(configPath, serialiseConfig(updated), "utf-8");
  } catch (err) {
    throw new StateWriteError(CONFIG_NAME, err);
  }
}

// ── Read ──────────────────────────────────────────────────────────────────────

export async function readProjectState(
  projectRoot: string,
): Promise<ReadStateResult> {
  const foundationDir = path.join(projectRoot, FOUNDATION_DIR);

  const lockfile = await readFileSafe(
    path.join(foundationDir, LOCKFILE_NAME),
  ).then((raw) => (raw !== null ? parseLockfile(raw) : null));

  const config = await readFileSafe(
    path.join(foundationDir, CONFIG_NAME),
  ).then((raw) => (raw !== null ? parseConfig(raw) : null));

  return { lockfile, config };
}

export async function isFoundationProject(
  projectRoot: string,
): Promise<boolean> {
  try {
    await fs.access(
      path.join(projectRoot, FOUNDATION_DIR, LOCKFILE_NAME),
    );
    return true;
  } catch {
    return false;
  }
}

// ── Private helpers ───────────────────────────────────────────────────────────

const CONFIG_KEY_ORDER: ReadonlyArray<keyof FoundationConfig> = [
  "projectName",
  "createdAt",
  "selections",
  "plugins",
];

function serialiseConfig(config: FoundationConfig): string {
  const ordered: Record<string, unknown> = {};
  for (const key of CONFIG_KEY_ORDER) {
    ordered[key] = config[key];
  }
  return JSON.stringify(ordered, null, 2);
}

function parseConfig(raw: string): FoundationConfig | null {
  try {
    const parsed = JSON.parse(raw) as Partial<FoundationConfig>;
    if (
      typeof parsed.projectName !== "string" ||
      typeof parsed.createdAt !== "string" ||
      typeof parsed.selections !== "object" ||
      parsed.selections === null
    ) {
      return null;
    }
    return {
      projectName: parsed.projectName,
      createdAt: parsed.createdAt,
      selections: parsed.selections,
      plugins: Array.isArray(parsed.plugins)
        ? (parsed.plugins as string[])
        : [],
    };
  } catch {
    return null;
  }
}

async function readFileSafe(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new StateReadError(filePath, err);
  }
}
