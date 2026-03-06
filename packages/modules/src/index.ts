export {
  loadBuiltinModules,
  discoverBuiltinModules,   // NEW — Phase 4 Stage 2
  selectionsToModuleIds,
  SELECTION_TO_MODULE_ID,
} from "./registry-loader.js";

export { nextjsModule }     from "./frontend/nextjs.js";
export { expressModule }    from "./backend/express.js";
export { postgresqlModule } from "./database/postgresql.js";
export { jwtModule }        from "./auth/jwt.js";
export { tailwindModule }   from "./ui/tailwind.js";
export { dockerModule }     from "./deployment/docker.js";

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