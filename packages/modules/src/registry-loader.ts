/**
 * registry-loader.ts
 *
 * Provides two ways to populate a ModuleRegistry with the built-in modules:
 *
 * ## Static path (existing — unchanged)
 * `loadBuiltinModules(registry)` — explicit static imports, zero I/O, fast.
 * This remains the production default. All six built-in modules are always
 * registered exactly once; the call is idempotent.
 *
 * ## Dynamic path (Phase 4 Stage 2 — NEW)
 * `discoverBuiltinModules(registry, modulesDir?)` — uses ModuleLoader to scan
 * the `packages/modules/src/{category}/` directory tree, importing every file
 * and extracting any named PluginDefinition exports. Returns a DiscoveryResult
 * with `loaded`, `skipped`, and `failed` arrays for the CLI to display.
 *
 * Both paths are idempotent when combined: `discoverBuiltinModules` skips any
 * module already present in the registry (e.g. from a prior `loadBuiltinModules`
 * call), so the two can be used together without conflict.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ModuleRegistry } from "@foundation-cli/core";
import { ModuleLoader, type DiscoveryResult } from "@foundation-cli/core";

// Frontend
import { nextjsModule }        from "./frontend/nextjs.js";
import { reactViteModule }     from "./frontend/react-vite.js";
import { vueModule }           from "./frontend/vue.js";
import { svelteModule }        from "./frontend/svelte.js";
// Backend
import { expressModule }       from "./backend/express.js";
import { nestjsModule }        from "./backend/nestjs.js";
import { fastapiModule }       from "./backend/fastapi.js";
import { djangoModule }        from "./backend/django.js";
// Database
import { postgresqlModule }    from "./database/postgresql.js";
import { mysqlModule }         from "./database/mysql.js";
import { mongodbModule }       from "./database/mongodb.js";
import { sqliteModule }        from "./database/sqlite.js";
import { supabaseModule }      from "./database/supabase.js";
// Auth
import { jwtModule }           from "./auth/jwt.js";
import { oauthModule }         from "./auth/oauth.js";
import { sessionModule }       from "./auth/session.js";
import { clerkModule }         from "./auth/clerk.js";
import { auth0Module }         from "./auth/auth0.js";
// UI
import { tailwindModule }      from "./ui/tailwind.js";
import { shadcnModule }        from "./ui/shadcn.js";
import { muiModule }           from "./ui/mui.js";
import { chakraModule }        from "./ui/chakra.js";
import { bootstrapModule }     from "./ui/bootstrap.js";
// State
import { zustandModule }       from "./state/zustand.js";
import { reduxModule }         from "./state/redux.js";
import { tanstackQueryModule } from "./state/tanstack-query.js";
// Deployment
import { dockerModule }        from "./deployment/docker.js";
import { vercelModule }        from "./deployment/vercel.js";
import { renderModule }        from "./deployment/render.js";
import { awsModule }           from "./deployment/aws.js";
import { prismaModule }        from "./orm/prisma.js";
import { typeormModule }       from "./orm/typeorm.js";
import { sqlalchemyModule }    from "./orm/sqlalchemy.js";
import { mongooseModule }      from "./orm/mongoose.js";

// ── Static registration ────────────────────────────────────────────────────────

/** All built-in PluginDefinitions in the order they should be registered. */
export const BUILTIN_MODULES = [
  // Frontend
  nextjsModule,
  reactViteModule,
  vueModule,
  svelteModule,
  // Backend
  expressModule,
  nestjsModule,
  fastapiModule,
  djangoModule,
  // Database
  postgresqlModule,
  mysqlModule,
  mongodbModule,
  sqliteModule,
  supabaseModule,
  // Auth
  jwtModule,
  oauthModule,
  sessionModule,
  clerkModule,
  auth0Module,
  // UI
  tailwindModule,
  shadcnModule,
  muiModule,
  chakraModule,
  bootstrapModule,
  // State
  zustandModule,
  reduxModule,
  tanstackQueryModule,
  // Deployment
  dockerModule,
  vercelModule,
  renderModule,
  awsModule,
  prismaModule,
  typeormModule,
  sqlalchemyModule,
  mongooseModule,
] as const;

/**
 * Registers all built-in modules into `registry` via static imports.
 *
 * Idempotent — modules already in the registry are silently skipped.
 * Zero filesystem I/O — always fast.
 */
export function loadBuiltinModules(registry: ModuleRegistry): void {
  for (const plugin of BUILTIN_MODULES) {
    if (!registry.hasModule(plugin.manifest.id)) {
      registry.registerModule(plugin);
    }
  }
}

