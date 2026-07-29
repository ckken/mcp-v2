import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { ORDERS_APP_URI } from "./mcp-app.ts";

function createClient(name: string) {
  return new Client(
    { name, version: "0.1.0" },
    { versionNegotiation: { mode: { pin: "2026-07-28" } } },
  );
}

export async function loadMcpApp(
  mcpUrl: URL,
  parameters: { view?: "overview" | "orders" | "status"; status?: "all" | "paid" | "pending" | "fulfilled" } = {},
) {
  const client = createClient("mcp-app-visual-host");
  await client.connect(new StreamableHTTPClientTransport(mcpUrl));
  try {
    const [{ tools }, resource, toolResult] = await Promise.all([
      client.listTools(),
      client.readResource({ uri: ORDERS_APP_URI }),
      client.callTool({ name: "orders.dashboard", arguments: parameters }),
    ]);
    const descriptor = tools.find((tool) => tool.name === "orders.dashboard");
    const content = resource.contents[0];
    if (!descriptor || !content || !("text" in content)) throw new Error("MCP App contract is incomplete");
    return {
      descriptor,
      resource: content,
      toolResult,
    };
  } finally {
    await client.close();
  }
}

export async function callMcpAppTool(mcpUrl: URL, name: string, args: Record<string, unknown>) {
  if (name !== "orders.dashboard") throw new Error(`MCP App cannot call ${name}`);
  const client = createClient("mcp-app-visual-host-tool-call");
  await client.connect(new StreamableHTTPClientTransport(mcpUrl));
  try {
    return await client.callTool({ name, arguments: args });
  } finally {
    await client.close();
  }
}
