/**
 * Credential definitions for Foundation CLI Phase 1.
 *
 * Each entry declares what prompts to show when a module is selected,
 * how to validate them, and which env var key to write into .env / .env.example.
 *
 * Design rules:
 *  - `secret: true`    → value is written to .env only, never .env.example
 *  - `generate`        → when user leaves blank, auto-generate this kind of value
 *  - `derived`         → env var computed from other answers (not directly prompted)
 *  - `defaultValue`    → pre-fills the input (user may override)
 *  - `mask: true`      → input is shown as *** while typing (passwords, secrets)
 *
 * Selection keys match the values emitted by graph-definition.ts (e.g. "postgresql",
 * "jwt", "clerk"). This map is intentionally separate from module manifests so
 * credential logic can evolve independently of the module scaffold system.
 *
 * @module prompt/credentials
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export type GenerateStrategy = "random-hex-32" | "random-hex-64" | "uuid";

export interface CredentialField {
  /** Env var key written to .env / .env.example */
  readonly envKey: string;
  /** Prompt label shown to the user */
  readonly label: string;
  /** If true, value is written to .env only (never .env.example) */
  readonly secret?: boolean;
  /** If true, input is masked while typing */
  readonly mask?: boolean;
  /** Pre-filled default shown in the prompt */
  readonly defaultValue?: string;
  /** When user leaves blank, auto-generate using this strategy */
  readonly generate?: GenerateStrategy;
  /** Optional validator — return error string to reject, true to accept */
  readonly validate?: (value: string) => string | true;
  /**
   * When set, this env var is NOT directly prompted.
   * Instead its value is derived by calling this function with the
   * current answer map for this module's fields.
   */
  readonly derived?: (answers: Record<string, string>) => string;
}

export interface CredentialGroup {
  /** Human-readable section header shown before the group's prompts */
  readonly heading: string;
  /** Ordered list of fields to prompt for */
  readonly fields: ReadonlyArray<CredentialField>;
}

// ── Validators ─────────────────────────────────────────────────────────────────

const nonEmpty =
  (label: string) =>
  (v: string): string | true =>
    v.trim().length > 0 ? true : `${label} is required`;

const validPort = (v: string): string | true => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 && n < 65536
    ? true
    : "Port must be a number between 1 and 65535";
};

// const minLength =
//   (min: number, label: string) =>
//   (v: string): string | true =>
//     v.trim().length >= min ? true : `${label} must be at least ${min} characters`;

const startsWith =
  (prefix: string, label: string) =>
  (v: string): string | true =>
    v.trim().startsWith(prefix)
      ? true
      : `${label} must start with "${prefix}"`;

// ── Credential map ─────────────────────────────────────────────────────────────
//
// Keys are selection values from graph-definition.ts.
// Order within fields[] is the order questions appear.

