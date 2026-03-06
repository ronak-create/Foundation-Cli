export {
  loadBuiltinModules,
  discoverBuiltinModules,
  selectionsToModuleIds,
  SELECTION_TO_MODULE_ID,
} from "./registry-loader.js";

// ── Frontend ──────────────────────────────────────────────────────────────────
export { nextjsModule }      from "./frontend/nextjs.js";
export { reactViteModule }   from "./frontend/react-vite.js";
export { vueModule }         from "./frontend/vue.js";
export { svelteModule }      from "./frontend/svelte.js";

// ── Backend ───────────────────────────────────────────────────────────────────
export { expressModule }     from "./backend/express.js";
export { nestjsModule }      from "./backend/nestjs.js";
export { fastapiModule }     from "./backend/fastapi.js";
export { djangoModule }      from "./backend/django.js";

// ── Database ──────────────────────────────────────────────────────────────────
export { postgresqlModule }  from "./database/postgresql.js";
export { mysqlModule }       from "./database/mysql.js";
export { mongodbModule }     from "./database/mongodb.js";
export { sqliteModule }      from "./database/sqlite.js";
export { supabaseModule }    from "./database/supabase.js";

// ── Auth ──────────────────────────────────────────────────────────────────────
export { jwtModule }         from "./auth/jwt.js";
export { oauthModule }       from "./auth/oauth.js";
export { sessionModule }     from "./auth/session.js";
export { clerkModule }       from "./auth/clerk.js";
export { auth0Module }       from "./auth/auth0.js";

// ── UI ────────────────────────────────────────────────────────────────────────
export { tailwindModule }    from "./ui/tailwind.js";
export { shadcnModule }      from "./ui/shadcn.js";
export { muiModule }         from "./ui/mui.js";
export { chakraModule }      from "./ui/chakra.js";
export { bootstrapModule }   from "./ui/bootstrap.js";

// ── State Management ──────────────────────────────────────────────────────────
export { zustandModule }       from "./state/zustand.js";
export { reduxModule }         from "./state/redux.js";
export { tanstackQueryModule } from "./state/tanstack-query.js";

// ── Deployment ────────────────────────────────────────────────────────────────
export { dockerModule }      from "./deployment/docker.js";
export { vercelModule }      from "./deployment/vercel.js";
export { renderModule }      from "./deployment/render.js";
export { awsModule }         from "./deployment/aws.js";

// ── Official addon plugins ────────────────────────────────────────────────────
export {
  loadAddonPlugins,
  stripePlugin,
  redisPlugin,
  openaiPlugin,
  STRIPE_AFTER_WRITE_HOOK,
  REDIS_AFTER_WRITE_HOOK,
  OPENAI_AFTER_WRITE_HOOK,
} from "./addon/index.js";