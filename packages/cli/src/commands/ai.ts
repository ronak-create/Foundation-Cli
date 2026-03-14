// cli/src/commands/ai.ts
//
// Phase 7 — Feature 15 (Optional AI Assistant)
//
// `foundation ai "<prompt>"`
//
// This feature is OPTIONAL and gated behind an API key environment variable.
// It requires ANTHROPIC_API_KEY (preferred) or OPENAI_API_KEY to be set.
// If neither is present, it prints a setup guide and exits cleanly.
//
// Flow:
//   1. Check for API key — exit with guide if absent
//   2. Build the system prompt from the module catalogue + schema format
//   3. Send the user's natural-language prompt to the model
//   4. Parse the structured JSON response: { modules, models, generate }
//   5. For each module  → call runAddCommand
//   6. For each model   → call runGenerateCommand(["model", name, ...fields])
//   7. For each crud    → call runGenerateCommand(["crud", name])
//
// Example:
//   foundation ai "create a blog system with comments and JWT auth"
//
// The model returns something like:
//   {
//     "modules": ["auth-jwt", "database-postgresql", "orm-prisma"],
//     "models": [
//       { "name": "Post",    "fields": [{ "name": "title", "type": "string" }, ...] },
//       { "name": "Comment", "fields": [{ "name": "body",  "type": "string" }, ...] }
//     ],
//     "generate": ["Post", "Comment"]
//   }

import https   from "node:https";
import chalk   from "chalk";
import ora     from "ora";
import {
  isFoundationProject,
//   type ORMFieldDefinition,
} from "@systemlabs/foundation-core";
import { SELECTION_TO_MODULE_ID } from "@systemlabs/foundation-modules";
import { printError, printSection } from "../ui/renderer.js";
import { runAddCommand }      from "./add.js";
import { runGenerateCommand } from "./generate.js";

// ── Types for the AI response ─────────────────────────────────────────────────

interface AIModelSpec {
  readonly name: string;
  readonly fields: ReadonlyArray<{
    readonly name: string;
    readonly type: string;
    readonly required?: boolean;
    readonly unique?: boolean;
  }>;
}

interface AIResponse {
  readonly modules:  ReadonlyArray<string>;
  readonly models:   ReadonlyArray<AIModelSpec>;
  readonly generate: ReadonlyArray<string>;
}

// ── Entry point ───────────────────────────────────────────────────────────────

