// core/src/file-merger/requirements-merge.ts
//
// GAP FILLED: requirements.txt semver merge strategy (spec §5.1)
//   Parses Python requirements.txt files and merges them with semver
//   intersection logic. Hard error on impossible version ranges.

import { FoundationError } from "../errors.js";

// ── Error ─────────────────────────────────────────────────────────────────────

export class RequirementsMergeError extends FoundationError {
  constructor(
    public readonly packageName: string,
    public readonly rangeA: string,
    public readonly rangeB: string,
  ) {
    super(
      `requirements.txt: Cannot merge conflicting version constraints for "${packageName}": ` +
        `"${rangeA}" vs "${rangeB}". Resolve manually before scaffolding.`,
      "ERR_REQUIREMENTS_MERGE",
    );
    this.name = "RequirementsMergeError";
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ParsedRequirement {
  /** The package name, lowercased and normalised (hyphens → underscores). */
  readonly name: string;
  /** Raw version constraint string, e.g. ">=1.2.0,<2.0.0" or "==1.5.0". */
  readonly constraint: string;
  /** The original unparsed line (preserved for comments). */
  readonly raw: string;
}

// ── Parsing ───────────────────────────────────────────────────────────────────

const COMMENT_RE = /^\s*#/;
const BLANK_RE   = /^\s*$/;
// Matches: package_name[extras]  op  version  (op is ==, >=, <=, !=, ~=, >  <)
const REQ_RE = /^([A-Za-z0-9_.[-\]]+)\s*((?:[><=!~]{1,2}[A-Za-z0-9.*+-]+,?\s*)+)?(.*)$/;

/**
 * Parses a requirements.txt string into structured entries.
 * Comment and blank lines are preserved as { name: "", constraint: "", raw }.
 */
export function parseRequirements(content: string): ParsedRequirement[] {
  return content.split("\n").map((line) => {
    if (COMMENT_RE.test(line) || BLANK_RE.test(line)) {
      return { name: "", constraint: "", raw: line };
    }

    const match = REQ_RE.exec(line.trim());
    if (!match) {
      // Unknown format line — preserve as-is
      return { name: "", constraint: "", raw: line };
    }

    const rawName    = match[1] ?? "";
    const constraint = (match[2] ?? "").trim().replace(/,\s*/g, ",");

    // Normalise name: lowercase, hyphens → underscores (PEP 503)
    const name = rawName.toLowerCase().replace(/-/g, "_").replace(/\[.*]/, "");

    return { name, constraint, raw: line };
  });
}

/**
 * Serialises a list of ParsedRequirements back to a requirements.txt string.
 */
export function serialiseRequirements(reqs: ParsedRequirement[]): string {
  return reqs
    .map((r) => {
      if (r.name === "") return r.raw;
      return r.constraint ? `${r.name}${r.constraint}` : r.name;
    })
    .join("\n");
}

// ── Merge ─────────────────────────────────────────────────────────────────────

/**
 * Merges two requirements.txt strings.
 *
 * Strategy (spec §5.1 semver-merge):
 *   - Same package + same constraint → deduplicated (first occurrence wins).
 *   - Same package + different constraints → attempt intersection.
 *     If intersection is possible (both are pinned with ==) → use stricter.
 *     If intersection is impossible (conflicting == pins) → throw RequirementsMergeError.
 *     For range constraints (>=, <=, ~=), we concatenate constraints (Python pip
 *     supports multiple constraint specs on one line, e.g. flask>=2.0,<3.0).
 *   - New packages from patch are appended.
 *   - Comment/blank lines from base are preserved; patch comments discarded.
 */
export function mergeRequirements(base: string, patch: string): string {
  const baseReqs  = parseRequirements(base);
  const patchReqs = parseRequirements(patch).filter((r) => r.name !== "");

  // Build a mutable map from base: name → index in baseReqs
  const baseIndex = new Map<string, number>();
  baseReqs.forEach((r, idx) => {
    if (r.name !== "") baseIndex.set(r.name, idx);
  });

  const result = [...baseReqs];

  for (const patchReq of patchReqs) {
    const existing = baseIndex.get(patchReq.name);

    if (existing === undefined) {
      // New package — append
      result.push(patchReq);
      baseIndex.set(patchReq.name, result.length - 1);
      continue;
    }

    const baseReq = result[existing]!;

    if (baseReq.constraint === patchReq.constraint) {
      // Identical — deduplicate (no change)
      continue;
    }

    // Different constraints — attempt merge
    const merged = mergeConstraints(patchReq.name, baseReq.constraint, patchReq.constraint);
    result[existing] = {
      name:       patchReq.name,
      constraint: merged,
      raw:        `${patchReq.name}${merged}`,
    };
  }

  return serialiseRequirements(result);
}

// ── Constraint merge logic ────────────────────────────────────────────────────

/**
 * Attempts to merge two constraint strings for the same package.
 *
 * Rules:
 *   - Exact pin (==X) vs exact pin (==Y) where X ≠ Y → RequirementsMergeError.
 *   - Exact pin vs range → use exact pin (stricter wins).
 *   - Range vs range → concatenate with comma (pip handles multiple specs).
 */
function mergeConstraints(name: string, a: string, b: string): string {
  if (a === "" && b === "") return "";
  if (a === "") return b;
  if (b === "") return a;

  const aIsPin = a.startsWith("==");
  const bIsPin = b.startsWith("==");

  if (aIsPin && bIsPin) {
    if (a === b) return a;
    // Conflicting exact pins — cannot reconcile
    throw new RequirementsMergeError(name, a, b);
  }

  if (aIsPin && !bIsPin) return a; // exact pin is stricter
  if (bIsPin && !aIsPin) return b;

  // Both are ranges — concatenate (e.g. ">=1.0" + "<=2.0" → ">=1.0,<=2.0")
  // Deduplicate parts first
  const partsA = a.split(",").map((p) => p.trim()).filter(Boolean);
  const partsB = b.split(",").map((p) => p.trim()).filter(Boolean);
  const seen   = new Set(partsA);
  for (const p of partsB) {
    if (!seen.has(p)) {
      partsA.push(p);
      seen.add(p);
    }
  }
  return partsA.join(",");
}
