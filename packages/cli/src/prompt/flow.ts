/**
 * runPromptFlow — the top-level entry point for the interactive CLI session.
 *
 * Orchestrates:
 *   1. Printing the banner + section headers via renderer.
 *   2. Executing the FOUNDATION_GRAPH through the PromptGraph engine.
 *   3. Showing a structured confirmation summary.
 *   4. Returning a typed UserSelection for consumption by create.ts.
 *
 * This module owns the shape of UserSelection and RawSelections — the types
 * consumed by create.ts and the test suite. It does NOT own the prompt
 * questions themselves (graph-definition.ts) or the @inquirer adapter
 * (adapter.ts) — keeping concerns separated.
 *
 * @module prompt/flow
 */

import chalk from "chalk";
import { runPromptGraph, type SelectionMap } from "./graph.js";
import { buildFoundationGraph } from "./graph-definition.js";
import { inquirerAdapter } from "./adapter.js";
import { getArchetype } from "./archetypes.js";
import { printBanner, printSection, printSummaryTable, printAbort } from "../ui/renderer.js";
import type { ModuleRegistry } from "@foundation-cli/core";
import { collectCredentials, type CollectedCredentials } from "./credential-collector.js";

// ── Public types ───────────────────────────────────────────────────────────────

/**
 * The seven stack selections that drive module resolution.
 * Keys correspond to SELECTION_TO_MODULE_ID in @foundation-cli/modules.
 */
export interface RawSelections {
  readonly frontend: string;
  readonly backend: string;
  readonly database: string;
  readonly auth: string;
  readonly ui: string;
  readonly stateManagement: string;
  readonly deployment: string;
}

/**
 * Fully-resolved result of the interactive prompt flow.
 * Consumed by create.ts to drive the execution pipeline.
 */
export interface UserSelection {
  /** Validated project name (trimmed, lowercase). */
  readonly projectName: string;
  /** Archetype value (e.g. "saas", "api-backend", "custom"). */
  readonly projectType: string;
  /** The seven module selections. */
  readonly rawSelections: RawSelections;
  /** Ordered list of selected module IDs (derived from rawSelections). */
  readonly selectedModules: ReadonlyArray<string>;
  /** Credentials collected in the second-pass prompt phase (Phase 1). */
  readonly credentials: CollectedCredentials;
}

// ── Display labels ─────────────────────────────────────────────────────────────

/**
 * Canonical label map used by the confirmation summary.
 * Keys are selection values; values are human-readable display strings.
 */
const DISPLAY_LABELS: Readonly<Record<string, string>> = {
  // Frontends
  nextjs: "Next.js",
  "react-vite": "React + Vite",
  vue: "Vue 3",
  svelte: "Svelte",
  // Backends
  express: "Express",
  nestjs: "NestJS",
  fastapi: "FastAPI",
  django: "Django",
  // Databases
  postgresql: "PostgreSQL",
  mysql: "MySQL",
  mongodb: "MongoDB",
  sqlite: "SQLite",
  supabase: "Supabase",
  // Auth
  jwt: "JWT",
  oauth: "OAuth (Google + GitHub)",
  session: "Session-based",
  clerk: "Clerk",
  auth0: "Auth0",
  // UI
  tailwind: "Tailwind CSS",
  shadcn: "ShadCN/UI",
  mui: "Material UI",
  chakra: "Chakra UI",
  bootstrap: "Bootstrap",
  // State
  zustand: "Zustand",
  redux: "Redux Toolkit",
  "tanstack-query": "TanStack Query",
  // Deployment
  docker: "Docker",
  vercel: "Vercel",
  render: "Render",
  aws: "AWS",
  // Archetypes
  saas: "SaaS Application",
  "ai-app": "AI Application",
  ecommerce: "E-commerce",
  crm: "CRM",
  dashboard: "Full-stack Dashboard",
  "api-backend": "API Backend",
  "internal-tool": "Internal Tool",
  custom: "Custom",
  // Catch-all
  none: "None",
};

function labelOf(value: string): string {
  return DISPLAY_LABELS[value] ?? value;
}

// ── Flow ───────────────────────────────────────────────────────────────────────

/**
 * Runs the full interactive prompt flow and returns a `UserSelection`.
 *
 * Sections are visually grouped:
 *   1. Project Setup   — name + archetype
 *   2. Stack Selection — frontend / backend / database
 *   3. Auth & UI       — auth / ui / state management
 *   4. Deployment      — deployment target
 *   5. Summary         — confirmation table
 *
 * @param adapter  Dependency-injected PromptAdapter. Defaults to the
 *                 production @inquirer/prompts adapter. Tests pass a stub.
 */
