import { app } from "../src/index.ts";
import { runVerification } from "../src/verification-runner.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const configuredUrl = Bun.env.MCP_URL;
const server = configuredUrl === undefined
  ? Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: app.fetch })
  : undefined;
try {
  const mcpUrl = new URL(configuredUrl ?? `http://127.0.0.1:${server?.port}/mcp`);
  const finished = await runVerification(mcpUrl, "codex-session-acceptance") as { status: string };
  assert(finished.status === "passed", "Codex verification run did not pass");
  console.log("acceptance:codex PASS (Codex-oriented MCP client chain; host UI not asserted)");
} finally {
  server?.stop(true);
}
