/**
 * PromptGraph Engine
 *
 * Implements §9 of the Foundation CLI Architecture Specification.
 *
 * A PromptGraph is a directed acyclic graph (DAG) where each node represents
 * one interactive question. Nodes may declare:
 *
 *   - `when`        — predicate over prior answers; if false the node is skipped
 *   - `choices`     — static array OR dynamic function(ctx) for context-aware options
 *   - `onAnswer`    — optional side-effect; may inject nodes into the graph
 *   - `validate`    — user-input validator
 *
 * Execution is linear (no backtracking in this stage). Skipped nodes receive
 * their `defaultValue` automatically so downstream `when` predicates always
 * have a stable value to inspect.
 *
 * @module prompt/graph
 */

// ── Types ──────────────────────────────────────────────────────────────────────

/** The accumulated map of answers produced as the graph executes. */
export type SelectionMap = Readonly<Record<string, string>>;

/** A single selectable option inside a prompt node. */
export interface PromptChoice {
  /** Display label shown in the terminal. */
  readonly name: string;
  /** Canonical value stored in SelectionMap. */
  readonly value: string;
  /** Optional dimmed hint rendered below the label. */
  readonly hint?: string;
  /** When true the choice is shown but cannot be selected. */
  readonly disabled?: boolean | string;
}

/**
 * A single node in the PromptGraph.
 *
 * Currently supports `select` and `text` types — the two types needed for
 * Phase 4 Stage 1. Additional types (multiselect, confirm, autocomplete)
 * are reserved for later phases.
 */
export type PromptNodeType = "select" | "text" | "confirm";

export interface PromptNode {
  /** Unique key — also becomes the key in SelectionMap. */
  readonly id: string;

  /** Prompt interaction type. */
  readonly type: PromptNodeType;

  /** Question text displayed to the user. */
  readonly message: string;

  /**
   * Choices for `select` type.
   * May be a static array or a function that receives the answers collected
   * so far and returns an array (dynamic choices based on prior answers).
   */
  readonly choices?: ReadonlyArray<PromptChoice> | ((ctx: SelectionMap) => ReadonlyArray<PromptChoice>);

  /** Default answer value. Used when the node is skipped (when=false). */
  readonly defaultValue?: string;

  /**
   * Optional predicate. If it returns false, this node is skipped entirely
   * and `defaultValue` is recorded automatically.
   *
   * @param ctx  All answers collected before this node.
   */
  readonly when?: (ctx: SelectionMap) => boolean;

  /**
   * Optional validation function for `text` nodes.
   * Return an error string to reject the input, or `true` to accept.
   */
  readonly validate?: (value: string) => string | true;

  /**
   * Optional transformer displayed in the prompt input for `text` nodes.
   * Does NOT affect the stored value.
   */
  readonly transformer?: (value: string) => string;

  /**
   * Optional side-effect fired after this node is answered.
   * May mutate the `pendingNodes` array to inject additional nodes
   * after the current position.
   */
  readonly onAnswer?: (
    value: string,
    ctx: SelectionMap,
    pendingNodes: PromptNode[],
  ) => void;
}

/** Ordered list of PromptNodes forming the graph. */
export type PromptGraph = ReadonlyArray<PromptNode>;

// ── Runner ─────────────────────────────────────────────────────────────────────

/**
 * Executes a PromptGraph sequentially.
 *
 * Each node is evaluated in order:
 *   1. If `when(ctx)` returns false → record `defaultValue` and advance.
 *   2. Otherwise → prompt the user and record their answer.
 *   3. Fire `onAnswer` (may inject additional nodes after the current position).
 *
 * Returns the fully-populated SelectionMap after all nodes have run.
 *
 * @param graph    Ordered array of PromptNodes.
 * @param promptFn Dependency-injected prompt adapter (production uses @inquirer/prompts;
 *                 tests pass a stub). This keeps the runner fully unit-testable.
 */
export async function runPromptGraph(
  graph: PromptGraph,
  promptFn: PromptAdapter,
): Promise<SelectionMap> {
  // We work with a mutable copy so onAnswer nodes can splice new items in.
  const pending: PromptNode[] = [...graph];
  const answers: Record<string, string> = {};

  while (pending.length > 0) {
    // Safe: we checked length above.
    const node = pending.shift()!;

    // ── Evaluate `when` predicate ────────────────────────────────────────────
    if (node.when !== undefined && !node.when(answers)) {
      answers[node.id] = node.defaultValue ?? "none";
      continue;
    }

    // ── Resolve choices ──────────────────────────────────────────────────────
    const resolvedChoices: ReadonlyArray<PromptChoice> =
      typeof node.choices === "function"
        ? node.choices(answers)
        : (node.choices ?? []);

    // ── Prompt the user ──────────────────────────────────────────────────────
    let answer: string;

    switch (node.type) {
      case "select": {
        answer = await promptFn.select({
          message: node.message,
          choices: resolvedChoices,
          defaultValue: node.defaultValue,
        });
        break;
      }
      case "text": {
        answer = await promptFn.text({
          message: node.message,
          defaultValue: node.defaultValue,
          validate: node.validate,
          transformer: node.transformer,
        });
        break;
      }
      case "confirm": {
        const raw = await promptFn.confirm({
          message: node.message,
          defaultValue: node.defaultValue === "true",
        });
        answer = raw ? "true" : "false";
        break;
      }
    }

    answers[node.id] = answer;

    // ── Fire onAnswer side-effect ────────────────────────────────────────────
    node.onAnswer?.(answer, answers, pending);
  }

  return answers as SelectionMap;
}

// ── Prompt adapter interface ───────────────────────────────────────────────────

/**
 * Thin adapter interface over @inquirer/prompts (or any stub in tests).
 *
 * Keeping this as a plain interface (not importing @inquirer/prompts directly
 * in this module) means the graph runner can be unit-tested without a TTY.
 */
export interface PromptAdapter {
  select(options: {
    message: string;
    choices: ReadonlyArray<PromptChoice>;
    defaultValue?: string;
  }): Promise<string>;

  text(options: {
    message: string;
    defaultValue?: string;
    validate?: (value: string) => string | true;
    transformer?: (value: string) => string;
  }): Promise<string>;

  confirm(options: {
    message: string;
    defaultValue?: boolean;
  }): Promise<boolean>;
}