// ── PromptFlowOptions ──────────────────────────────────────────────────────────

export interface PromptFlowOptions {
  /** Injected adapter (overrides default inquirerAdapter — useful for testing). */
  readonly adapter?: typeof inquirerAdapter;
  /**
   * Module registry. When provided, module status is read from manifests to:
   *   - Append [experimental] / [deprecated] labels to choices (spec §11.3)
   *   - Block experimental modules in CI unless allowExperimental is set
   */
  readonly registry?: ModuleRegistry;
  /** When true, suppress interactive prompts and use archetype defaults (CI mode). */
  readonly ciMode?: boolean;
  /** Allow experimental modules in CI (requires --allow-experimental flag). */
  readonly allowExperimental?: boolean;
  /** Preset archetype to use in CI mode (e.g. "saas", "api-backend"). */
  readonly preset?: string;
}

export async function runPromptFlow(
  optionsOrAdapter: PromptFlowOptions | typeof inquirerAdapter = {},
): Promise<UserSelection> {
  // Back-compat: allow passing adapter directly (old call signature)
  const options: PromptFlowOptions =
    "select" in optionsOrAdapter ? { adapter: optionsOrAdapter } : optionsOrAdapter;

  const {
    adapter = inquirerAdapter,
    registry,
    ciMode = false,
    allowExperimental = false,
  } = options;
  printBanner();

  // ── 1. Print first section header before running the graph ────────────────
  printSection("Project Setup");

  // Build a fresh graph instance (ensures onAnswer mutations don't carry over
  // between invocations in long-running processes or test suites).
  const graph = buildFoundationGraph();

  // Wrap the adapter to inject section headers at the right moments.
  // We do this by interposing before the graph runner's first call for each
  // section-boundary node.
  const instrumentedAdapter = withSectionHeaders(adapter);

  const answers: SelectionMap = await runPromptGraph(graph, instrumentedAdapter);

  // ── 2. Build RawSelections from SelectionMap ───────────────────────────────
  const rawSelections: RawSelections = {
    frontend: answers["frontend"] ?? "none",
    backend: answers["backend"] ?? "none",
    database: answers["database"] ?? "none",
    auth: answers["auth"] ?? "none",
    ui: answers["ui"] ?? "none",
    stateManagement: answers["stateManagement"] ?? "none",
    deployment: answers["deployment"] ?? "none",
  };

  const projectName = (answers["projectName"] ?? "my-app").trim();
  const projectType = answers["projectType"] ?? "custom";

  // ── 2b. Status enforcement (spec §11.3) ───────────────────────────────────
  // When a registry is available, check each selection's manifest status.
  // - experimental: warn always; hard-error in CI unless --allow-experimental
  // - deprecated:   always warn with successor info
  // - removed:      hard error with migration guide URL
  if (registry) {
    const { SELECTION_TO_MODULE_ID } = await import("@foundation-cli/modules");

    const map = SELECTION_TO_MODULE_ID as Record<string, string>;

    for (const selectionValue of Object.values(rawSelections)) {
      if (!selectionValue || selectionValue === "none") continue;

      const moduleId = selectionValue in map ? map[selectionValue] : selectionValue;
      if (!registry.hasModule(moduleId)) continue;
      const manifest = registry.getModule(moduleId)?.manifest;
      if (!manifest) continue;
      const status = manifest.status ?? "stable";

      if (status === "removed") {
        const url = `https://foundation.build/migrations/${moduleId}`;
        throw new Error(`Module "${manifest.name}" has been removed. See migration guide: ${url}`);
      }
      if (status === "deprecated") {
        process.stderr.write(
          chalk.yellow(
            `⚠  ${manifest.name} is deprecated and will be removed in a future release.\n`,
          ),
        );
      }
      if (status === "experimental") {
        if (ciMode && !allowExperimental) {
          throw new Error(
            `Module "${manifest.name}" is experimental. Pass --allow-experimental to use it in CI mode.`,
          );
        }
        process.stderr.write(
          chalk.dim(`ℹ  ${manifest.name} is [experimental] and may change without notice.\n`),
        );
      }
    }
  }

  // ── 3. Confirmation summary ────────────────────────────────────────────────
  printSection("Summary");

  const archetype = getArchetype(projectType);

  printSummaryTable([
    { label: "Project", value: projectName },
    { label: "Type", value: archetype?.name ?? labelOf(projectType) },
    { label: "Frontend", value: labelOf(rawSelections.frontend) },
    { label: "Backend", value: labelOf(rawSelections.backend) },
    { label: "Database", value: labelOf(rawSelections.database) },
    { label: "Auth", value: labelOf(rawSelections.auth) },
    { label: "UI System", value: labelOf(rawSelections.ui) },
    { label: "State Mgmt", value: labelOf(rawSelections.stateManagement) },
    { label: "Deployment", value: labelOf(rawSelections.deployment) },
  ]);

  // ── 4. Confirmation gate ───────────────────────────────────────────────────
  const confirmed = await adapter.confirm({
    message: chalk.white("Generate this project?"),
    defaultValue: true,
  });

  if (!confirmed) {
    printAbort();
    process.exit(0);
  }

  // ── 5. Derive ordered module list ─────────────────────────────────────────
  // selectionsToModuleIds lives in @foundation-cli/modules and is called
  // in create.ts. Here we expose the raw ordered list as `selectedModules`
  // so callers (and tests) can inspect it without re-deriving it.
  const selectedModules = deriveModuleList(rawSelections);

  // ── 6. Collect credentials (Phase 1 — second-pass prompt phase) ───────────
  // After the user confirms their stack, we run a second prompt pass that
  // asks for credentials required by each selected module (e.g. DB passwords,
  // API keys). This is kept separate from stack selection to preserve clean
  // UX separation: choose stack first, configure it second.
  const allSelectionValues = Object.values(rawSelections);
  const credentials = await collectCredentials(allSelectionValues, adapter, ciMode);

  return {
    projectName,
    projectType,
    rawSelections,
    selectedModules,
    credentials,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Derives a stable ordered list of non-"none" selection values from
 * RawSelections. This is NOT the final module ID list (that requires the
 * registry's SELECTION_TO_MODULE_ID map) but gives the caller a clean
 * ordered summary.
 *
 * Ordering: frontend → backend → database → auth → ui → stateManagement → deployment
 */
function deriveModuleList(raw: RawSelections): ReadonlyArray<string> {
  return [
    raw.frontend,
    raw.backend,
    raw.database,
    raw.auth,
    raw.ui,
    raw.stateManagement,
    raw.deployment,
  ].filter((v) => v !== "none");
}

/**
 * Wraps a PromptAdapter to inject printSection() calls at section boundaries.
 *
 * Section headers are emitted just before the first node in each section.
 * The boundary is determined by node insertion order matching the graph.
 *
 * Node → Section mapping:
 *   projectName, projectType  → (already printed before graph runs)
 *   frontend, backend, database → "Stack Selection"
 *   auth, ui, stateManagement   → "Auth & UI"
 *   deployment                  → "Deployment"
 *
 * This wrapping approach keeps section-header logic out of the graph runner
 * (which shouldn't know about UI) while preserving the clean DAG structure.
 */
function withSectionHeaders(base: typeof inquirerAdapter): typeof inquirerAdapter {
  // Track which sections have already been announced.
  const announced = new Set<string>();

  function maybeAnnounce(nodeHint: string): void {
    let section: string | null = null;

    if (
      (nodeHint === "frontend" || nodeHint === "backend" || nodeHint === "database") &&
      !announced.has("stack")
    ) {
      section = "Stack Selection";
      announced.add("stack");
    } else if (
      (nodeHint === "auth" || nodeHint === "ui" || nodeHint === "stateManagement") &&
      !announced.has("auth-ui")
    ) {
      section = "Auth & UI";
      announced.add("auth-ui");
    } else if (nodeHint === "deployment" && !announced.has("deployment")) {
      section = "Deployment";
      announced.add("deployment");
    }

    if (section !== null) {
      printSection(section);
    }
  }

  return {
    async select(opts) {
      // Infer the node from the message text by checking for keyword prefixes.
      // This is a lightweight heuristic — a future phase can pass node.id explicitly.
      const msg = opts.message.toLowerCase();
      if (msg.includes("frontend")) maybeAnnounce("frontend");
      else if (msg.includes("backend")) maybeAnnounce("backend");
      else if (msg.includes("database")) maybeAnnounce("database");
      else if (msg.includes("auth")) maybeAnnounce("auth");
      else if (msg.includes("ui system")) maybeAnnounce("ui");
      else if (msg.includes("state")) maybeAnnounce("stateManagement");
      else if (msg.includes("deployment")) maybeAnnounce("deployment");
      return base.select(opts);
    },
    async text(opts) {
      return base.text(opts);
    },
    async confirm(opts) {
      return base.confirm(opts);
    },
  };
}