export async function runAiCommand(
  args: ReadonlyArray<string>,
): Promise<void> {
  const prompt = args.join(" ").trim();

  // ── Gate: require API key ─────────────────────────────────────────────────
  const anthropicKey = process.env["ANTHROPIC_API_KEY"];
  const openaiKey    = process.env["OPENAI_API_KEY"];

  if (!anthropicKey && !openaiKey) {
    printAiSetupGuide();
    process.exit(0);
  }

  if (!prompt) {
    process.stdout.write(
      `\n  ${chalk.bold("Usage:")} ${chalk.cyan("foundation ai")} ${chalk.dim('"<your prompt>"')}\n\n` +
      `  ${chalk.bold("Examples:")}\n` +
      `    ${chalk.dim('foundation ai "create a blog with comments and JWT auth"')}\n` +
      `    ${chalk.dim('foundation ai "e-commerce app with Stripe payments"')}\n\n`,
    );
    process.exit(0);
  }

  const cwd = process.cwd();

  if (!(await isFoundationProject(cwd))) {
    printError(
      "`foundation ai` must be run inside a Foundation project directory.\n" +
      "  Run `foundation create` first to scaffold your project.",
    );
    process.exit(1);
  }

  process.stdout.write(
    `\n  ${chalk.bold("🤖  Foundation AI")}  ${chalk.dim("— powered by " + (anthropicKey ? "Anthropic Claude" : "OpenAI"))}\n\n`,
  );
  process.stdout.write(`  ${chalk.dim("Prompt:")} ${chalk.white(prompt)}\n\n`);

  // ── Call the AI model ─────────────────────────────────────────────────────
  const spinner = ora({ text: chalk.dim("Thinking…"), color: "cyan" }).start();

  let aiResponse: AIResponse;
  try {
    const raw = anthropicKey
      ? await callAnthropic(prompt, anthropicKey)
      : await callOpenAI(prompt, openaiKey!);

    aiResponse = parseAIResponse(raw);
    spinner.succeed(chalk.green("Got a plan from the AI."));
  } catch (err) {
    spinner.fail(chalk.red("AI request failed."));
    printError(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // ── Show the plan ─────────────────────────────────────────────────────────
  printSection("AI Plan");

  if (aiResponse.modules.length > 0) {
    process.stdout.write(`  ${chalk.bold("Modules to add:")}\n`);
    for (const m of aiResponse.modules) {
      process.stdout.write(`    ${chalk.dim("•")} ${chalk.cyan(m)}\n`);
    }
  }
  if (aiResponse.models.length > 0) {
    process.stdout.write(`  ${chalk.bold("Models to generate:")}\n`);
    for (const m of aiResponse.models) {
      process.stdout.write(`    ${chalk.dim("•")} ${chalk.yellow(m.name)} (${m.fields.length} fields)\n`);
    }
  }
  if (aiResponse.generate.length > 0) {
    process.stdout.write(`  ${chalk.bold("CRUD to generate:")}\n`);
    for (const name of aiResponse.generate) {
      process.stdout.write(`    ${chalk.dim("•")} ${chalk.yellow(name)}\n`);
    }
  }
  process.stdout.write("\n");

  // ── Execute the plan ──────────────────────────────────────────────────────

  // Step 1: Add modules
  for (const moduleId of aiResponse.modules) {
    process.stdout.write(`  ${chalk.dim("→")} Adding module: ${chalk.cyan(moduleId)}\n`);
    try {
      await runAddCommand([moduleId]);
    } catch {
      process.stdout.write(
        `  ${chalk.yellow("⚠")}  Skipped ${moduleId} (may already be installed or incompatible)\n`,
      );
    }
  }

  // Step 2: Generate models (non-interactive — pass fields as JSON via env)
  for (const modelSpec of aiResponse.models) {
    process.stdout.write(
      `\n  ${chalk.dim("→")} Generating model: ${chalk.yellow(modelSpec.name)}\n`,
    );
    // Set fields via environment so the interactive prompter is bypassed
    process.env["FOUNDATION_AI_FIELDS"] = JSON.stringify(modelSpec.fields);
    try {
      await runGenerateCommand(["model", modelSpec.name]);
    } catch (err) {
      process.stdout.write(
        `  ${chalk.yellow("⚠")}  Model generation skipped: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    } finally {
      delete process.env["FOUNDATION_AI_FIELDS"];
    }
  }

  // Step 3: Generate CRUD
  for (const name of aiResponse.generate) {
    process.stdout.write(`\n  ${chalk.dim("→")} Generating CRUD: ${chalk.yellow(name)}\n`);
    process.env["FOUNDATION_AI_FIELDS"] = JSON.stringify([]);
    try {
      await runGenerateCommand(["crud", name]);
    } catch (err) {
      process.stdout.write(
        `  ${chalk.yellow("⚠")}  CRUD generation skipped: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    } finally {
      delete process.env["FOUNDATION_AI_FIELDS"];
    }
  }

  process.stdout.write("\n");
  process.stdout.write(chalk.bold.green("  ✔  AI plan executed successfully!\n"));
  process.stdout.write(
    chalk.dim(`\n  Run ${chalk.white("npm install")} to install new packages.\n\n`),
  );
}

// ── Anthropic API call ────────────────────────────────────────────────────────

async function callAnthropic(prompt: string, apiKey: string): Promise<string> {
  const body = JSON.stringify({
    model:      "claude-opus-4-5",
    max_tokens: 1024,
    system:     buildSystemPrompt(),
    messages:   [{ role: "user", content: prompt }],
  });

  return httpPost(
    "api.anthropic.com",
    "/v1/messages",
    {
      "Content-Type":      "application/json",
      "x-api-key":         apiKey,
      "anthropic-version": "2023-06-01",
    },
    body,
  );
}

// ── OpenAI API call ───────────────────────────────────────────────────────────

async function callOpenAI(prompt: string, apiKey: string): Promise<string> {
  const body = JSON.stringify({
    model:    "gpt-4o-mini",
    messages: [
      { role: "system",  content: buildSystemPrompt() },
      { role: "user",    content: prompt },
    ],
    max_tokens: 1024,
  });

  return httpPost(
    "api.openai.com",
    "/v1/chat/completions",
    {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body,
  );
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

function httpPost(
  hostname: string,
  path:     string,
  headers:  Record<string, string>,
  body:     string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname, path, method: "POST", headers: { ...headers, "Content-Length": Buffer.byteLength(body) } },
      (res) => {
        let data = "";
        res.on("data", (chunk: Buffer) => { data += chunk.toString(); });
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`API error ${res.statusCode}: ${data}`));
          } else {
            resolve(data);
          }
        });
      },
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ── Response parsing ──────────────────────────────────────────────────────────

