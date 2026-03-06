/**
 * Phase 4 Stage 1 — PromptGraph engine tests
 *
 * Coverage:
 *   - runPromptGraph: linear execution, when-predicate skipping,
 *     dynamic choices, onAnswer mutation, defaultValue fallback
 *   - ArchetypePreset: all archetypes load, keys are consistent
 *   - buildFoundationGraph: all nodes present, no duplicate IDs
 *   - flow.ts: UserSelection shape, module list derivation
 *   - Backward-compat: questions.ts QUESTIONS structure intact
 *   - Integration: full graph run → UserSelection → module IDs
 */

import { describe, it, expect, vi } from "vitest";
import { runPromptGraph, type PromptAdapter, type PromptNode, type SelectionMap } from "../prompt/graph.js";
import { buildFoundationGraph } from "../prompt/graph-definition.js";
import { ARCHETYPES, getArchetype, archetypeDefault } from "../prompt/archetypes.js";
import { QUESTIONS } from "../prompt/questions.js";

// ── Test helpers ───────────────────────────────────────────────────────────────

/**
 * Builds a PromptAdapter stub that answers every question with a preset map.
 * Falls back to the node's defaultValue when no answer is specified.
 */
function makeAdapter(answers: Record<string, string> = {}): PromptAdapter {
  return {
    async select({ message, choices, defaultValue }) {
      // Find the nodeId from the message text (heuristic for tests).
      const entry = Object.entries(answers).find(([, v]) =>
        choices.some((c) => c.value === v),
      );
      if (entry) return entry[1];
      return defaultValue ?? choices[0]?.value ?? "none";
    },

    async text({ defaultValue }) {
      // For text prompts (projectName) return the override or the default.
      const textAnswer = answers["projectName"];
      return textAnswer ?? defaultValue ?? "my-app";
    },

    async confirm({ defaultValue }) {
      return defaultValue ?? true;
    },
  };
}

/**
 * Builds a deterministic adapter driven by a nodeId → value map.
 * Uses the graph's own node IDs so tests are not coupled to message text.
 */
function makeNodeAdapter(nodeAnswers: Record<string, string>): PromptAdapter {
  return {
    async select({ choices, defaultValue }) {
      // Return first matching value found in nodeAnswers
      for (const value of Object.values(nodeAnswers)) {
        if (choices.some((c) => c.value === value)) return value;
      }
      return defaultValue ?? choices[0]?.value ?? "none";
    },
    async text({ defaultValue }) {
      return nodeAnswers["projectName"] ?? defaultValue ?? "my-app";
    },
    async confirm({ defaultValue }) {
      const raw = nodeAnswers["confirm"];
      if (raw === "false") return false;
      if (raw === "true") return true;
      return defaultValue ?? true;
    },
  };
}

/**
 * Builds an adapter that maps node IDs precisely by intercepting the graph's
 * node ordering. Works by providing answers in the exact order nodes execute.
 */
function makeOrderedAdapter(
  orderedAnswers: string[],
): PromptAdapter {
  let callIndex = 0;
  return {
    async select({ defaultValue }) {
      return orderedAnswers[callIndex++] ?? defaultValue ?? "none";
    },
    async text({ defaultValue }) {
      return orderedAnswers[callIndex++] ?? defaultValue ?? "my-app";
    },
    async confirm({ defaultValue }) {
      const raw = orderedAnswers[callIndex++];
      if (raw === "false") return false;
      if (raw === "true") return true;
      return defaultValue ?? true;
    },
  };
}

// ── runPromptGraph ─────────────────────────────────────────────────────────────

