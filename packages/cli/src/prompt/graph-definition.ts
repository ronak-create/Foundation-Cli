/**
 * FOUNDATION_GRAPH — canonical PromptGraph for `foundation create`.
 *
 * This is the authoritative ordered list of PromptNodes that drives the
 * interactive CLI session. Every choice value maps 1-to-1 with the keys in
 * SELECTION_TO_MODULE_ID from @systemlabs/foundation-modules.
 *
 * Node ordering matters: nodes earlier in the array can influence `when`
 * predicates and `onAnswer` hooks of later nodes. The DAG structure is:
 *
 *   projectName
 *       │
 *   projectType ──onAnswer──► injects archetype defaults into all downstream
 *       │                     nodes via `defaultValue` mutation
 *   frontend
 *       │
 *   backend
 *       │
 *   database
 *       │
 *   auth
 *       │
 *   ui      ← when: frontend !== "none"
 *       │
 *   stateManagement ← when: frontend !== "none"
 *       │
 *   deployment
 *
 * @module prompt/graph-definition
 */

import chalk from "chalk";
import type { PromptGraph, PromptNode } from "./graph.js";
import { archetypeDefault } from "./archetypes.js";

// ── Choice catalogues ──────────────────────────────────────────────────────────
//
// Each catalogue is an exhaustive list of options for its category. Every
// entry that has a matching module ID in SELECTION_TO_MODULE_ID will produce
// real scaffolded files. Entries without a matching module ID are shown to the
// user but silently filtered out by selectionsToModuleIds (graceful degradation
// allows the prompt catalogue to grow ahead of module availability).

const FRONTEND_CHOICES = [
  { name: "Next.js",       value: "nextjs",      hint: "App Router · TypeScript · SSR/SSG" },
  { name: "React + Vite",  value: "react-vite",  hint: "SPA · Fast HMR · TypeScript"      },
  { name: "Vue 3",         value: "vue",         hint: "Composition API · TypeScript"      },
  { name: "Svelte",        value: "svelte",      hint: "Compiler-first · Minimal bundle"   },
  { name: "None",          value: "none",        hint: "API-only / headless"               },
] as const;

const BACKEND_CHOICES = [
  { name: "Express",          value: "express",  hint: "Minimal · Batteries not included" },
  { name: "NestJS",           value: "nestjs",   hint: "Angular-style · Decorators · DI"  },
  { name: "FastAPI (Python)", value: "fastapi",  hint: "Async · Auto-docs · Pydantic"     },
  { name: "Django (Python)",  value: "django",   hint: "Batteries included · ORM"         },
  { name: "None",             value: "none",     hint: "Frontend-only / serverless"       },
] as const;

const DATABASE_CHOICES = [
  { name: "PostgreSQL",  value: "postgresql",  hint: "ACID · JSON · Full-text search" },
  { name: "MySQL",       value: "mysql",       hint: "Widely hosted · Strict mode"    },
  { name: "MongoDB",     value: "mongodb",     hint: "Document store · Flexible schema"},
  { name: "SQLite",      value: "sqlite",      hint: "Zero-config · Embedded · Dev/CI"},
  { name: "Supabase",    value: "supabase",    hint: "Postgres + Auth + Storage"      },
  { name: "None",        value: "none",        hint: "In-memory / external / BYO"    },
] as const;

const AUTH_CHOICES = [
  { name: "JWT",                     value: "jwt",     hint: "Stateless · Signed tokens" },
  { name: "OAuth (Google + GitHub)", value: "oauth",   hint: "Social login · Passport.js" },
  { name: "Session-based",           value: "session", hint: "Cookie sessions · express-session"},
  { name: "Clerk",                   value: "clerk",   hint: "Hosted · Drop-in UI components"},
  { name: "Auth0",                   value: "auth0",   hint: "Enterprise SSO · Hosted"},
  { name: "None",                    value: "none",    hint: "Public API / handled elsewhere"},
] as const;

const UI_CHOICES = [
  { name: "Tailwind CSS",  value: "tailwind",  hint: "Utility-first · Zero runtime" },
  { name: "ShadCN/UI",    value: "shadcn",    hint: "Radix + Tailwind · Copy-paste" },
  { name: "Material UI",  value: "mui",       hint: "Google design system · Rich API"},
  { name: "Chakra UI",    value: "chakra",    hint: "Accessible · Theme tokens"     },
  { name: "Bootstrap",    value: "bootstrap", hint: "Classic · Global CSS"          },
  { name: "None",         value: "none",      hint: "Custom CSS / no UI library"   },
] as const;

const STATE_CHOICES = [
  { name: "Zustand",        value: "zustand",        hint: "Tiny · Hooks-first · No boilerplate"},
  { name: "Redux Toolkit",  value: "redux",          hint: "Predictable · DevTools · Middleware"},
  { name: "TanStack Query", value: "tanstack-query", hint: "Server-state · Cache · Pagination"  },
  { name: "None",           value: "none",           hint: "React state / Context is enough"    },
] as const;

const DEPLOYMENT_CHOICES = [
  { name: "Docker",  value: "docker",  hint: "Dockerfile + Compose · Portable" },
  { name: "Vercel",  value: "vercel",  hint: "Zero-config · Edge · Next.js-native"},
  { name: "Render",  value: "render",  hint: "Managed containers · Free tier"   },
  { name: "AWS",     value: "aws",     hint: "ECS/ECR + ALB · Production-grade"  },
  { name: "None",    value: "none",    hint: "CI/CD to be configured manually"  },
] as const;

