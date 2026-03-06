import chalk from "chalk";
import ora, { type Ora } from "ora";
import type { PipelineEvent, PipelineStage } from "@foundation-cli/core";

const SEP_FULL = chalk.dim("━".repeat(52));
const SEP_THIN = chalk.dim("─".repeat(52));

// ── Step spinner ──────────────────────────────────────────────────────────────

/**
 * Creates a one-shot spinner for a discrete CLI step (resolve, plan, etc.).
 * Call `.succeed()` / `.fail()` when the step completes.
 */
export function createStepSpinner(text: string): Ora {
  return ora({ text: chalk.dim(text), color: "cyan", spinner: "dots" }).start();
}

// ── Banner / sections ─────────────────────────────────────────────────────────

export function printBanner(): void {
  process.stdout.write("\n");
  process.stdout.write(SEP_FULL + "\n");
  process.stdout.write(chalk.bold.white("  🚀  FOUNDATION CLI") + "\n");
  process.stdout.write(chalk.dim("  Build your app architecture in minutes") + "\n");
  process.stdout.write(SEP_FULL + "\n\n");
}

export function printSection(title: string): void {
  process.stdout.write(`\n${chalk.bold.cyan(`  ${title}`)}\n`);
  process.stdout.write(SEP_THIN + "\n");
}

export function printRow(label: string, value: string): void {
  const isNone = value === "none" || value === "None";
  const displayValue = isNone ? chalk.dim("None") : chalk.green(value);
  process.stdout.write(
    `  ${chalk.dim((label + ":").padEnd(18))} ${displayValue}\n`,
  );
}

// ── Success ───────────────────────────────────────────────────────────────────

export function printSuccess(projectName: string): void {
  process.stdout.write(`\n${SEP_FULL}\n`);
  process.stdout.write(chalk.bold.green("  ✔  Project created successfully!\n"));
  process.stdout.write(`${SEP_FULL}\n\n`);
  process.stdout.write(`  ${chalk.bold("Next steps:")}\n\n`);
  process.stdout.write(`  ${chalk.cyan("cd")} ${chalk.yellow(projectName)}\n`);
  process.stdout.write(`  ${chalk.cyan("npm install")}\n`);
  process.stdout.write(`  ${chalk.cyan("npm run dev")}\n`);
  process.stdout.write(`\n${SEP_FULL}\n\n`);
}

// ── Error / abort ─────────────────────────────────────────────────────────────

export function printError(message: string): void {
  process.stderr.write(
    `\n  ${chalk.bold.red("✖ Error:")} ${chalk.red(message)}\n\n`,
  );
}

export function printAbort(): void {
  process.stdout.write(chalk.yellow("\n  Aborted. No files were written.\n\n"));
}

// ── Module list ───────────────────────────────────────────────────────────────

export function printModuleList(
  moduleIds: ReadonlyArray<string>,
  pluginIds: ReadonlySet<string> = new Set(),
): void {
  process.stdout.write("\n");

  if (moduleIds.length === 0) {
    process.stdout.write(`  ${chalk.dim("(no modules registered)")}\n`);
    process.stdout.write("\n");
    return;
  }

  for (const id of moduleIds) {
    const label = pluginIds.has(id) ? chalk.magenta(id) : colourModuleId(id);
    process.stdout.write(`  ${chalk.dim("-")} ${label}\n`);
  }

  process.stdout.write("\n");
}

function colourModuleId(id: string): string {
  if (id.startsWith("frontend-"))   return chalk.cyan(id);
  if (id.startsWith("backend-"))    return chalk.cyan(id);
  if (id.startsWith("database-"))   return chalk.green(id);
  if (id.startsWith("auth-"))       return chalk.yellow(id);
  if (id.startsWith("ui-"))         return chalk.blue(id);
  if (id.startsWith("deployment-")) return chalk.blue(id);
  if (id.startsWith("plugin-"))     return chalk.magenta(id);
  return chalk.white(id);
}

// ── Pipeline renderer ─────────────────────────────────────────────────────────

/**
 * Maps every PipelineStage to a user-facing label with an icon.
 */
const STAGE_LABELS: Record<PipelineStage, string> = {
  "before-write":   "🔧  Running pre-write hooks",
  "write-files":    "📝  Writing files",
  "apply-patches":  "🔩  Applying config patches",
  "before-install": "🔧  Running pre-install hooks",
  "install-deps":   "📦  Installing dependencies",
  "after-install":  "🔧  Running post-install hooks",
  "after-write":    "🔧  Running post-write hooks",
  "write-state":    "💾  Saving project state",
  "complete":       "✔   Done",
  "finalize":       "🎬  Finalizing",
};

/**
 * Creates a managed Ora spinner driven by pipeline progress events.
 *
 * Each stage transition prints a `✔ <stage>` success line and starts a
 * new spinner for the next stage, giving the user a visible step-by-step
 * progress trail:
 *
 *   ✔ Writing files            (3 files)
 *   ✔ Applying config patches  (2 patches)
 *   ⠿ Installing dependencies…
 */
export function createPipelineRenderer(): {
  handler: (event: PipelineEvent) => void;
  spinner: Ora;
  stop: () => void;
} {
  const spinner = ora({
    color: "cyan",
    spinner: "dots",
    text: chalk.dim("Initialising…"),
  }).start();

  let currentStage: PipelineStage | null = null;

  const handler = (event: PipelineEvent): void => {
    const label = STAGE_LABELS[event.stage] ?? event.stage;

    if (event.stage === "complete") {
      spinner.succeed(chalk.green(label));
      return;
    }

    // Transition: succeed previous stage, start new one
    if (currentStage !== null && currentStage !== event.stage) {
      const prevLabel = STAGE_LABELS[currentStage] ?? currentStage;
      spinner.succeed(chalk.dim(prevLabel));
    }

    currentStage = event.stage;

    if (event.message.toLowerCase().includes("fail")) {
      spinner.fail(chalk.red(`${label}: ${event.message}`));
      return;
    }

    spinner.text = chalk.dim(`${label}…`) +
      (event.message ? chalk.dim(`  ${event.message}`) : "");
  };

  const stop = (): void => {
    if (spinner.isSpinning) spinner.stop();
  };

  return { handler, spinner, stop };
}

// ── Summary table ─────────────────────────────────────────────────────────────

export function printSummaryTable(
  rows: ReadonlyArray<{ label: string; value: string }>,
): void {
  process.stdout.write("\n");
  for (const row of rows) printRow(row.label, row.value);
  process.stdout.write("\n");
}