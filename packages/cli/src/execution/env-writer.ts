/**
 * Env Writer — writes .env and .env.example to the generated project root.
 *
 * ── Merge strategy (critical) ─────────────────────────────────────────────────
 *
 * There are two sources of env content:
 *
 *   1. Module manifest configPatches  — written by the pipeline BEFORE this
 *      runs. They contain placeholder/default values like:
 *        MONGODB_URI=mongodb://localhost:27017
 *        JWT_SECRET=change-me-to-a-long-random-secret-in-production
 *
 *   2. Collected credentials          — real values entered (or auto-generated)
 *      by the user during the Configuration prompt phase.
 *
 * Rule: COLLECTED CREDENTIALS ALWAYS WIN.
 *
 * For .env (never committed):
 *   - Credential keys OVERWRITE placeholder values written by module patches.
 *   - Non-credential keys from the pipeline (e.g. PORT, NODE_ENV) are preserved.
 *
 * For .env.example (committed, redacted):
 *   - Credential keys OVERWRITE the placeholder values written by module patches.
 *   - Ensures .env.example shows correct structure instead of generic placeholders.
 *
 * Called AFTER the pipeline so it can read and upgrade what the pipeline wrote.
 *
 * @module execution/env-writer
 */

import fs from "node:fs/promises";
import path from "node:path";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface EnvWriteOptions {
  /** Absolute path to the generated project root. */
  readonly targetDir: string;
  /** Real credential values — written verbatim to .env. */
  readonly envVars: Readonly<Record<string, string>>;
  /** Redacted/placeholder values — written to .env.example. */
  readonly exampleVars: Readonly<Record<string, string>>;
}

// ── Serialiser ─────────────────────────────────────────────────────────────────

function serialise(vars: Readonly<Record<string, string>>): string {
  return Object.entries(vars)
    .map(([k, v]) => {
      const needsQuotes =
        v.includes(" ") ||
        v.includes('"') ||
        v.includes("'") ||
        v.includes("\n") ||
        v.includes("#");
      if (needsQuotes) {
        const escaped = v.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        return `${k}="${escaped}"`;
      }
      return `${k}=${v}`;
    })
    .join("\n");
}

// ── Override-merge ──────────────────────────────────────────────────────────────

/**
 * Merges incoming vars into an existing .env file string.
 *
 * INCOMING WINS for keys that appear in both — this ensures user-supplied
 * credentials always replace module-default placeholders.
 * Keys only in the existing file are preserved unchanged.
 * Keys only in incoming are appended at the bottom.
 */
function overrideMerge(
  existing: string,
  incoming: Readonly<Record<string, string>>,
): string {
  if (Object.keys(incoming).length === 0) return existing;

  const incomingKeys = new Set(Object.keys(incoming));
  const writtenKeys = new Set<string>();
  const resultLines: string[] = [];

  for (const line of existing.split("\n")) {
    const trimmed = line.trim();

    if (trimmed === "" || trimmed.startsWith("#")) {
      resultLines.push(line);
      continue;
    }

    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) {
      resultLines.push(line);
      continue;
    }

    const key = line.slice(0, eqIdx).trim();
    writtenKeys.add(key);

    if (incomingKeys.has(key)) {
      const newValue = incoming[key] ?? "";
      const needsQuotes =
        newValue.includes(" ") ||
        newValue.includes('"') ||
        newValue.includes("'") ||
        newValue.includes("\n") ||
        newValue.includes("#");
      resultLines.push(
        needsQuotes
          ? `${key}="${newValue.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
          : `${key}=${newValue}`,
      );
    } else {
      resultLines.push(line);
    }
  }

  // Append keys that didn't exist in the file yet
  const newEntries = Object.entries(incoming).filter(([k]) => !writtenKeys.has(k));
  if (newEntries.length > 0) {
    const lastLine = resultLines[resultLines.length - 1]?.trim() ?? "";
    if (lastLine !== "") resultLines.push("");
    resultLines.push("# Credentials collected by Foundation CLI");
    resultLines.push(serialise(Object.fromEntries(newEntries)));
  }

  return resultLines.join("\n");
}

// ── Main entry ─────────────────────────────────────────────────────────────────

/**
 * Writes (or override-merges into) .env and .env.example.
 *
 * If files already exist (written by the module pipeline's configPatches),
 * credential values OVERRIDE the placeholder values so the user sees their
 * actual inputs in the generated project.
 */
export async function writeEnvFiles(options: EnvWriteOptions): Promise<void> {
  const { targetDir, envVars, exampleVars } = options;

  if (
    Object.keys(envVars).length === 0 &&
    Object.keys(exampleVars).length === 0
  ) {
    return;
  }

  await fs.mkdir(targetDir, { recursive: true });

  await writeWithOverride(
    path.join(targetDir, ".env"),
    envVars,
    "# Environment variables — DO NOT COMMIT\n# Generated by Foundation CLI\n",
  );

  await writeWithOverride(
    path.join(targetDir, ".env.example"),
    exampleVars,
    "# Environment variable template — safe to commit\n# Copy to .env and fill in real values\n",
  );
}

async function writeWithOverride(
  filePath: string,
  vars: Readonly<Record<string, string>>,
  header: string,
): Promise<void> {
  let existing: string | null = null;

  try {
    existing = await fs.readFile(filePath, "utf-8");
  } catch {
    // File doesn't exist yet — will be created fresh
  }

  const content =
    existing === null || existing.trim() === ""
      ? `${header}\n${serialise(vars)}\n`
      : overrideMerge(existing, vars);

  await fs.writeFile(filePath, content, "utf-8");
}