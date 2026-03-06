import { describe, it, expect } from "vitest";
import {
  searchPlugins,
  RegistrySearchError,
  type NpmSearchResponse,
  type NpmSearchObject,
} from "../registry-search/npm-search.js";

// ── Mock factory ──────────────────────────────────────────────────────────────

function makeObject(
  name: string,
  description: string,
  version = "1.0.0",
  score = 0.5,
): NpmSearchObject {
  return {
    package: {
      name,
      description,
      version,
      keywords: ["foundation-plugin"],
      links: { npm: `https://www.npmjs.com/package/${name}` },
      date: "2026-01-01T00:00:00.000Z",
    },
    score: {
      final: score,
      detail: { quality: score, popularity: score, maintenance: score },
    },
    searchScore: score,
  };
}

function mockFetch(response: NpmSearchResponse) {
  return async (_url: string): Promise<{ json(): Promise<unknown> }> => ({
    json: async () => response,
  });
}

function mockFetchError(message: string) {
  return async (_url: string): Promise<never> => {
    throw new Error(message);
  };
}

// ── searchPlugins — basic behaviour ──────────────────────────────────────────

describe("searchPlugins — basic behaviour", () => {
  it("returns empty array when registry returns no objects", async () => {
    const response: NpmSearchResponse = { objects: [], total: 0, time: "" };
    const results = await searchPlugins("stripe", {
      fetchFn: mockFetch(response),
    });
    expect(results).toHaveLength(0);
  });

  it("returns all results when query matches all descriptions", async () => {
    const response: NpmSearchResponse = {
      objects: [
        makeObject("foundation-plugin-stripe", "Stripe payment integration"),
        makeObject("foundation-plugin-braintree", "Braintree payment gateway"),
      ],
      total: 2,
      time: "",
    };
    const results = await searchPlugins("payment", {
      fetchFn: mockFetch(response),
    });
    expect(results).toHaveLength(2);
  });

  it("filters by query matching name", async () => {
    const response: NpmSearchResponse = {
      objects: [
        makeObject("foundation-plugin-stripe", "Payment processing"),
        makeObject("foundation-plugin-redis", "Redis caching layer"),
      ],
      total: 2,
      time: "",
    };
    const results = await searchPlugins("stripe", {
      fetchFn: mockFetch(response),
    });
    expect(results).toHaveLength(1);
    expect(results[0]?.name).toBe("foundation-plugin-stripe");
  });

  it("filters by query matching description", async () => {
    const response: NpmSearchResponse = {
      objects: [
        makeObject("foundation-plugin-stripe", "Stripe payment processing"),
        makeObject("foundation-plugin-redis", "In-memory data store"),
      ],
      total: 2,
      time: "",
    };
    const results = await searchPlugins("memory", {
      fetchFn: mockFetch(response),
    });
    expect(results).toHaveLength(1);
    expect(results[0]?.name).toBe("foundation-plugin-redis");
  });

  it("returns all results when query is empty string", async () => {
    const response: NpmSearchResponse = {
      objects: [
        makeObject("foundation-plugin-stripe", "Payments"),
        makeObject("foundation-plugin-redis", "Cache"),
        makeObject("foundation-plugin-openai", "AI"),
      ],
      total: 3,
      time: "",
    };
    const results = await searchPlugins("", {
      fetchFn: mockFetch(response),
    });
    expect(results).toHaveLength(3);
  });

  it("is case-insensitive in query matching", async () => {
    const response: NpmSearchResponse = {
      objects: [
        makeObject("foundation-plugin-stripe", "STRIPE Payment Processing"),
      ],
      total: 1,
      time: "",
    };
    const results = await searchPlugins("stripe", {
      fetchFn: mockFetch(response),
    });
    expect(results).toHaveLength(1);
  });

  it("filters out results that do not match query", async () => {
    const response: NpmSearchResponse = {
      objects: [
        makeObject("foundation-plugin-stripe", "Stripe payments"),
        makeObject("foundation-plugin-sendgrid", "Email delivery"),
        makeObject("foundation-plugin-twilio", "SMS messaging"),
      ],
      total: 3,
      time: "",
    };
    const results = await searchPlugins("sms", {
      fetchFn: mockFetch(response),
    });
    expect(results).toHaveLength(1);
    expect(results[0]?.name).toBe("foundation-plugin-twilio");
  });
});

