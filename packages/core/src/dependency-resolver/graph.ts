import type { ModuleManifest } from "@foundation-cli/plugin-sdk";
import { CircularDependencyError } from "../errors.js";

/**
 * Directed Acyclic Graph (DAG) for module dependency resolution.
 *
 * Nodes are module IDs.  An edge A → B means "A requires B" (B must
 * execute before A).
 */
export class DependencyGraph {
  /** adjacency list: node → set of nodes it depends on */
  readonly #edges: Map<string, Set<string>> = new Map();
  /** all node ids in insertion order */
  readonly #nodes: Set<string> = new Set();

  addNode(id: string): void {
    if (!this.#nodes.has(id)) {
      this.#nodes.add(id);
      this.#edges.set(id, new Set());
    }
  }

  addEdge(from: string, to: string): void {
    this.addNode(from);
    this.addNode(to);
    this.#edges.get(from)!.add(to);
  }

  getDependencies(id: string): ReadonlySet<string> {
    return this.#edges.get(id) ?? new Set();
  }

  nodes(): ReadonlyArray<string> {
    return Array.from(this.#nodes);
  }

  /**
   * Returns nodes in topological order (dependencies-first).
   * Throws CircularDependencyError if a cycle is detected.
   */
  topologicalSort(): ReadonlyArray<string> {
    // Kahn's algorithm — breadth-first, stable relative to insertion order.
    const inDegree = new Map<string, number>();

    for (const node of this.#nodes) {
      if (!inDegree.has(node)) inDegree.set(node, 0);
      for (const dep of this.#edges.get(node) ?? []) {
        inDegree.set(dep, (inDegree.get(dep) ?? 0) + 1);
      }
    }

    // Recalculate in-degree: edge A→B means B is depended on by A,
    // so B must come first. In-degree here = "how many nodes depend on me".
    // We want nodes with in-degree 0 (nothing depends on them upstream) to
    // go last — actually we need a proper in-degree from the perspective of
    // "which nodes must I wait for".
    //
    // Re-state: edge from→to means "from depends on to", so to must come
    // before from in the output.  In-degree of a node N = number of nodes
    // that must come AFTER N (N's dependents).  We want to emit nodes whose
    // dependents are all still waiting — i.e., nodes whose out-degree
    // (number of dependencies) has been satisfied.
    //
    // Simplest correct formulation with Kahn's:
    // Reverse the edge meaning: build a graph where an edge B→A means
    // "A depends on B" (B before A), giving in-degree of A = number of
    // things A depends on.  Start with nodes of in-degree 0.

    const dependsOnCount = new Map<string, number>();
    const reversedEdges = new Map<string, Set<string>>();

    for (const node of this.#nodes) {
      if (!dependsOnCount.has(node)) dependsOnCount.set(node, 0);
      if (!reversedEdges.has(node)) reversedEdges.set(node, new Set());
    }

    for (const [node, deps] of this.#edges) {
      for (const dep of deps) {
        // node depends on dep → dep must come before node
        // in-degree of node increases
        dependsOnCount.set(node, (dependsOnCount.get(node) ?? 0) + 1);
        if (!reversedEdges.has(dep)) reversedEdges.set(dep, new Set());
        reversedEdges.get(dep)!.add(node);
      }
    }

    const queue: string[] = [];
    for (const node of this.#nodes) {
      if ((dependsOnCount.get(node) ?? 0) === 0) {
        queue.push(node);
      }
    }

    const sorted: string[] = [];
    while (queue.length > 0) {
      const node = queue.shift()!;
      sorted.push(node);

      for (const dependent of reversedEdges.get(node) ?? []) {
        const remaining = (dependsOnCount.get(dependent) ?? 1) - 1;
        dependsOnCount.set(dependent, remaining);
        if (remaining === 0) {
          queue.push(dependent);
        }
      }
    }

    if (sorted.length !== this.#nodes.size) {
      // Cycle detected — find one cycle path for the error message.
      const cycle = this.#findCycle();
      throw new CircularDependencyError(cycle);
    }

    // sorted is dependencies-first (correct execution order).
    return sorted;
  }

  /**
   * Finds a single cycle in the graph using DFS.
   * Called only when a cycle is known to exist.
   */
  #findCycle(): ReadonlyArray<string> {
    const WHITE = 0; // unvisited
    const GRAY = 1; // in current DFS path
    const BLACK = 2; // fully visited

    const color = new Map<string, number>();
    const parent = new Map<string, string | null>();

    for (const node of this.#nodes) {
      color.set(node, WHITE);
      parent.set(node, null);
    }

    let cycleStart: string | null = null;
    let cycleEnd: string | null = null;

    const dfs = (u: string): boolean => {
      color.set(u, GRAY);
      for (const v of this.#edges.get(u) ?? []) {
        if (color.get(v) === GRAY) {
          cycleStart = v;
          cycleEnd = u;
          return true;
        }
        if (color.get(v) === WHITE) {
          parent.set(v, u);
          if (dfs(v)) return true;
        }
      }
      color.set(u, BLACK);
      return false;
    };

    for (const node of this.#nodes) {
      if (color.get(node) === WHITE) {
        if (dfs(node)) break;
      }
    }

    if (cycleStart === null || cycleEnd === null) {
      return ["unknown cycle"];
    }

    // Reconstruct path from cycleStart to cycleEnd.
    const path: string[] = [cycleStart];
    let cur: string | null = cycleEnd;
    while (cur !== null && cur !== cycleStart) {
      path.unshift(cur);
      cur = parent.get(cur) ?? null;
    }
    path.unshift(cycleStart);
    return path;
  }
}

/**
 * Builds a DependencyGraph from a set of ModuleManifests.
 * Edges are added for each entry in `manifest.compatibility.requires`.
 */
export function buildDependencyGraph(
  manifests: ReadonlyArray<ModuleManifest>,
): DependencyGraph {
  const graph = new DependencyGraph();

  for (const manifest of manifests) {
    graph.addNode(manifest.id);
  }

  for (const manifest of manifests) {
    for (const required of manifest.compatibility.requires ?? []) {
      graph.addEdge(manifest.id, required);
    }
  }

  return graph;
}