// ── Dynamic discovery ──────────────────────────────────────────────────────────

/**
 * Dynamically scans `modulesDir` (or the directory this file lives in) using
 * the "category" scan mode — i.e. `dir/{category}/{name}.ts` — and registers
 * every PluginDefinition found as a builtin.
 *
 * **Why call this as well as `loadBuiltinModules`?**
 *   - `loadBuiltinModules` is hardwired to the six known modules.
 *   - `discoverBuiltinModules` picks up any *new* module files added to the
 *     category directories without requiring a code change in this file.
 *   - It also validates every manifest with ManifestValidator and reports
 *     failures instead of silently ignoring them.
 *
 * Modules already registered (e.g. from `loadBuiltinModules`) are skipped
 * automatically — no duplicate-registration errors.
 *
 * @param registry    Target registry to populate.
 * @param modulesDir  Explicit path to scan. Defaults to the directory this
 *                    file lives in (works for both src/ and compiled dist/).
 * @param log         Optional logger for progress messages.
 */
export async function discoverBuiltinModules(
  registry: ModuleRegistry,
  modulesDir?: string,
  log?: (msg: string) => void,
): Promise<DiscoveryResult> {
  const dir = modulesDir ?? resolveModulesDir();
  const loader = new ModuleLoader(registry, log);
  return loader.loadFromDirectory(dir, "category", "builtin");
}

/** Resolves the directory that contains the category sub-folders. */
function resolveModulesDir(): string {
  // import.meta.url points to this compiled file, e.g.:
  //   .../packages/modules/dist/registry-loader.js   (after build)
  //   .../packages/modules/src/registry-loader.ts    (ts-node / tsx)
  // Either way dirname() gives us the modules root we want to scan.
  const thisFile = fileURLToPath(import.meta.url);
  return path.dirname(thisFile);
}

// ── Selection → Module ID mapping ─────────────────────────────────────────────

/**
 * Maps user-facing prompt selection values (from graph-definition.ts) to the
 * canonical `id` field of the corresponding ModuleManifest.
 *
 * Used by `selectionsToModuleIds`. When adding a new module, add its
 * prompt value → module ID mapping here.
 */
export const SELECTION_TO_MODULE_ID: Readonly<Record<string, string>> = {
  // Frontend
  nextjs:          "frontend-nextjs",
  "react-vite":    "frontend-react-vite",
  vue:             "frontend-vue",
  svelte:          "frontend-svelte",
  // Backend
  express:         "backend-express",
  nestjs:          "backend-nestjs",
  fastapi:         "backend-fastapi",
  django:          "backend-django",
  // Database
  postgresql:      "database-postgresql",
  mysql:           "database-mysql",
  mongodb:         "database-mongodb",
  sqlite:          "database-sqlite",
  supabase:        "database-supabase",
  // Auth
  jwt:             "auth-jwt",
  oauth:           "auth-oauth",
  session:         "auth-session",
  clerk:           "auth-clerk",
  auth0:           "auth-auth0",
  // UI
  tailwind:        "ui-tailwind",
  shadcn:          "ui-shadcn",
  mui:             "ui-mui",
  chakra:          "ui-chakra",
  bootstrap:       "ui-bootstrap",
  // State Management
  zustand:         "state-zustand",
  redux:           "state-redux",
  "tanstack-query": "state-tanstack-query",
  // Deployment
  docker:          "deployment-docker",
  vercel:          "deployment-vercel",
  render:          "deployment-render",
  aws:             "deployment-aws",
  // ORM
  prisma:          "orm-prisma",
  typeorm:         "orm-typeorm",
  sqlalchemy:      "orm-sqlalchemy",
  mongoose:        "orm-mongoose",
} as const;

/**
 * Converts an array of prompt selection values into registered module IDs.
 *
 * - Filters out "none".
 * - Maps values through SELECTION_TO_MODULE_ID (falls back to the raw value
 *   for forward-compatibility with future modules).
 * - Filters out IDs not present in the registry (graceful degradation:
 *   unimplemented options are silently skipped rather than throwing).
 */
export function selectionsToModuleIds(
  selections: ReadonlyArray<string>,
  registry: ModuleRegistry,
): string[] {
  return selections
    .filter((s) => s !== "none")
    .map((s) => SELECTION_TO_MODULE_ID[s] ?? s)
    .filter((id) => registry.hasModule(id));
}
