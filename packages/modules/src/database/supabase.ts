import type { PluginDefinition } from "@systemlabs/foundation-plugin-sdk";

const DB_CLIENT_TS = `import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config();

const supabaseUrl = process.env["SUPABASE_URL"];
const supabaseAnonKey = process.env["SUPABASE_ANON_KEY"];

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY environment variables are required");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
  },
});

export const supabaseAdmin = process.env["SUPABASE_SERVICE_ROLE_KEY"]
  ? createClient(supabaseUrl, process.env["SUPABASE_SERVICE_ROLE_KEY"], {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;
`;

const MIGRATIONS_INIT = `-- Initial Supabase migration
-- Run in the Supabase SQL editor or via supabase db push

CREATE TABLE IF NOT EXISTS public.users (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT        NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
`;

export const supabaseModule: PluginDefinition = {
  manifest: {
    id: "database-supabase",
    name: "Supabase",
    version: "1.0.0",
    description: "Supabase client with anon and service-role keys and RLS-ready schema",
    category: "database",
    dependencies: [
      { name: "@supabase/supabase-js", version: "^2.43.4", scope: "dependencies" },
      { name: "dotenv", version: "^16.4.5", scope: "dependencies" },
    ],
    files: [
      { relativePath: "src/db/client.ts", content: DB_CLIENT_TS },
      { relativePath: "supabase/migrations/001_init.sql", content: MIGRATIONS_INIT },
    ],
    configPatches: [
      {
        targetFile: ".env.example",
        merge: {
          SUPABASE_URL: "https://<project-ref>.supabase.co",
          SUPABASE_ANON_KEY: "your-anon-key",
          SUPABASE_SERVICE_ROLE_KEY: "your-service-role-key",
        },
      },
    ],
    compatibility: {
      conflicts: ["database-postgresql", "database-mysql", "database-mongodb", "database-sqlite"],
    },
  },
};