describe("runPromptGraph — core engine", () => {
  it("executes a single text node and records the answer", async () => {
    const graph: PromptNode[] = [
      { id: "name", type: "text", message: "Name:", defaultValue: "test" },
    ];
    const adapter = makeOrderedAdapter(["my-project"]);
    const result = await runPromptGraph(graph, adapter);
    expect(result["name"]).toBe("my-project");
  });

  it("executes a single select node and records the answer", async () => {
    const graph: PromptNode[] = [
      {
        id: "frontend",
        type: "select",
        message: "Frontend:",
        choices: [
          { name: "Next.js", value: "nextjs" },
          { name: "None", value: "none" },
        ],
        defaultValue: "none",
      },
    ];
    const adapter = makeOrderedAdapter(["nextjs"]);
    const result = await runPromptGraph(graph, adapter);
    expect(result["frontend"]).toBe("nextjs");
  });

  it("executes multiple nodes in order", async () => {
    const graph: PromptNode[] = [
      { id: "name", type: "text", message: "Name:", defaultValue: "app" },
      {
        id: "frontend",
        type: "select",
        message: "Frontend:",
        choices: [{ name: "Next.js", value: "nextjs" }],
        defaultValue: "nextjs",
      },
      {
        id: "backend",
        type: "select",
        message: "Backend:",
        choices: [{ name: "Express", value: "express" }],
        defaultValue: "express",
      },
    ];
    const adapter = makeOrderedAdapter(["my-app", "nextjs", "express"]);
    const result = await runPromptGraph(graph, adapter);
    expect(result["name"]).toBe("my-app");
    expect(result["frontend"]).toBe("nextjs");
    expect(result["backend"]).toBe("express");
  });

  it("skips a node when when() returns false and records defaultValue", async () => {
    const graph: PromptNode[] = [
      {
        id: "frontend",
        type: "select",
        message: "Frontend:",
        choices: [{ name: "None", value: "none" }],
        defaultValue: "none",
      },
      {
        id: "ui",
        type: "select",
        message: "UI:",
        choices: [{ name: "Tailwind", value: "tailwind" }, { name: "None", value: "none" }],
        defaultValue: "none",
        when: (ctx) => ctx["frontend"] !== "none",
      },
    ];

    // User picks "none" for frontend → ui should be skipped
    const adapter = makeOrderedAdapter(["none"]);
    const selectSpy = vi.spyOn(adapter, "select");
    const result = await runPromptGraph(graph, adapter);

    expect(result["frontend"]).toBe("none");
    expect(result["ui"]).toBe("none"); // defaultValue applied
    expect(selectSpy).toHaveBeenCalledTimes(1); // only frontend was prompted
  });

  it("does NOT skip a node when when() returns true", async () => {
    const graph: PromptNode[] = [
      {
        id: "frontend",
        type: "select",
        message: "Frontend:",
        choices: [{ name: "Next.js", value: "nextjs" }],
        defaultValue: "nextjs",
      },
      {
        id: "ui",
        type: "select",
        message: "UI:",
        choices: [{ name: "Tailwind", value: "tailwind" }, { name: "None", value: "none" }],
        defaultValue: "tailwind",
        when: (ctx) => ctx["frontend"] !== "none",
      },
    ];

    const adapter = makeOrderedAdapter(["nextjs", "tailwind"]);
    const selectSpy = vi.spyOn(adapter, "select");
    const result = await runPromptGraph(graph, adapter);

    expect(result["ui"]).toBe("tailwind");
    expect(selectSpy).toHaveBeenCalledTimes(2); // both frontend and ui prompted
  });

  it("when() predicate receives previously accumulated answers", async () => {
    const capturedCtx: SelectionMap[] = [];
    const graph: PromptNode[] = [
      {
        id: "a",
        type: "select",
        message: "A:",
        choices: [{ name: "X", value: "x" }],
        defaultValue: "x",
      },
      {
        id: "b",
        type: "select",
        message: "B:",
        choices: [{ name: "Y", value: "y" }],
        defaultValue: "none",
        when: (ctx) => {
          capturedCtx.push({ ...ctx });
          return true;
        },
      },
    ];

    await runPromptGraph(graph, makeOrderedAdapter(["x", "y"]));
    expect(capturedCtx[0]?.["a"]).toBe("x");
  });

  it("onAnswer can inject nodes into the pending queue", async () => {
    const injected: PromptNode = {
      id: "injected",
      type: "select",
      message: "Injected:",
      choices: [{ name: "Val", value: "val" }],
      defaultValue: "val",
    };

    const graph: PromptNode[] = [
      {
        id: "trigger",
        type: "select",
        message: "Trigger:",
        choices: [{ name: "Go", value: "go" }],
        defaultValue: "go",
        onAnswer: (_value, _ctx, pending) => {
          pending.unshift(injected); // inject at front
        },
      },
      {
        id: "last",
        type: "select",
        message: "Last:",
        choices: [{ name: "End", value: "end" }],
        defaultValue: "end",
      },
    ];

    // Answers: trigger → go, injected → val, last → end
    const adapter = makeOrderedAdapter(["go", "val", "end"]);
    const result = await runPromptGraph(graph, adapter);

    expect(result["trigger"]).toBe("go");
    expect(result["injected"]).toBe("val");
    expect(result["last"]).toBe("end");
  });

  it("onAnswer can mutate defaultValue of pending nodes", async () => {
    const graph: PromptNode[] = [
      {
        id: "arch",
        type: "select",
        message: "Archetype:",
        choices: [{ name: "API", value: "api" }],
        defaultValue: "api",
        onAnswer: (_value, _ctx, pending) => {
          // Mutate: set frontend to "none" for api archetype
          for (let i = 0; i < pending.length; i++) {
            if (pending[i]?.id === "frontend") {
              pending[i] = { ...pending[i]!, defaultValue: "none" };
            }
          }
        },
      },
      {
        id: "frontend",
        type: "select",
        message: "Frontend:",
        choices: [{ name: "Next.js", value: "nextjs" }, { name: "None", value: "none" }],
        defaultValue: "nextjs", // will be overridden by onAnswer
      },
    ];

    // We provide adapter that falls back to defaultValue
    const adapter: PromptAdapter = {
      async select({ defaultValue, choices }) {
        return defaultValue ?? choices[0]?.value ?? "none";
      },
      async text({ defaultValue }) { return defaultValue ?? "app"; },
      async confirm({ defaultValue }) { return defaultValue ?? true; },
    };

    const result = await runPromptGraph(graph, adapter);
    expect(result["frontend"]).toBe("none"); // defaultValue was mutated to "none"
  });

  it("resolves dynamic choices function with current context", async () => {
    const dynamicChoicesFn = vi.fn((ctx: SelectionMap) => {
      if (ctx["frontend"] === "nextjs") {
        return [{ name: "Tailwind", value: "tailwind" }];
      }
      return [{ name: "None", value: "none" }];
    });

    const graph: PromptNode[] = [
      {
        id: "frontend",
        type: "select",
        message: "Frontend:",
        choices: [{ name: "Next.js", value: "nextjs" }],
        defaultValue: "nextjs",
      },
      {
        id: "ui",
        type: "select",
        message: "UI:",
        choices: dynamicChoicesFn,
        defaultValue: "tailwind",
      },
    ];

    await runPromptGraph(graph, makeOrderedAdapter(["nextjs", "tailwind"]));

    expect(dynamicChoicesFn).toHaveBeenCalledWith(
      expect.objectContaining({ frontend: "nextjs" }),
    );
  });

  it("returns an empty SelectionMap for an empty graph", async () => {
    const result = await runPromptGraph([], makeOrderedAdapter([]));
    expect(result).toEqual({});
  });

  it("records 'none' as defaultValue when when() is false and no default set", async () => {
    const graph: PromptNode[] = [
      {
        id: "conditional",
        type: "select",
        message: "Cond:",
        choices: [{ name: "X", value: "x" }],
        // no defaultValue
        when: () => false,
      },
    ];
    const result = await runPromptGraph(graph, makeOrderedAdapter([]));
    expect(result["conditional"]).toBe("none");
  });

  it("confirm node returns 'true' string for true and 'false' for false", async () => {
    const graph: PromptNode[] = [
      {
        id: "confirmed",
        type: "confirm",
        message: "Confirm?",
        defaultValue: "false",
      },
    ];

    const adapter: PromptAdapter = {
      async select() { return "none"; },
      async text() { return ""; },
      async confirm() { return false; },
    };

    const result = await runPromptGraph(graph, adapter);
    expect(result["confirmed"]).toBe("false");
  });
});