// ── searchPlugins — result shape ──────────────────────────────────────────────

describe("searchPlugins — result shape", () => {
  it("result has correct name", async () => {
    const response: NpmSearchResponse = {
      objects: [makeObject("foundation-plugin-stripe", "Stripe")],
      total: 1,
      time: "",
    };
    const [result] = await searchPlugins("stripe", { fetchFn: mockFetch(response) });
    expect(result?.name).toBe("foundation-plugin-stripe");
  });

  it("result has correct description", async () => {
    const response: NpmSearchResponse = {
      objects: [makeObject("foundation-plugin-stripe", "Stripe payments")],
      total: 1,
      time: "",
    };
    const [result] = await searchPlugins("stripe", { fetchFn: mockFetch(response) });
    expect(result?.description).toBe("Stripe payments");
  });

  it("result has correct version", async () => {
    const response: NpmSearchResponse = {
      objects: [makeObject("foundation-plugin-stripe", "Stripe", "2.3.4")],
      total: 1,
      time: "",
    };
    const [result] = await searchPlugins("stripe", { fetchFn: mockFetch(response) });
    expect(result?.version).toBe("2.3.4");
  });

  it("result has npmUrl", async () => {
    const response: NpmSearchResponse = {
      objects: [makeObject("foundation-plugin-stripe", "Stripe")],
      total: 1,
      time: "",
    };
    const [result] = await searchPlugins("stripe", { fetchFn: mockFetch(response) });
    expect(result?.npmUrl).toContain("foundation-plugin-stripe");
  });

  it("result has score field", async () => {
    const response: NpmSearchResponse = {
      objects: [makeObject("foundation-plugin-stripe", "Stripe", "1.0.0", 0.88)],
      total: 1,
      time: "",
    };
    const [result] = await searchPlugins("stripe", { fetchFn: mockFetch(response) });
    expect(result?.score).toBeCloseTo(0.88);
  });

  it("falls back to generated npmUrl when links.npm is absent", async () => {
    const obj = makeObject("foundation-plugin-test", "Test");
    const objNoLink: NpmSearchObject = {
      ...obj,
      package: { ...obj.package, links: {} },
    };
    const response: NpmSearchResponse = { objects: [objNoLink], total: 1, time: "" };
    const [result] = await searchPlugins("test", { fetchFn: mockFetch(response) });
    expect(result?.npmUrl).toContain("npmjs.com/package/foundation-plugin-test");
  });

  it("description defaults to empty string when absent", async () => {
    const obj = makeObject("foundation-plugin-nodesc", "");
    const response: NpmSearchResponse = { objects: [obj], total: 1, time: "" };
    const [result] = await searchPlugins("nodesc", { fetchFn: mockFetch(response) });
    expect(result?.description).toBe("");
  });
});

// ── searchPlugins — verified badge ────────────────────────────────────────────