function parseAIResponse(raw: string): AIResponse {
  let parsed: unknown;

  try {
    // Try to extract JSON from Anthropic or OpenAI response envelope
    const envelope = JSON.parse(raw) as Record<string, unknown>;

    // Anthropic format: envelope.content[0].text
    if (Array.isArray(envelope["content"])) {
      const text = (envelope["content"] as Array<{ text?: string }>)[0]?.text ?? "";
      parsed = extractJSON(text);
    }
    // OpenAI format: envelope.choices[0].message.content
    else if (Array.isArray(envelope["choices"])) {
      const content = (envelope["choices"] as Array<{ message?: { content?: string } }>)[0]
        ?.message?.content ?? "";
      parsed = extractJSON(content);
    } else {
      parsed = extractJSON(raw);
    }
  } catch {
    throw new Error(
      "Could not parse AI response as JSON. The model may have returned an unexpected format.",
    );
  }

  return validateAIResponse(parsed);
}

function extractJSON(text: string): unknown {
  // Strip markdown code fences if present
  const stripped = text.replace(/```(?:json)?\n?/g, "").trim();
  // Find the first { ... } block
  const start = stripped.indexOf("{");
  const end   = stripped.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object found in response");
  return JSON.parse(stripped.slice(start, end + 1));
}

function validateAIResponse(parsed: unknown): AIResponse {
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("AI response is not a JSON object.");
  }

  const obj = parsed as Record<string, unknown>;

  const modules  = Array.isArray(obj["modules"])  ? (obj["modules"]  as string[]).filter(s => typeof s === "string") : [];
  const generate = Array.isArray(obj["generate"]) ? (obj["generate"] as string[]).filter(s => typeof s === "string") : [];
  const models   = Array.isArray(obj["models"])
    ? (obj["models"] as unknown[]).filter(isModelSpec)
    : [];

  return { modules, models, generate };
}

function isModelSpec(v: unknown): v is AIModelSpec {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o["name"] === "string" && Array.isArray(o["fields"]);
}

// ── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  const moduleList = Object.entries(SELECTION_TO_MODULE_ID)
    .map(([short, id]) => `  - ${short} (${id})`)
    .join("\n");

  return `You are a Foundation CLI assistant. The user will describe an application they want to build.
Your job is to respond with ONLY a JSON object (no markdown, no explanation) in this exact format:

{
  "modules": ["auth-jwt", "database-postgresql", "orm-prisma"],
  "models": [
    {
      "name": "Post",
      "fields": [
        { "name": "title",   "type": "string",  "required": true  },
        { "name": "content", "type": "string",  "required": true  },
        { "name": "published", "type": "boolean", "required": true }
      ]
    }
  ],
  "generate": ["Post"]
}

Rules:
- "modules" must only contain values from this list:
${moduleList}
- Field "type" must be one of: string, number, boolean, date, uuid, json
- "generate" lists model names that should have full CRUD scaffolding
- Keep it minimal — only suggest what is necessary
- Respond with ONLY valid JSON, nothing else`;
}

// ── Setup guide ───────────────────────────────────────────────────────────────

function printAiSetupGuide(): void {
  process.stdout.write(`
  ${chalk.bold("🤖  Foundation AI")}  ${chalk.dim("— optional AI-powered scaffolding")}

  ${chalk.bold("Setup required:")}

  Set one of these environment variables to enable this feature:

    ${chalk.cyan("ANTHROPIC_API_KEY")}  ${chalk.dim("(recommended — uses Claude)")}
    ${chalk.cyan("OPENAI_API_KEY")}     ${chalk.dim("(alternative — uses GPT-4o mini)")}

  ${chalk.bold("How to get a key:")}
    Anthropic: ${chalk.dim("https://console.anthropic.com/keys")}
    OpenAI:    ${chalk.dim("https://platform.openai.com/api-keys")}

  ${chalk.bold("Usage:")}
    ${chalk.cyan("ANTHROPIC_API_KEY=sk-... foundation ai")} ${chalk.dim('"create a blog with JWT auth"')}

  ${chalk.bold("Or add to your .env file:")}
    ${chalk.dim("ANTHROPIC_API_KEY=sk-ant-...")}

  ${chalk.dim("Note: API calls incur cost. Each 'foundation ai' invocation makes one API call.")}

`);
}