import type { PluginDefinition } from "@foundation-cli/plugin-sdk";

// ── File templates ────────────────────────────────────────────────────────────

const REDIS_CLIENT = `\
import { createClient, type RedisClientType } from "redis";

const REDIS_URL = process.env["REDIS_URL"] ?? "redis://localhost:6379";

let _client: RedisClientType | null = null;

/**
 * Returns the singleton Redis client, creating and connecting it on first call.
 * Subsequent calls return the cached, already-connected instance.
 */
export async function getRedisClient(): Promise<RedisClientType> {
  if (_client !== null) return _client;

  const client = createClient({ url: REDIS_URL }) as RedisClientType;

  client.on("error", (err: Error) => {
    console.error("Redis client error:", err.message);
  });

  client.on("connect", () => {
    console.log(\`Redis connected: \${REDIS_URL}\`);
  });

  await client.connect();
  _client = client;
  return client;
}

/**
 * Closes the Redis connection and resets the singleton.
 * Call during graceful shutdown.
 */
export async function closeRedisClient(): Promise<void> {
  if (_client !== null) {
    await _client.quit();
    _client = null;
  }
}
`;

const REDIS_CACHE = `\
import { getRedisClient } from "./redis-client.js";

const DEFAULT_TTL_SECONDS = 300; // 5 minutes

/**
 * Retrieves a cached value. Returns null if the key does not exist or
 * has expired.
 */
export async function cacheGet<T = unknown>(key: string): Promise<T | null> {
  const client = await getRedisClient();
  const raw = await client.get(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return raw as unknown as T;
  }
}

/**
 * Stores a value in the cache with an optional TTL.
 *
 * @param key    Cache key.
 * @param value  Any JSON-serialisable value.
 * @param ttl    Time-to-live in seconds. Defaults to \${DEFAULT_TTL_SECONDS}.
 */
export async function cacheSet(
  key: string,
  value: unknown,
  ttl = DEFAULT_TTL_SECONDS,
): Promise<void> {
  const client = await getRedisClient();
  await client.setEx(key, ttl, JSON.stringify(value));
}

/**
 * Removes a key from the cache.
 */
export async function cacheDelete(key: string): Promise<void> {
  const client = await getRedisClient();
  await client.del(key);
}

/**
 * Returns true if the key exists in the cache.
 */
export async function cacheExists(key: string): Promise<boolean> {
  const client = await getRedisClient();
  const count = await client.exists(key);
  return count > 0;
}
`;

const REDIS_SESSION = `\
/**
 * Redis-backed session helpers.
 * Compatible with express-session when used with connect-redis.
 *
 * Install connect-redis separately if you need express-session support:
 *   npm install connect-redis express-session
 */
import { cacheGet, cacheSet, cacheDelete } from "./redis-cache.js";

const SESSION_PREFIX = "session:";
const SESSION_TTL = 86_400; // 24 hours

export interface SessionData {
  readonly userId?: string;
  readonly [key: string]: unknown;
}

export async function getSession(
  sessionId: string,
): Promise<SessionData | null> {
  return cacheGet<SessionData>(\`\${SESSION_PREFIX}\${sessionId}\`);
}

export async function setSession(
  sessionId: string,
  data: SessionData,
  ttl = SESSION_TTL,
): Promise<void> {
  await cacheSet(\`\${SESSION_PREFIX}\${sessionId}\`, data, ttl);
}

export async function destroySession(sessionId: string): Promise<void> {
  await cacheDelete(\`\${SESSION_PREFIX}\${sessionId}\`);
}
`;

// ── Hook source ───────────────────────────────────────────────────────────────

export const REDIS_AFTER_WRITE_HOOK = `\
async function hook(ctx) {
  console.log("Redis plugin installed.");
  console.log("Connection configured via REDIS_URL environment variable.");
  console.log("Default: redis://localhost:6379");
  console.log("");
  console.log("Start Redis locally:");
  console.log("  docker run -p 6379:6379 redis:7-alpine");
}
hook
`;

// ── PluginDefinition ──────────────────────────────────────────────────────────

export const redisPlugin: PluginDefinition = {
  manifest: {
    id: "plugin-redis",
    name: "Redis Cache",
    version: "1.0.0",
    description:
      "Redis caching layer with type-safe helpers for get/set/delete and optional session storage",
    category: "database",
    runtime: "node",
    dependencies: [
      { name: "redis", version: "^4.6.14", scope: "dependencies" },
      { name: "@types/redis", version: "^4.0.11", scope: "devDependencies" },
    ],
    files: [
      {
        relativePath: "src/cache/redis-client.ts",
        content: REDIS_CLIENT,
      },
      {
        relativePath: "src/cache/redis-cache.ts",
        content: REDIS_CACHE,
      },
      {
        relativePath: "src/cache/redis-session.ts",
        content: REDIS_SESSION,
      },
    ],
    configPatches: [
      {
        targetFile: ".env.example",
        merge: {
          REDIS_URL: "redis://localhost:6379",
        },
      },
    ],
    compatibility: {
      requires: [],
      conflicts: [],
    },
    tags: ["cache", "redis", "session", "pub-sub"],
  },
};