describe("searchPlugins — verified badge", () => {
  it("marks @foundation/* package as verified", async () => {
    const response: NpmSearchResponse = {
      objects: [makeObject("@foundation/plugin-stripe", "Official Stripe plugin")],
      total: 1,
      time: "",
    };
    const results = await searchPlugins("stripe", { fetchFn: mockFetch(response) });
    expect(results[0]?.verified).toBe(true);
  });

  it("marks community foundation-plugin-* as NOT verified", async () => {
    const response: NpmSearchResponse = {
      objects: [makeObject("foundation-plugin-stripe", "Community Stripe plugin")],
      total: 1,
      time: "",
    };
    const results = await searchPlugins("stripe", { fetchFn: mockFetch(response) });
    expect(results[0]?.verified).toBe(false);
  });

  it("marks arbitrary scoped package as NOT verified", async () => {
    const response: NpmSearchResponse = {
      objects: [makeObject("@acme/foundation-plugin-stripe", "ACME Stripe plugin")],
      total: 1,
      time: "",
    };
    const results = await searchPlugins("stripe", { fetchFn: mockFetch(response) });
    expect(results[0]?.verified).toBe(false);
  });
});

// ── searchPlugins — verified-first sorting ────────────────────────────────────

describe("searchPlugins — sorting", () => {
  it("verified packages appear before unverified ones", async () => {
    const response: NpmSearchResponse = {
      objects: [
        makeObject("foundation-plugin-stripe", "Community stripe", "1.0.0", 0.9),
        makeObject("@foundation/plugin-stripe", "Official stripe", "2.0.0", 0.3),
      ],
      total: 2,
      time: "",
    };
    const results = await searchPlugins("stripe", { fetchFn: mockFetch(response) });
    expect(results[0]?.verified).toBe(true);
    expect(results[1]?.verified).toBe(false);
  });

  it("within verified tier, higher score comes first", async () => {
    const response: NpmSearchResponse = {
      objects: [
        makeObject("@foundation/plugin-a", "A plugin", "1.0.0", 0.4),
        makeObject("@foundation/plugin-b", "B plugin", "1.0.0", 0.9),
      ],
      total: 2,
      time: "",
    };
    const results = await searchPlugins("plugin", { fetchFn: mockFetch(response) });
    expect(results[0]?.name).toBe("@foundation/plugin-b");
    expect(results[1]?.name).toBe("@foundation/plugin-a");
  });

  it("within unverified tier, higher score comes first", async () => {
    const response: NpmSearchResponse = {
      objects: [
        makeObject("foundation-plugin-slow", "Slow", "1.0.0", 0.2),
        makeObject("foundation-plugin-fast", "Fast", "1.0.0", 0.8),
        makeObject("foundation-plugin-mid", "Mid", "1.0.0", 0.5),
      ],
      total: 3,
      time: "",
    };
    const results = await searchPlugins("plugin", { fetchFn: mockFetch(response) });
    expect(results[0]?.name).toBe("foundation-plugin-fast");
    expect(results[1]?.name).toBe("foundation-plugin-mid");
    expect(results[2]?.name).toBe("foundation-plugin-slow");
  });

  it("mixed verified and unverified are sorted correctly end-to-end", async () => {
    const response: NpmSearchResponse = {
      objects: [
        makeObject("foundation-plugin-c", "Community C", "1.0.0", 0.9),
        makeObject("foundation-plugin-a", "Community A", "1.0.0", 0.7),
        makeObject("@foundation/plugin-b", "Official B", "1.0.0", 0.3),
        makeObject("@foundation/plugin-d", "Official D", "1.0.0", 0.8),
      ],
      total: 4,
      time: "",
    };
    const results = await searchPlugins("plugin", { fetchFn: mockFetch(response) });

    // First two must be verified
    expect(results[0]?.verified).toBe(true);
    expect(results[1]?.verified).toBe(true);
    // Last two must be unverified
    expect(results[2]?.verified).toBe(false);
    expect(results[3]?.verified).toBe(false);

    // Within verified: d (0.8) before b (0.3)
    expect(results[0]?.name).toBe("@foundation/plugin-d");
    expect(results[1]?.name).toBe("@foundation/plugin-b");

    // Within unverified: c (0.9) before a (0.7)
    expect(results[2]?.name).toBe("foundation-plugin-c");
    expect(results[3]?.name).toBe("foundation-plugin-a");
  });
});

// ── searchPlugins — error handling ────────────────────────────────────────────

