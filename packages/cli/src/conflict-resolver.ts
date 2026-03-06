/**
 * resolveConflictsInteractively
 *
 * For each detected dependency conflict, prints the conflict details and
 * prompts the user to pick a version. Returns a Map keyed by
 * `"${scope}::${packageName}"` → chosen version, ready to pass to
 * `buildCompositionPlanWithOverrides`.
 *
 * Uses @inquirer/prompts `select` directly (no PromptGraph needed — this
 * is a one-off resolution step, not part of the main creation flow).
 */

import { select } from "@inquirer/prompts";
import chalk from "chalk";
import type { DependencyConflict } from "@foundation-cli/core";

export async function resolveConflictsInteractively(
  conflicts: ReadonlyArray<DependencyConflict>,
): Promise<Map<string, string>> {
  const overrides = new Map<string, string>();

  process.stdout.write("\n");
  process.stdout.write(
    chalk.bold.red("  Dependency conflict detected:\n"),
  );
  process.stdout.write(chalk.dim("  " + "─".repeat(50)) + "\n");

  for (const conflict of conflicts) {
    // Print conflict details
    process.stdout.write(
      `\n  ${chalk.bold.yellow(conflict.packageName)}\n`,
    );
    for (const claim of conflict.claims) {
      process.stdout.write(
        `    ${chalk.dim("-")} ${chalk.cyan(claim.moduleId)} requires ${chalk.green(claim.version)}\n`,
      );
    }
    process.stdout.write("\n");

    // Deduplicate versions while preserving order
    const seen = new Set<string>();
    const versions: string[] = [];
    for (const claim of conflict.claims) {
      if (!seen.has(claim.version)) {
        seen.add(claim.version);
        versions.push(claim.version);
      }
    }

    const chosen = await select({
      message: `Choose version to install for ${chalk.bold(conflict.packageName)}:`,
      choices: versions.map((v) => ({
        name: v,
        value: v,
      })),
    });

    const key = `${conflict.scope}::${conflict.packageName}`;
    overrides.set(key, chosen);

    process.stdout.write(
      `  ${chalk.green("✔")} ${chalk.dim(`${conflict.packageName}: pinned to`)} ${chalk.green(chosen)}\n`,
    );
  }

  process.stdout.write("\n");
  return overrides;
}