import { FoundationError } from "../errors.js";

// ── Errors ────────────────────────────────────────────────────────────────────

export class RegistrySearchError extends FoundationError {
  constructor(
    public readonly query: string,
    cause: unknown,
  ) {
    const msg = cause instanceof Error ? cause.message : String(cause);
    super(
      `npm registry search failed for "${query}": ${msg}`,
      "ERR_REGISTRY_SEARCH",
    );
    this.name = "RegistrySearchError";
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

/** Shape returned from the npm search API for a single package. */
export interface NpmSearchObject {
  readonly package: {
    readonly name: string;
    readonly description: string;
    readonly version: string;
    readonly keywords?: ReadonlyArray<string>;
    readonly links: {
      readonly npm?: string;
      readonly homepage?: string;
      readonly repository?: string;
    };
    readonly publisher?: {
      readonly username: string;
    };
    readonly date: string;
  };
  readonly score: {
    readonly final: number;
    readonly detail: {
      readonly quality: number;
      readonly popularity: number;
      readonly maintenance: number;
    };
  };
  readonly searchScore: number;
}

/** Raw response envelope from registry.npmjs.org/-/v1/search */
export interface NpmSearchResponse {
  readonly objects: ReadonlyArray<NpmSearchObject>;
  readonly total: number;
  readonly time: string;
}

/** A normalised plugin result ready for display. */
export interface PluginSearchResult {
  /** npm package name, e.g. "foundation-plugin-stripe" */
  readonly name: string;
  /** Human-readable description from package.json */
  readonly description: string;
  /** Latest published version */
  readonly version: string;
  /**
   * True when the package is published under the @foundation/* scope.
   * These are curated, officially tested packages.
   */
  readonly verified: boolean;
  /** npm package page URL */
  readonly npmUrl: string;
  /** Combined relevance score from the registry */
  readonly score: number;
}

export interface SearchOptions {
  /**
   * Maximum number of results to return (before verified-first sorting).
   * Defaults to 20.
   */
  readonly limit?: number;
  /**
   * Override the base registry URL. Used in tests to point at a mock server
   * or to inject a custom fetch implementation.
   */
  readonly registryUrl?: string;
  /**
   * Inject a custom fetch function (for testing without a live network).
   * Defaults to global `fetch`.
   */
  readonly fetchFn?: (url: string) => Promise<{ json(): Promise<unknown> }>;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const NPM_REGISTRY_SEARCH = "https://registry.npmjs.org/-/v1/search";
const FOUNDATION_PLUGIN_KEYWORD = "foundation-plugin";
const VERIFIED_SCOPE = "@foundation/";
const DEFAULT_LIMIT = 20;

// ── Search ────────────────────────────────────────────────────────────────────

/**
 * Searches the npm registry for packages tagged with the
 * "foundation-plugin" keyword, filtered by `query`.
 *
 * Results are:
 *   1. Filtered — must contain `query` in name or description.
 *   2. Sorted   — verified (@foundation/*) packages first, then by score.
 *
 * Network is called once with a compound text query. No web scraping, no
 * pagination beyond the configured `limit`.
 */
export async function searchPlugins(
  query: string,
  options: SearchOptions = {},
): Promise<ReadonlyArray<PluginSearchResult>> {
  const {
    limit = DEFAULT_LIMIT,
    registryUrl = NPM_REGISTRY_SEARCH,
    fetchFn = defaultFetch,
  } = options;

  // Compound text query: keyword narrows to Foundation plugins, user query
  // narrows further. The registry's full-text search handles both.
  const textQuery = query.trim()
    ? `keywords:${FOUNDATION_PLUGIN_KEYWORD} ${query.trim()}`
    : `keywords:${FOUNDATION_PLUGIN_KEYWORD}`;

  const url = `${registryUrl}?text=${encodeURIComponent(textQuery)}&size=${limit}`;

  let response: NpmSearchResponse;
  try {
    const res = await fetchFn(url);
    response = (await res.json()) as NpmSearchResponse;
  } catch (err) {
    throw new RegistrySearchError(query, err);
  }

  if (!Array.isArray(response.objects)) {
    throw new RegistrySearchError(
      query,
      new Error("Unexpected registry response shape: missing 'objects' array."),
    );
  }

  const normalised = response.objects
    .map(normaliseResult)
    .filter((r) => matchesQuery(r, query));

  return sortResults(normalised);
}

// ── Normalisation ─────────────────────────────────────────────────────────────

function normaliseResult(obj: NpmSearchObject): PluginSearchResult {
  const pkg = obj.package;
  return {
    name: pkg.name,
    description: pkg.description ?? "",
    version: pkg.version,
    verified: pkg.name.startsWith(VERIFIED_SCOPE),
    npmUrl:
      pkg.links.npm ?? `https://www.npmjs.com/package/${encodeURIComponent(pkg.name)}`,
    score: obj.score?.final ?? obj.searchScore ?? 0,
  };
}

// ── Filtering ─────────────────────────────────────────────────────────────────

function matchesQuery(result: PluginSearchResult, query: string): boolean {
  if (!query.trim()) return true;
  const q = query.toLowerCase();
  return (
    result.name.toLowerCase().includes(q) ||
    result.description.toLowerCase().includes(q)
  );
}

// ── Sorting: verified first, then by score descending ────────────────────────

function sortResults(
  results: ReadonlyArray<PluginSearchResult>,
): ReadonlyArray<PluginSearchResult> {
  return [...results].sort((a, b) => {
    // Primary: verified first
    if (a.verified !== b.verified) return a.verified ? -1 : 1;
    // Secondary: higher score first
    return b.score - a.score;
  });
}

// ── Default fetch ─────────────────────────────────────────────────────────────

async function defaultFetch(
  url: string,
): Promise<{ json(): Promise<unknown> }> {
  // Node 18+ has global fetch. For older environments this would need
  // undici or node-fetch, but Foundation CLI targets Node 20+.
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} — ${url}`);
  }
  return res;
}