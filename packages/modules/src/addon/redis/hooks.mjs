/**
 * Redis plugin lifecycle hooks.
 * Evaluated inside vm.Script sandbox — only console, crypto, path available.
 */
async function afterWrite(ctx) {
  console.log("Redis plugin installed.");
  console.log("Connection configured via REDIS_URL environment variable.");
  console.log("Default: redis://localhost:6379");
  console.log("");
  console.log("Start Redis locally:");
  console.log("  docker run -p 6379:6379 redis:7-alpine");
}

afterWrite;