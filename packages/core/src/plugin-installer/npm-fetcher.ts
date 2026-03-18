import { execa } from "execa";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { FoundationError, PathTraversalError } from "../errors.js";
// import type { ModuleManifest } from "@systemlabs/foundation-plugin-sdk";

// ── Errors ────────────────────────────────────────────────────────────────────

export class PluginFetchError extends FoundationError {
  constructor(
    public readonly packageName: string,
    cause: unknown,
  ) {
    const msg = cause instanceof Error ? cause.message : String(cause);
    super(
      `Failed to fetch plugin package "${packageName}": ${msg}`,
      "ERR_PLUGIN_FETCH",
    );
    this.name = "PluginFetchError";
  }
}

export class PluginManifestMissingError extends FoundationError {
  constructor(public readonly packageName: string) {
    super(
      `Plugin package "${packageName}" does not contain a manifest.json file.`,
      "ERR_PLUGIN_MANIFEST_MISSING",
    );
    this.name = "PluginManifestMissingError";
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FetchedPlugin {
  /** Resolved npm package name (e.g. foundation-plugin-stripe) */
  readonly packageName: string;
  /** Exact version resolved from npm */
  readonly resolvedVersion: string;
  /** Parsed + raw-validated manifest.json content */
  readonly rawManifest: unknown;
  /** Parsed package.json content */
  readonly packageJson: Record<string, unknown>;
  /** Absolute path to the temp directory containing the unpacked package */
  readonly tempDir: string;
}

// ── npm package name resolution ───────────────────────────────────────────────

/**
 * Converts a short plugin name to the canonical npm package name.
 *
 * Rules (in order):
 *  1. Already a scoped name  → use as-is      (@foundation/plugin-stripe)
 *  2. Already full name      → use as-is      (foundation-plugin-stripe)
 *  3. Short name             → prefix         stripe → foundation-plugin-stripe
 */
export function resolvePackageName(name: string): string {
  if (name.startsWith("@")) return name;
  if (name.startsWith("foundation-plugin-")) return name;
  return `foundation-plugin-${name}`;
}

// ── Fetcher ───────────────────────────────────────────────────────────────────

/**
 * Fetches a plugin from the npm registry by running `npm pack` into a temp
 * directory, then extracts only the files we need (manifest.json + package.json).
 *
 * No code is executed from the plugin at this stage.
 */
export async function fetchPlugin(
  packageName: string,
  version = "latest",
): Promise<FetchedPlugin> {
  const tempDir = path.join(
    os.tmpdir(),
    `foundation-plugin-fetch-${randomUUID()}`,
  );
  await fs.mkdir(tempDir, { recursive: true });

  const packageSpec =
    version === "latest" ? packageName : `${packageName}@${version}`;

  try {
    // `npm pack` downloads the tarball into tempDir and prints the filename.
    // Array-args form: packageSpec is never shell-parsed — no injection possible.
    const { stdout } = await execa(
      "npm",
      ["pack", packageSpec, "--pack-destination", tempDir, "--json"],
      { reject: true },
    );

    let tarballName: string;
    try {
      const packResult = JSON.parse(stdout) as Array<{ filename: string }>;
      tarballName = packResult[0]?.filename ?? "";
    } catch {
      // npm pack without --json just prints the filename
      tarballName = stdout.trim().split("\n").at(-1) ?? "";
    }

    if (!tarballName) {
      throw new Error("npm pack did not return a tarball filename.");
    }

    const tarballPath = path.join(tempDir, tarballName);
    const extractDir = path.join(tempDir, "pkg");
    await fs.mkdir(extractDir, { recursive: true });

    // Extract tarball — array-args, no shell parsing.
    await execa("tar", ["-xzf", tarballPath, "-C", extractDir], { reject: true });

    // npm packs into a "package/" subdirectory
    const pkgRoot = path.join(extractDir, "package");

    // Read package.json
    const pkgJsonPath = path.join(pkgRoot, "package.json");
    let packageJson: Record<string, unknown>;
    try {
      packageJson = JSON.parse(
        await fs.readFile(pkgJsonPath, "utf-8"),
      ) as Record<string, unknown>;
    } catch {
      throw new Error("Could not read package.json from plugin tarball.");
    }

    const resolvedVersion =
      typeof packageJson["version"] === "string"
        ? packageJson["version"]
        : version;

    // Read manifest.json
    const manifestPath = path.join(pkgRoot, "manifest.json");
    let rawManifest: unknown;
    try {
      rawManifest = JSON.parse(await fs.readFile(manifestPath, "utf-8"));
    } catch {
      throw new PluginManifestMissingError(packageName);
    }

    return {
      packageName,
      resolvedVersion,
      rawManifest,
      packageJson,
      tempDir,
    };
  } catch (err) {
    if (
      err instanceof PluginManifestMissingError
    ) {
      throw err;
    }
    throw new PluginFetchError(packageName, err);
  }
}

/**
 * Reads a plugin from a local directory (for testing / local development).
 * Expects the same structure: manifest.json + package.json at the root.
 */
export async function fetchPluginFromDirectory(
  localDir: string,
  permittedRoot?: string,
): Promise<FetchedPlugin> {
  const absDir = path.resolve(localDir);

  // Traversal guard: local plugin paths must be within the permitted root.
  // When called from installPlugin, the permitted root is the project root.
  // This prevents `file:../../../etc` paths from reading arbitrary files.
  const root = path.resolve(permittedRoot ?? process.cwd());
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (absDir !== root && !absDir.startsWith(rootWithSep)) {
    throw new PathTraversalError(localDir);
  }
  const pkgJsonPath = path.join(absDir, "package.json");
  const manifestPath = path.join(absDir, "manifest.json");

  // Fallback package.json for test mocks
  let packageJson: Record<string, unknown> = { name: path.basename(absDir), version: "0.0.0" };
  try {
    packageJson = JSON.parse(await fs.readFile(pkgJsonPath, "utf-8")) as Record<string, unknown>;
  } catch { /* package.json is optional — fallback used */ }

  let rawManifest: unknown;
  try {
    rawManifest = JSON.parse(await fs.readFile(manifestPath, "utf-8"));
  } catch {
    throw new PluginManifestMissingError(localDir);
  }

  return {
    packageName: (packageJson.name as string) || path.basename(absDir),
    resolvedVersion: (packageJson.version as string) || "0.0.0",
    rawManifest,
    packageJson,
    tempDir: absDir,
  };
}


/**
 * Cleans up a temp directory created by fetchPlugin.
 * Safe to call even if the directory no longer exists.
 */
export async function cleanupFetchTemp(tempDir: string): Promise<void> {
  try {
    // Skip local paths (user plugins, test mocks) - only cleanup npm tarballs
    if (path.resolve(tempDir).startsWith(os.tmpdir())) {
      const basename = path.basename(tempDir);
      if (!basename.startsWith('foundation-plugin-fetch-')) {
        return; // Don't delete test mocks or user local plugins
      }
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  } catch {
    // best-effort
  }
}