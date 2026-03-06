/**
 * Archetype-based smart defaults (§9.2 of the architecture spec).
 *
 * When the user picks a project archetype (SaaS, AI App, E-commerce, …),
 * these presets are loaded into the PromptGraph so subsequent questions
 * are pre-answered with sensible defaults. Users still see and can change
 * every selection.
 *
 * Each preset maps prompt node IDs → default selection values.
 * Only node IDs that exist in the current FOUNDATION_GRAPH are meaningful.
 * Unknown keys are ignored gracefully.
 *
 * @module prompt/archetypes
 */

export interface ArchetypePreset {
  /** Human-readable display name. */
  readonly name: string;
  /** Short description shown in the confirmation summary. */
  readonly description: string;
  /** Map of nodeId → default selection value. */
  readonly defaults: Readonly<Record<string, string>>;
}

/**
 * Canonical registry of all supported archetypes.
 *
 * Keys match the `value` field in the projectType prompt choices.
 */
export const ARCHETYPES: Readonly<Record<string, ArchetypePreset>> = {
  saas: {
    name: "SaaS Application",
    description: "Full-stack SaaS with auth, database, and payments-ready setup",
    defaults: {
      frontend: "nextjs",
      backend: "express",
      database: "postgresql",
      auth: "jwt",
      ui: "tailwind",
      stateManagement: "none",
      deployment: "docker",
    },
  },

  "ai-app": {
    name: "AI Application",
    description: "Next.js frontend with an Express API layer for LLM integrations",
    defaults: {
      frontend: "nextjs",
      backend: "express",
      database: "postgresql",
      auth: "jwt",
      ui: "tailwind",
      stateManagement: "none",
      deployment: "docker",
    },
  },

  ecommerce: {
    name: "E-commerce",
    description: "Storefront with PostgreSQL product catalogue and JWT auth",
    defaults: {
      frontend: "nextjs",
      backend: "express",
      database: "postgresql",
      auth: "jwt",
      ui: "tailwind",
      stateManagement: "none",
      deployment: "docker",
    },
  },

  "api-backend": {
    name: "API Backend",
    description: "Headless API service — no frontend, Express + PostgreSQL",
    defaults: {
      frontend: "none",
      backend: "express",
      database: "postgresql",
      auth: "jwt",
      ui: "none",
      stateManagement: "none",
      deployment: "docker",
    },
  },

  "internal-tool": {
    name: "Internal Tool",
    description: "Admin dashboard with Next.js and PostgreSQL, no Docker",
    defaults: {
      frontend: "nextjs",
      backend: "express",
      database: "postgresql",
      auth: "jwt",
      ui: "tailwind",
      stateManagement: "none",
      deployment: "none",
    },
  },

  crm: {
    name: "CRM",
    description: "Customer relationship management with full stack and auth",
    defaults: {
      frontend: "nextjs",
      backend: "express",
      database: "postgresql",
      auth: "jwt",
      ui: "tailwind",
      stateManagement: "none",
      deployment: "docker",
    },
  },

  dashboard: {
    name: "Full-stack Dashboard",
    description: "Data-rich dashboard with Next.js, Express, and PostgreSQL",
    defaults: {
      frontend: "nextjs",
      backend: "express",
      database: "postgresql",
      auth: "jwt",
      ui: "tailwind",
      stateManagement: "none",
      deployment: "docker",
    },
  },

  custom: {
    name: "Custom",
    description: "Configure every choice manually — no smart defaults applied",
    defaults: {},
  },
} as const;

/**
 * Returns the ArchetypePreset for the given projectType value, or `null`
 * if the archetype is unknown (e.g. a future plugin-defined type).
 */
export function getArchetype(projectType: string): ArchetypePreset | null {
  return ARCHETYPES[projectType] ?? null;
}

/**
 * Returns the default value for a specific node in the given archetype.
 * Falls back to `fallback` (usually "none") if the archetype has no opinion.
 */
export function archetypeDefault(
  projectType: string,
  nodeId: string,
  fallback = "none",
): string {
  return ARCHETYPES[projectType]?.defaults[nodeId] ?? fallback;
}