describe("searchPlugins — error handling", () => {
  it("throws RegistrySearchError when fetch fails", async () => {
    await expect(
      searchPlugins("stripe", { fetchFn: mockFetchError("network timeout") }),
    ).rejects.toThrow(RegistrySearchError);
  });

  it("RegistrySearchError.query matches the search term", async () => {
    try {
      await searchPlugins("my-query", {
        fetchFn: mockFetchError("connection refused"),
      });
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(RegistrySearchError);
      expect((err as RegistrySearchError).query).toBe("my-query");
    }
  });

  it("RegistrySearchError.code is ERR_REGISTRY_SEARCH", async () => {
    try {
      await searchPlugins("test", { fetchFn: mockFetchError("timeout") });
    } catch (err) {
      expect((err as RegistrySearchError).code).toBe("ERR_REGISTRY_SEARCH");
    }
  });

  it("throws RegistrySearchError when response has no objects field", async () => {
    const badResponse = { total: 0, time: "" } as unknown as NpmSearchResponse;
    await expect(
      searchPlugins("test", { fetchFn: mockFetch(badResponse) }),
    ).rejects.toThrow(RegistrySearchError);
  });

  it("handles objects with missing optional fields gracefully", async () => {
    const minimalObj: NpmSearchObject = {
      package: {
        name: "foundation-plugin-minimal",
        description: "minimal",
        version: "1.0.0",
        links: {},
        date: "",
      },
      score: { final: 0, detail: { quality: 0, popularity: 0, maintenance: 0 } },
      searchScore: 0,
    };
    const response: NpmSearchResponse = {
      objects: [minimalObj],
      total: 1,
      time: "",
    };
    const results = await searchPlugins("minimal", { fetchFn: mockFetch(response) });
    expect(results).toHaveLength(1);
    expect(results[0]?.name).toBe("foundation-plugin-minimal");
  });
});

// ── searchPlugins — URL construction ─────────────────────────────────────────

describe("searchPlugins — URL construction", () => {
  it("includes 'foundation-plugin' keyword in the outgoing query URL", async () => {
    let capturedUrl = "";
    const capturingFetch = async (url: string): Promise<{ json(): Promise<unknown> }> => {
      capturedUrl = url;
      return { json: async () => ({ objects: [], total: 0, time: "" }) };
    };

    await searchPlugins("stripe", { fetchFn: capturingFetch });

    expect(capturedUrl).toContain("foundation-plugin");
    expect(capturedUrl).toContain("stripe");
  });

  it("encodes special characters in the query", async () => {
    let capturedUrl = "";
    const capturingFetch = async (url: string): Promise<{ json(): Promise<unknown> }> => {
      capturedUrl = url;
      return { json: async () => ({ objects: [], total: 0, time: "" }) };
    };

    await searchPlugins("hello world & more", { fetchFn: capturingFetch });

    // URL must be properly encoded — no raw spaces or ampersands
    expect(capturedUrl).not.toMatch(/ /);
  });

  it("uses custom registryUrl when provided", async () => {
    let capturedUrl = "";
    const capturingFetch = async (url: string): Promise<{ json(): Promise<unknown> }> => {
      capturedUrl = url;
      return { json: async () => ({ objects: [], total: 0, time: "" }) };
    };

    await searchPlugins("test", {
      fetchFn: capturingFetch,
      registryUrl: "https://my-registry.example.com/search",
    });

    expect(capturedUrl).toContain("my-registry.example.com");
  });

  it("respects limit option in outgoing URL", async () => {
    let capturedUrl = "";
    const capturingFetch = async (url: string): Promise<{ json(): Promise<unknown> }> => {
      capturedUrl = url;
      return { json: async () => ({ objects: [], total: 0, time: "" }) };
    };

    await searchPlugins("test", { fetchFn: capturingFetch, limit: 5 });

    expect(capturedUrl).toContain("size=5");
  });
});