const PROJECT_TYPE_CHOICES = [
  { name: "SaaS Application",     value: "saas",          hint: "Next.js · Express · PostgreSQL · JWT · Docker" },
  { name: "AI Application",       value: "ai-app",        hint: "Next.js · Express · PostgreSQL · JWT · Docker" },
  { name: "E-commerce",           value: "ecommerce",     hint: "Next.js · Express · PostgreSQL · JWT · Stripe"  },
  { name: "CRM",                  value: "crm",           hint: "Next.js · Express · PostgreSQL · JWT · Docker"  },
  { name: "Full-stack Dashboard", value: "dashboard",     hint: "Next.js · Express · PostgreSQL · JWT · Docker"  },
  { name: "API Backend",          value: "api-backend",   hint: "Express · PostgreSQL · JWT · Docker (no UI)"    },
  { name: "Internal Tool",        value: "internal-tool", hint: "Next.js · Express · PostgreSQL · JWT (no Docker)"},
  { name: "Custom",               value: "custom",        hint: "Configure every choice manually"                },
] as const;

// ── Name validator ─────────────────────────────────────────────────────────────

function validateProjectName(value: string): string | true {
  const trimmed = value.trim();
  if (trimmed.length === 0) return "Project name cannot be empty.";
  if (trimmed.length > 214) return "Project name exceeds npm's 214-character limit.";
  if (!/^[a-z0-9][a-z0-9-_.]*$/.test(trimmed)) {
    return "Use lowercase letters, numbers, hyphens, underscores, or dots only.";
  }
  if (trimmed.startsWith(".") || trimmed.startsWith("-")) {
    return "Project name cannot start with a dot or hyphen.";
  }
  return true;
}

// ── Node factory ───────────────────────────────────────────────────────────────
//
// Each node is built as a function so it can reference the `projectType`
// answer from the accumulated context map (SelectionMap).

function projectNameNode(): PromptNode {
  return {
    id: "projectName",
    type: "text",
    message: chalk.white("Project name:"),
    defaultValue: "my-app",
    validate: validateProjectName,
    transformer: (v) => chalk.yellow(v),
  };
}

function projectTypeNode(): PromptNode {
  return {
    id: "projectType",
    type: "select",
    message: chalk.white("What are you building?"),
    choices: PROJECT_TYPE_CHOICES,
    defaultValue: "saas",
    /**
     * onAnswer: when the user picks an archetype, mutate the `defaultValue`
     * of every downstream node to apply archetype smart defaults.
     *
     * We do this by scanning `pendingNodes` and swapping their `defaultValue`
     * for the archetype-defined one. Because PromptNode is readonly, we
     * replace each object with a spread that overrides `defaultValue`.
     *
     * This gives the user the right pre-selection without hard-coding it —
     * they can still change anything.
     */
    onAnswer: (value, _ctx, pendingNodes) => {
      for (let i = 0; i < pendingNodes.length; i++) {
        const node = pendingNodes[i]!;
        const presetDefault = archetypeDefault(value, node.id);
        // Only override if the archetype actually has an opinion about this node.
        if (presetDefault !== "none" || value === "api-backend") {
          pendingNodes[i] = { ...node, defaultValue: presetDefault };
        }
      }
    },
  };
}

function frontendNode(): PromptNode {
  return {
    id: "frontend",
    type: "select",
    message: chalk.white("Frontend framework:"),
    choices: FRONTEND_CHOICES,
    defaultValue: "nextjs",
  };
}

function backendNode(): PromptNode {
  return {
    id: "backend",
    type: "select",
    message: chalk.white("Backend framework:"),
    choices: BACKEND_CHOICES,
    defaultValue: "express",
  };
}

function databaseNode(): PromptNode {
  return {
    id: "database",
    type: "select",
    message: chalk.white("Database:"),
    choices: DATABASE_CHOICES,
    defaultValue: "postgresql",
  };
}

function authNode(): PromptNode {
  return {
    id: "auth",
    type: "select",
    message: chalk.white("Authentication:"),
    choices: AUTH_CHOICES,
    defaultValue: "jwt",
  };
}

function uiNode(): PromptNode {
  return {
    id: "ui",
    type: "select",
    message: chalk.white("UI system:"),
    choices: UI_CHOICES,
    defaultValue: "tailwind",
    // Only ask when user actually chose a frontend
    when: (ctx) => ctx["frontend"] !== "none",
  };
}

function stateManagementNode(): PromptNode {
  return {
    id: "stateManagement",
    type: "select",
    message: chalk.white("State management:"),
    choices: STATE_CHOICES,
    defaultValue: "none",
    // Only makes sense with a frontend
    when: (ctx) => ctx["frontend"] !== "none",
  };
}

function deploymentNode(): PromptNode {
  return {
    id: "deployment",
    type: "select",
    message: chalk.white("Deployment target:"),
    choices: DEPLOYMENT_CHOICES,
    defaultValue: "docker",
  };
}

// ── Graph assembly ─────────────────────────────────────────────────────────────

/**
 * Builds and returns the canonical FOUNDATION_GRAPH.
 *
 * Returns a fresh array each call so that the `onAnswer` side-effects in
 * `runPromptGraph` (which mutate the pending node list) don't bleed between
 * invocations.
 */
export function buildFoundationGraph(): PromptGraph {
  return [
    projectNameNode(),
    projectTypeNode(),
    frontendNode(),
    backendNode(),
    databaseNode(),
    authNode(),
    uiNode(),
    stateManagementNode(),
    deploymentNode(),
  ];
}
