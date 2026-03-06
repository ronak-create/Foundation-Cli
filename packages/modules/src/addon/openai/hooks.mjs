/**
 * OpenAI plugin lifecycle hooks.
 * Evaluated inside vm.Script sandbox — only console, crypto, path available.
 */
async function afterWrite(ctx) {
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

afterWrite;