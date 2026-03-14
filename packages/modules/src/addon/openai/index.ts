import type { PluginDefinition } from "@systemlabs/foundation-plugin-sdk";

// ── File templates ────────────────────────────────────────────────────────────

const OPENAI_CLIENT = `\
import OpenAI from "openai";

if (!process.env["OPENAI_API_KEY"]) {
  throw new Error("OPENAI_API_KEY is not set in environment variables.");
}

export const openai = new OpenAI({
  apiKey: process.env["OPENAI_API_KEY"],
  organization: process.env["OPENAI_ORG_ID"],
  maxRetries: 3,
  timeout: 30_000,
});

/**
 * Sends a chat completion request and returns the assistant's reply text.
 *
 * @param messages  Array of messages in OpenAI chat format.
 * @param model     Model identifier. Defaults to gpt-4o-mini.
 */
export async function chat(
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  model = "gpt-4o-mini",
): Promise<string> {
  const completion = await openai.chat.completions.create({
    model,
    messages,
  });
  const content = completion.choices[0]?.message?.content;
  if (content === null || content === undefined) {
    throw new Error("OpenAI returned an empty response.");
  }
  return content;
}

/**
 * Streams a chat completion and yields text chunks as they arrive.
 */
export async function* streamChat(
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  model = "gpt-4o-mini",
): AsyncGenerator<string> {
  const stream = await openai.chat.completions.create({
    model,
    messages,
    stream: true,
  });
  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content;
    if (text) yield text;
  }
}
`;

const OPENAI_EMBEDDINGS = `\
import { openai } from "./openai-client.js";

const EMBEDDING_MODEL = "text-embedding-3-small";

/**
 * Generates an embedding vector for the given text.
 * Returns a Float32Array for memory efficiency.
 */
export async function embed(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
    encoding_format: "float",
  });
  return response.data[0]?.embedding ?? [];
}

/**
 * Generates embeddings for multiple texts in a single API call.
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
    encoding_format: "float",
  });
  return response.data
    .sort((a, b) => a.index - b.index)
    .map((item) => item.embedding);
}

/**
 * Computes cosine similarity between two embedding vectors.
 * Returns a value in [-1, 1]. Higher = more similar.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(\`Embedding dimension mismatch: \${a.length} vs \${b.length}\`);
  }
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
    magA += (a[i] ?? 0) ** 2;
    magB += (b[i] ?? 0) ** 2;
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}
`;

const OPENAI_MODERATION = `\
import { openai } from "./openai-client.js";

export interface ModerationResult {
  readonly flagged: boolean;
  readonly categories: Record<string, boolean>;
  readonly scores: Record<string, number>;
}

/**
 * Runs the input text through OpenAI's moderation endpoint.
 * Returns the flagged status and per-category details.
 */
export async function moderate(text: string): Promise<ModerationResult> {
  const response = await openai.moderations.create({ input: text });
  const result = response.results[0];

  if (!result) {
    throw new Error("OpenAI moderation returned no result.");
  }

  return {
    flagged: result.flagged,
    categories: result.categories as Record<string, boolean>,
    scores: result.category_scores as Record<string, number>,
  };
}

/**
 * Throws if the text is flagged by OpenAI moderation.
 * Use as a pre-flight check before processing user-generated content.
 */
export async function assertSafe(text: string): Promise<void> {
  const result = await moderate(text);
  if (result.flagged) {
    const flaggedCategories = Object.entries(result.categories)
      .filter(([, flagged]) => flagged)
      .map(([category]) => category)
      .join(", ");
    throw new Error(
      \`Content flagged by moderation: \${flaggedCategories}\`,
    );
  }
}
`;

// ── Hook source ───────────────────────────────────────────────────────────────

export const OPENAI_AFTER_WRITE_HOOK = `\
async function hook(ctx) {
  console.log("OpenAI plugin installed.");
  console.log("");
  console.log("Configure your API key:");
  console.log("  export OPENAI_API_KEY=sk-...");
  console.log("  export OPENAI_ORG_ID=org-...  (optional)");
  console.log("");
  console.log("Usage:");
  console.log("  import { chat } from './src/ai/openai-client.js'");
  console.log("  const reply = await chat([{ role: 'user', content: 'Hello' }])");
}
hook
`;

// ── PluginDefinition ──────────────────────────────────────────────────────────

export const openaiPlugin: PluginDefinition = {
  manifest: {
    id: "plugin-openai",
    name: "OpenAI Integration",
    version: "1.0.0",
    description:
      "OpenAI chat completions, streaming, embeddings, and content moderation with type-safe helpers",
    category: "tooling",
    runtime: "node",
    dependencies: [
      { name: "openai", version: "^4.47.1", scope: "dependencies" },
    ],
    files: [
      {
        relativePath: "src/ai/openai-client.ts",
        content: OPENAI_CLIENT,
      },
      {
        relativePath: "src/ai/openai-embeddings.ts",
        content: OPENAI_EMBEDDINGS,
      },
      {
        relativePath: "src/ai/openai-moderation.ts",
        content: OPENAI_MODERATION,
      },
    ],
    configPatches: [
      {
        targetFile: ".env.example",
        merge: {
          OPENAI_API_KEY: "sk-...",
          OPENAI_ORG_ID: "",
          OPENAI_MODEL: "gpt-4o-mini",
        },
      },
    ],
    compatibility: {
      requires: [],
      conflicts: [],
    },
    tags: ["ai", "openai", "llm", "embeddings", "gpt", "chat"],
  },
};
