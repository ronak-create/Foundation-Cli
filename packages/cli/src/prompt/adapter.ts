/**
 * @inquirer/prompts adapter — production PromptAdapter implementation.
 *
 * This module is the only place in the codebase that imports
 * @inquirer/prompts directly. Everything else depends on the PromptAdapter
 * interface, which makes the graph runner fully testable without a TTY.
 *
 * @module prompt/adapter
 */

import { input, select, confirm } from "@inquirer/prompts";
import chalk from "chalk";
import type { PromptAdapter, PromptChoice } from "./graph.js";

/**
 * Production adapter that delegates to @inquirer/prompts.
 *
 * select() wraps the inquirer `select` prompt.
 * text()   wraps the inquirer `input` prompt.
 * confirm() wraps the inquirer `confirm` prompt.
 */
export const inquirerAdapter: PromptAdapter = {
  async select({ message, choices, defaultValue }): Promise<string> {
    const inquirerChoices = choices.map((c: PromptChoice) => ({
      name: formatChoiceName(c),
      value: c.value, // matches RawSelections string type
      ...(c.disabled !== undefined && { disabled: c.disabled }),
    }));

    // Type the result explicitly
    const result = await select({
      message,
      choices: inquirerChoices,
      ...(defaultValue !== undefined && { default: defaultValue }),
    });

    return result;
  },

  async text({ message, defaultValue, validate, transformer }): Promise<string> {
    return input({
      message,
      ...(defaultValue !== undefined && { default: defaultValue }),
      ...(validate && { validate }),
      ...(transformer && { transformer }),
    });
  },

  async confirm({ message, defaultValue }): Promise<boolean> {
    return confirm({
      message,
      default: defaultValue ?? true,
    });
  },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Formats a PromptChoice into a display string for the inquirer `name` field.
 *
 * If the choice has a `hint`, it is rendered dim and appended after the name:
 *   "Next.js  App Router · TypeScript · SSR/SSG"
 */
function formatChoiceName(choice: PromptChoice): string {
  if (choice.hint) {
    return `${choice.name}  ${chalk.dim(choice.hint)}`;
  }
  return choice.name;
}