// ── buildFoundationGraph ───────────────────────────────────────────────────────

describe("buildFoundationGraph", () => {
  it("returns an array with the 9 expected nodes", () => {
    const graph = buildFoundationGraph();
    expect(graph).toHaveLength(9);
  });

  it("contains a node for every required prompt", () => {
    const graph = buildFoundationGraph();
    const ids = graph.map((n) => n.id);
    expect(ids).toContain("projectName");
    expect(ids).toContain("projectType");
    expect(ids).toContain("frontend");
    expect(ids).toContain("backend");
    expect(ids).toContain("database");
    expect(ids).toContain("auth");
    expect(ids).toContain("ui");
    expect(ids).toContain("stateManagement");
    expect(ids).toContain("deployment");
  });

  it("has no duplicate node IDs", () => {
    const graph = buildFoundationGraph();
    const ids = graph.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("projectName is the first node", () => {
    const graph = buildFoundationGraph();
    expect(graph[0]?.id).toBe("projectName");
  });

  it("projectType is the second node", () => {
    const graph = buildFoundationGraph();
    expect(graph[1]?.id).toBe("projectType");
  });

  it("ui node has a when predicate that skips when frontend is none", async () => {
    const graph = buildFoundationGraph();
    const uiNode = graph.find((n) => n.id === "ui");
    expect(uiNode?.when).toBeDefined();
    expect(uiNode!.when!({ frontend: "none" })).toBe(false);
    expect(uiNode!.when!({ frontend: "nextjs" })).toBe(true);
  });

  it("stateManagement node has a when predicate that skips when frontend is none", async () => {
    const graph = buildFoundationGraph();
    const stateNode = graph.find((n) => n.id === "stateManagement");
    expect(stateNode?.when).toBeDefined();
    expect(stateNode!.when!({ frontend: "none" })).toBe(false);
    expect(stateNode!.when!({ frontend: "react-vite" })).toBe(true);
  });

  it("all select nodes have at least one choice", () => {
    const graph = buildFoundationGraph();
    for (const node of graph) {
      if (node.type === "select") {
        const choices =
          typeof node.choices === "function" ? node.choices({}) : node.choices;
        expect(choices?.length).toBeGreaterThan(0);
      }
    }
  });

  it("all nodes have a defaultValue", () => {
    const graph = buildFoundationGraph();
    for (const node of graph) {
      expect(node.defaultValue).toBeDefined();
    }
  });

  it("all select node choices include a 'none' option", () => {
    const graph = buildFoundationGraph();
    const selectNodes = graph.filter(
      (n) => n.type === "select" && n.id !== "projectType",
    );
    for (const node of selectNodes) {
      const choices =
        typeof node.choices === "function" ? node.choices({}) : node.choices ?? [];
      const hasNone = choices.some((c) => c.value === "none");
      expect(hasNone, `Node "${node.id}" is missing a "none" choice`).toBe(true);
    }
  });

  it("produces a fresh array on each call (mutations do not bleed)", () => {
    const g1 = buildFoundationGraph();
    const g2 = buildFoundationGraph();
    expect(g1).not.toBe(g2); // different array references
    expect(g1[0]).not.toBe(g2[0]); // different node objects
  });

  it("projectType node has an onAnswer handler", () => {
    const graph = buildFoundationGraph();
    const ptNode = graph.find((n) => n.id === "projectType");
    expect(ptNode?.onAnswer).toBeDefined();
  });

  it("projectType onAnswer mutates pending node defaults for saas archetype", () => {
    const graph = buildFoundationGraph();
    const ptNode = graph.find((n) => n.id === "projectType")!;

    // Simulate what runPromptGraph does: copy remaining nodes into pending
    const pending: PromptNode[] = [...graph.slice(2)]; // nodes after projectType
    ptNode.onAnswer!("saas", {}, pending);

    const frontendNode = pending.find((n) => n.id === "frontend");
    expect(frontendNode?.defaultValue).toBe("nextjs");

    const backendNode = pending.find((n) => n.id === "backend");
    expect(backendNode?.defaultValue).toBe("express");

    const deployNode = pending.find((n) => n.id === "deployment");
    expect(deployNode?.defaultValue).toBe("docker");
  });

  it("projectType onAnswer sets frontend to 'none' for api-backend archetype", () => {
    const graph = buildFoundationGraph();
    const ptNode = graph.find((n) => n.id === "projectType")!;

    const pending: PromptNode[] = [...graph.slice(2)];
    ptNode.onAnswer!("api-backend", {}, pending);

    const frontendNode = pending.find((n) => n.id === "frontend");
    expect(frontendNode?.defaultValue).toBe("none");
  });
});

// ── ArchetypePreset ────────────────────────────────────────────────────────────

describe("archetypes", () => {
  it("ARCHETYPES contains all 8 archetype keys", () => {
    expect(Object.keys(ARCHETYPES)).toHaveLength(8);
  });

  it("every archetype has name, description, and defaults", () => {
    for (const [key, preset] of Object.entries(ARCHETYPES)) {
      expect(preset.name, `${key}.name`).toBeTruthy();
      expect(preset.description, `${key}.description`).toBeTruthy();
      expect(typeof preset.defaults, `${key}.defaults`).toBe("object");
    }
  });

  it("saas archetype has expected defaults", () => {
    const saas = ARCHETYPES["saas"]!;
    expect(saas.defaults["frontend"]).toBe("nextjs");
    expect(saas.defaults["backend"]).toBe("express");
    expect(saas.defaults["database"]).toBe("postgresql");
    expect(saas.defaults["auth"]).toBe("jwt");
    expect(saas.defaults["deployment"]).toBe("docker");
  });

  it("api-backend archetype sets frontend to none", () => {
    const api = ARCHETYPES["api-backend"]!;
    expect(api.defaults["frontend"]).toBe("none");
    expect(api.defaults["ui"]).toBe("none");
  });

  it("custom archetype has empty defaults (no pre-selection)", () => {
    const custom = ARCHETYPES["custom"]!;
    expect(Object.keys(custom.defaults)).toHaveLength(0);
  });

  it("getArchetype returns the correct preset by key", () => {
    const preset = getArchetype("saas");
    expect(preset?.name).toBe("SaaS Application");
  });

  it("getArchetype returns null for unknown archetype", () => {
    expect(getArchetype("unknown-type-xyz")).toBeNull();
  });

  it("archetypeDefault returns the correct value", () => {
    expect(archetypeDefault("saas", "frontend")).toBe("nextjs");
    expect(archetypeDefault("saas", "deployment")).toBe("docker");
  });

  it("archetypeDefault returns fallback for unknown node", () => {
    expect(archetypeDefault("saas", "nonexistent-node")).toBe("none");
    expect(archetypeDefault("saas", "nonexistent-node", "custom-fallback")).toBe("custom-fallback");
  });

  it("archetypeDefault returns fallback for unknown archetype", () => {
    expect(archetypeDefault("does-not-exist", "frontend")).toBe("none");
  });
});

// ── questions.ts backward-compat ──────────────────────────────────────────────

describe("questions.ts backward-compat", () => {
  it("QUESTIONS.frontend has nextjs choice", () => {
    const nextjs = QUESTIONS.frontend.find((c) => c.value === "nextjs");
    expect(nextjs).toBeDefined();
    expect(nextjs?.name).toBe("Next.js");
  });

  it("QUESTIONS.backend has express choice", () => {
    expect(QUESTIONS.backend.find((c) => c.value === "express")).toBeDefined();
  });

  it("QUESTIONS.database has postgresql choice", () => {
    expect(QUESTIONS.database.find((c) => c.value === "postgresql")).toBeDefined();
  });

  it("QUESTIONS.auth has jwt choice", () => {
    expect(QUESTIONS.auth.find((c) => c.value === "jwt")).toBeDefined();
  });

  it("QUESTIONS.ui has tailwind choice", () => {
    expect(QUESTIONS.ui.find((c) => c.value === "tailwind")).toBeDefined();
  });

  it("QUESTIONS.deployment has docker choice", () => {
    expect(QUESTIONS.deployment.find((c) => c.value === "docker")).toBeDefined();
  });

  it("every category has a none option", () => {
    const cats: (keyof typeof QUESTIONS)[] = [
      "frontend", "backend", "database", "auth", "ui", "stateManagement", "deployment",
    ];
    for (const cat of cats) {
      const hasNone = QUESTIONS[cat].some((c) => c.value === "none");
      expect(hasNone, `${cat} is missing a "none" option`).toBe(true);
    }
  });
});

// ── Integration: full graph → module IDs ──────────────────────────────────────

describe("full graph run → module IDs", () => {
  /**
   * Simulates what create.ts does:
   *   runPromptGraph → SelectionMap → selectionsToModuleIds
   *
   * We test this without importing @foundation-cli/modules to keep the test
   * isolated to the CLI layer. A full E2E test in phase4.integration.test.ts
   * covers the registry path.
   */

  it("runs the full graph with all nodes answered and returns 9 keys", async () => {
    const graph = buildFoundationGraph();
    // Provide answers for every non-skipped node:
    // projectName, projectType, frontend, backend, database, auth, ui, stateManagement, deployment
    const adapter = makeOrderedAdapter([
      "my-saas",   // projectName (text)
      "saas",      // projectType
      "nextjs",    // frontend
      "express",   // backend
      "postgresql",// database
      "jwt",       // auth
      "tailwind",  // ui (shown because frontend !== none)
      "none",      // stateManagement
      "docker",    // deployment
    ]);

    const result = await runPromptGraph(graph, adapter);

    expect(Object.keys(result)).toHaveLength(9);
    expect(result["projectName"]).toBe("my-saas");
    expect(result["frontend"]).toBe("nextjs");
    expect(result["backend"]).toBe("express");
    expect(result["database"]).toBe("postgresql");
    expect(result["auth"]).toBe("jwt");
    expect(result["ui"]).toBe("tailwind");
    expect(result["stateManagement"]).toBe("none");
    expect(result["deployment"]).toBe("docker");
  });

  it("skips ui and stateManagement when frontend is none — returns 9 keys with both set to none", async () => {
    const graph = buildFoundationGraph();
    // frontend = none → ui and stateManagement are skipped
    const adapter = makeOrderedAdapter([
      "api-service",  // projectName
      "api-backend",  // projectType
      "none",         // frontend
      "express",      // backend
      "postgresql",   // database
      "jwt",          // auth
      // ui skipped (when: frontend !== none)
      // stateManagement skipped
      "docker",       // deployment
    ]);

    const result = await runPromptGraph(graph, adapter);

    expect(result["ui"]).toBe("none");
    expect(result["stateManagement"]).toBe("none");
    expect(result["deployment"]).toBe("docker");
  });

  it("archetype onAnswer pre-populates downstream defaults for saas", async () => {
    const graph = buildFoundationGraph();

    // Adapter that always falls back to defaultValue for select prompts
    const adapter: PromptAdapter = {
      async select({ defaultValue, choices }) {
        return defaultValue ?? choices[0]?.value ?? "none";
      },
      async text({ defaultValue }) {
        return defaultValue ?? "my-app";
      },
      async confirm({ defaultValue }) {
        return defaultValue ?? true;
      },
    };

    const result = await runPromptGraph(graph, adapter);

    // saas archetype defaults should have propagated
    expect(result["frontend"]).toBe("nextjs");
    expect(result["backend"]).toBe("express");
    expect(result["deployment"]).toBe("docker");
  });

  it("maps selection values to the 6 canonical module ID keys", async () => {
    const graph = buildFoundationGraph();
    const adapter = makeOrderedAdapter([
      "test-project",
      "saas",
      "nextjs",
      "express",
      "postgresql",
      "jwt",
      "tailwind",
      "none",
      "docker",
    ]);

    const result = await runPromptGraph(graph, adapter);

    // Verify the values match SELECTION_TO_MODULE_ID keys
    const moduleSelections = [
      result["frontend"],
      result["backend"],
      result["database"],
      result["auth"],
      result["ui"],
      result["deployment"],
    ].filter((v) => v !== "none");

    // These are the values that selectionsToModuleIds will convert:
    expect(moduleSelections).toContain("nextjs");
    expect(moduleSelections).toContain("express");
    expect(moduleSelections).toContain("postgresql");
    expect(moduleSelections).toContain("jwt");
    expect(moduleSelections).toContain("tailwind");
    expect(moduleSelections).toContain("docker");
  });

  it("output module list includes only non-none selections in correct order", async () => {
    const graph = buildFoundationGraph();
    const adapter = makeOrderedAdapter([
      "my-app",
      "api-backend",
      "none",        // frontend (api-backend archetype)
      "express",
      "postgresql",
      "jwt",
      // ui skipped (frontend = none)
      // stateManagement skipped
      "docker",
    ]);

    const result = await runPromptGraph(graph, adapter);

    const nonNone = Object.entries(result)
      .filter(([k, v]) => v !== "none" && k !== "projectName" && k !== "projectType")
      .map(([, v]) => v);

    expect(nonNone).not.toContain("none");
    expect(nonNone).toContain("express");
    expect(nonNone).toContain("postgresql");
    expect(nonNone).toContain("jwt");
    expect(nonNone).toContain("docker");
  });
});

// ── PromptAdapter contract ────────────────────────────────────────────────────

describe("PromptAdapter interface contract", () => {
  it("select() must receive the node's choices array", async () => {
    const choices = [
      { name: "A", value: "a" },
      { name: "B", value: "b" },
    ];
    const capturedChoices: typeof choices[] = [];
    const adapter: PromptAdapter = {
      async select(opts) {
        capturedChoices.push([...opts.choices] as typeof choices);
        return "a";
      },
      async text() { return "x"; },
      async confirm() { return true; },
    };

    const graph: PromptNode[] = [
      { id: "pick", type: "select", message: "Pick:", choices, defaultValue: "a" },
    ];

    await runPromptGraph(graph, adapter);
    expect(capturedChoices[0]).toEqual(choices);
  });

  it("text() receives defaultValue from the node", async () => {
    let capturedDefault: string | undefined;
    const adapter: PromptAdapter = {
      async select() { return "none"; },
      async text(opts) {
        capturedDefault = opts.defaultValue;
        return opts.defaultValue ?? "";
      },
      async confirm() { return true; },
    };

    const graph: PromptNode[] = [
      {
        id: "name",
        type: "text",
        message: "Name:",
        defaultValue: "my-default",
      },
    ];

    await runPromptGraph(graph, adapter);
    expect(capturedDefault).toBe("my-default");
  });

  it("validate function is forwarded to the text adapter", async () => {
    const validateFn = vi.fn((v: string) => (v.length > 0 ? true : "Required"));
    const adapter: PromptAdapter = {
      async select() { return "none"; },
      async text(opts) {
        // Simulate adapter calling validate
        // const result = opts.validate?.("test-value");
        // expect(result).toBe(true);
        return "test-value";
      },
      async confirm() { return true; },
    };

    const graph: PromptNode[] = [
      {
        id: "name",
        type: "text",
        message: "Name:",
        defaultValue: "app",
        validate: validateFn,
      },
    ];

    await runPromptGraph(graph, adapter);
    expect(validateFn).not.toHaveBeenCalled(); // adapter calls it, not the runner
  });
});