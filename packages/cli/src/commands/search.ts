import chalk from "chalk";
import ora from "ora";
import { searchPlugins, RegistrySearchError } from "@systemlabs/foundation-core";
import type { PluginSearchResult } from "@systemlabs/foundation-core";
import { printError } from "../ui/renderer.js";

// ── Layout constants ──────────────────────────────────────────────────────────

const COL_NAME = 38;
const COL_VERSION = 10;
const COL_DESC = 52;
const SEP = chalk.dim("─".repeat(COL_NAME + COL_VERSION + COL_DESC + 6));

// ── Entry point ───────────────────────────────────────────────────────────────

export async function runSearchCommand(
  args: ReadonlyArray<string>,
): Promise<void> {
  const query = args.join(" ").trim();

  process.stdout.write(
    `\n  ${chalk.bold("Searching plugins")}${query ? ` for ${chalk.yellow(`"${query}"`)}` : ""}…\n\n`,
  );

  const spinner = ora({
    text: chalk.dim("Querying npm registry…"),
    color: "cyan",
  }).start();

  let results;
  try {
    results = await searchPlugins(query);
    spinner.stop();
  } catch (err) {
    spinner.fail(chalk.red("Registry search failed."));
    if (err instanceof RegistrySearchError) {
      printError(err.message);
    } else {
      printError(err instanceof Error ? err.message : String(err));
    }
    process.exit(1);
  }

  if (results.length === 0) {
    process.stdout.write(
      chalk.dim(`  No plugins found${query ? ` matching "${query}"` : ""}.`) +
        "\n\n" +
        chalk.dim(
          "  Tip: plugins must be published to npm with the keyword 'foundation-plugin'.\n\n",
        ),
    );
    return;
  }

  printResultsTable(results, query);
}

// ── Table renderer ────────────────────────────────────────────────────────────

function printResultsTable(
  results: ReadonlyArray<PluginSearchResult>,
  query: string,
): void {
  const verifiedCount = results.filter((r) => r.verified).length;

  // Header
  process.stdout.write(`  ${SEP}\n`);
  process.stdout.write(
    "  " +
      chalk.bold.white(padRight("PACKAGE", COL_NAME)) +
      chalk.bold.white(padRight("VERSION", COL_VERSION)) +
      chalk.bold.white("DESCRIPTION") +
      "\n",
  );
  process.stdout.write(`  ${SEP}\n`);

  // Rows
  for (const result of results) {
    printResultRow(result, query);
  }

  process.stdout.write(`  ${SEP}\n`);

  // Summary
  const total = results.length;
  const verifiedNote =
    verifiedCount > 0
      ? chalk.dim(` (${verifiedCount} verified ✓)`)
      : "";
  process.stdout.write(
    `\n  ${chalk.dim(`${total} plugin${total === 1 ? "" : "s"} found`)}${verifiedNote}\n`,
  );

  // Install hint
  process.stdout.write(
    chalk.dim(
      `\n  Install with: ${chalk.white("foundation add <name>")}\n\n`,
    ),
  );
}

function printResultRow(result: PluginSearchResult, query: string): void {
  // Name column: verified badge + highlighted query match
  const badge = result.verified
    ? chalk.bold.green("✓ ")
    : chalk.dim("  ");

  const rawName = result.name;
  const displayName = result.verified
    ? chalk.bold.green(highlightMatch(rawName, query))
    : chalk.cyan(highlightMatch(rawName, query));

  // Strip ANSI for length calculation, pad to column width
  const nameStripped = stripAnsi(badge + rawName);
  const namePadding = Math.max(0, COL_NAME - nameStripped.length);

  // Version column
  const version = chalk.yellow(result.version.padEnd(COL_VERSION));

  // Description column: truncate + highlight
  const desc = truncate(
    highlightMatch(result.description || chalk.dim("(no description)"), query),
    COL_DESC,
  );

  process.stdout.write(
    `  ${badge}${displayName}${" ".repeat(namePadding)}${version}${desc}\n`,
  );
}

// ── Formatting helpers ────────────────────────────────────────────────────────

function padRight(str: string, width: number): string {
  const visible = stripAnsi(str);
  return str + " ".repeat(Math.max(0, width - visible.length));
}

function truncate(str: string, maxVisible: number): string {
  const visible = stripAnsi(str);
  if (visible.length <= maxVisible) return str;
  // Truncate on visible characters — can't easily split ANSI mid-escape,
  // so strip first, truncate, re-highlight.
  return visible.slice(0, maxVisible - 1) + chalk.dim("…");
}

function highlightMatch(text: string, query: string): string {
  if (!query.trim()) return text;
  // Simple case-insensitive highlight — replace visible matches with bold
  const q = query.trim();
  try {
    const regex = new RegExp(
      `(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
      "gi",
    );
    return text.replace(regex, (match) => chalk.bold.white(match));
  } catch {
    return text;
  }
}

/** Minimal ANSI escape stripper — enough for column-width calculation. */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}