export const CREDENTIAL_MAP: Readonly<Record<string, CredentialGroup>> = {
  // ── Databases ──────────────────────────────────────────────────────────────

  postgresql: {
    heading: "PostgreSQL Connection",
    fields: [
      {
        envKey: "POSTGRES_HOST",
        label: "Host",
        defaultValue: "localhost",
        validate: nonEmpty("Host"),
      },
      {
        envKey: "POSTGRES_PORT",
        label: "Port",
        defaultValue: "5432",
        validate: validPort,
      },
      {
        envKey: "POSTGRES_DB",
        label: "Database name",
        validate: nonEmpty("Database name"),
      },
      {
        envKey: "POSTGRES_USER",
        label: "Username",
        validate: nonEmpty("Username"),
      },
      {
        envKey: "POSTGRES_PASSWORD",
        label: "Password",
        secret: true,
        mask: true,
        validate: nonEmpty("Password"),
      },
      {
        // Derived — not prompted
        envKey: "DATABASE_URL",
        label: "DATABASE_URL",
        derived: (a) =>
          `postgresql://${a["POSTGRES_USER"]}:${a["POSTGRES_PASSWORD"]}@${a["POSTGRES_HOST"]}:${a["POSTGRES_PORT"]}/${a["POSTGRES_DB"]}`,
      },
    ],
  },

  mysql: {
    heading: "MySQL Connection",
    fields: [
      {
        envKey: "MYSQL_HOST",
        label: "Host",
        defaultValue: "localhost",
        validate: nonEmpty("Host"),
      },
      {
        envKey: "MYSQL_PORT",
        label: "Port",
        defaultValue: "3306",
        validate: validPort,
      },
      {
        envKey: "MYSQL_DATABASE",
        label: "Database name",
        validate: nonEmpty("Database name"),
      },
      {
        envKey: "MYSQL_USER",
        label: "Username",
        validate: nonEmpty("Username"),
      },
      {
        envKey: "MYSQL_PASSWORD",
        label: "Password",
        secret: true,
        mask: true,
        validate: nonEmpty("Password"),
      },
      {
        envKey: "DATABASE_URL",
        label: "DATABASE_URL",
        derived: (a) =>
          `mysql://${a["MYSQL_USER"]}:${a["MYSQL_PASSWORD"]}@${a["MYSQL_HOST"]}:${a["MYSQL_PORT"]}/${a["MYSQL_DATABASE"]}`,
      },
    ],
  },

  mongodb: {
    heading: "MongoDB Connection",
    fields: [
      {
        envKey: "MONGODB_URI",
        label: "MongoDB URI",
        defaultValue: "mongodb://localhost:27017/myapp",
        validate: (v) =>
          v.startsWith("mongodb://") || v.startsWith("mongodb+srv://")
            ? true
            : 'URI must start with "mongodb://" or "mongodb+srv://"',
      },
    ],
  },

  supabase: {
    heading: "Supabase Connection",
    fields: [
      {
        envKey: "NEXT_PUBLIC_SUPABASE_URL",
        label: "Project URL (https://xxxx.supabase.co)",
        validate: nonEmpty("Supabase URL"),
      },
      {
        envKey: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
        label: "Anon / Public key",
        validate: nonEmpty("Anon key"),
      },
      {
        envKey: "SUPABASE_SERVICE_ROLE_KEY",
        label: "Service role key",
        secret: true,
        mask: true,
        validate: nonEmpty("Service role key"),
      },
    ],
  },

  // ── Auth ───────────────────────────────────────────────────────────────────

  jwt: {
    heading: "JWT Configuration",
    fields: [
      {
        envKey: "JWT_SECRET",
        label: "JWT secret (leave blank to auto-generate)",
        secret: true,
        mask: true,
        generate: "random-hex-64",
        validate: (v) =>
          v.trim().length === 0 || v.trim().length >= 32
            ? true
            : "JWT secret must be at least 32 characters (or leave blank to auto-generate)",
      },
      {
        envKey: "JWT_EXPIRES_IN",
        label: "Token expiry",
        defaultValue: "7d",
        validate: nonEmpty("Token expiry"),
      },
    ],
  },

  session: {
    heading: "Session Configuration",
    fields: [
      {
        envKey: "SESSION_SECRET",
        label: "Session secret (leave blank to auto-generate)",
        secret: true,
        mask: true,
        generate: "random-hex-64",
        validate: (v) =>
          v.trim().length === 0 || v.trim().length >= 32
            ? true
            : "Session secret must be at least 32 characters (or leave blank to auto-generate)",
      },
    ],
  },

  clerk: {
    heading: "Clerk Authentication",
    fields: [
      {
        envKey: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
        label: "Publishable key (pk_...)",
        validate: startsWith("pk_", "Publishable key"),
      },
      {
        envKey: "CLERK_SECRET_KEY",
        label: "Secret key (sk_...)",
        secret: true,
        mask: true,
        validate: startsWith("sk_", "Secret key"),
      },
    ],
  },

  auth0: {
    heading: "Auth0 Configuration",
    fields: [
      {
        envKey: "AUTH0_DOMAIN",
        label: "Domain (e.g. your-tenant.auth0.com)",
        validate: nonEmpty("Auth0 domain"),
      },
      {
        envKey: "AUTH0_CLIENT_ID",
        label: "Client ID",
        validate: nonEmpty("Client ID"),
      },
      {
        envKey: "AUTH0_CLIENT_SECRET",
        label: "Client secret",
        secret: true,
        mask: true,
        validate: nonEmpty("Client secret"),
      },
    ],
  },

  oauth: {
    heading: "OAuth Configuration",
    fields: [
      {
        envKey: "OAUTH_CLIENT_ID",
        label: "Client ID",
        validate: nonEmpty("Client ID"),
      },
      {
        envKey: "OAUTH_CLIENT_SECRET",
        label: "Client secret",
        secret: true,
        mask: true,
        validate: nonEmpty("Client secret"),
      },
    ],
  },

  // ── Add-ons ────────────────────────────────────────────────────────────────

  stripe: {
    heading: "Stripe Configuration",
    fields: [
      {
        envKey: "STRIPE_SECRET_KEY",
        label: "Secret key (sk_test_... or sk_live_...)",
        secret: true,
        mask: true,
        validate: startsWith("sk_", "Secret key"),
      },
      {
        envKey: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
        label: "Publishable key (pk_test_... or pk_live_...)",
        validate: startsWith("pk_", "Publishable key"),
      },
    ],
  },

  redis: {
    heading: "Redis Connection",
    fields: [
      {
        envKey: "REDIS_HOST",
        label: "Host",
        defaultValue: "localhost",
        validate: nonEmpty("Host"),
      },
      {
        envKey: "REDIS_PORT",
        label: "Port",
        defaultValue: "6379",
        validate: validPort,
      },
      {
        envKey: "REDIS_PASSWORD",
        label: "Password (leave blank if none)",
        secret: true,
        mask: true,
        // Optional — empty is fine
        validate: () => true,
      },
      {
        envKey: "REDIS_URL",
        label: "REDIS_URL",
        derived: (a) => {
          const pass = a["REDIS_PASSWORD"]?.trim();
          const auth = pass ? `:${pass}@` : "";
          return `redis://${auth}${a["REDIS_HOST"]}:${a["REDIS_PORT"]}`;
        },
      },
    ],
  },

  openai: {
    heading: "OpenAI Configuration",
    fields: [
      {
        envKey: "OPENAI_API_KEY",
        label: 'API key (sk-...)',
        secret: true,
        mask: true,
        validate: (v) =>
          v.trim().length > 0 ? true : "OpenAI API key is required",
      },
    ],
  },
} as const;

// ── Selection-to-credential lookup ─────────────────────────────────────────────

/**
 * Returns the CredentialGroup for a given selection value, or undefined
 * if that module requires no credentials.
 */
export function getCredentialGroup(
  selectionValue: string,
): CredentialGroup | undefined {
  if (selectionValue in CREDENTIAL_MAP) {
    return CREDENTIAL_MAP[selectionValue];
  }
  return undefined;
}
/**
 * Given all raw selections from the prompt flow, returns the ordered list of
 * [selectionValue, CredentialGroup] pairs that need credentials collected.
 * Duplicates (same selection value appearing more than once) are de-duped.
 */
export function getRequiredCredentialGroups(
  selectionValues: ReadonlyArray<string>,
): Array<{ selectionValue: string; group: CredentialGroup }> {
  const seen = new Set<string>();
  const result: Array<{ selectionValue: string; group: CredentialGroup }> = [];

  for (const value of selectionValues) {
    if (seen.has(value) || !value || value === "none") continue;
    const group = getCredentialGroup(value);
    if (group) {
      seen.add(value);
      result.push({ selectionValue: value, group });
    }
  }

  return result;
}

