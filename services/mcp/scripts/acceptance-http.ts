import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { app } from "../src/index.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: app.fetch });
  const baseUrl = `http://127.0.0.1:${server.port}`;
  try {
    const statusResponse = await fetch(`${baseUrl}/api/status`);
    assert(statusResponse.headers.get("content-type")?.includes("application/json"), "status must be JSON");
    const status = await statusResponse.json() as { protocolVersion: string; legacy: string; sse: boolean };
    assert(status.protocolVersion === "2026-07-28" && status.legacy === "reject" && status.sse === false, "status must advertise modern JSON-only mode");

    const legacy = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} })
    });
    assert(legacy.headers.get("content-type")?.includes("text/event-stream") !== true, "legacy rejection must not use SSE");
    assert(legacy.status >= 400 || (await legacy.text()).includes("Unsupported protocol"), "legacy initialize must be rejected");

    const client = new Client(
      { name: "mcp-v2-http-acceptance", version: "0.1.0" },
      { versionNegotiation: { mode: { pin: "2026-07-28" } } }
    );
    await client.connect(new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`)));
    const tools = await client.listTools();
    for (const name of ["system.health", "orders.search", "orders.dashboard", "skills.discover", "skills.run", "verification.start", "verification.status", "verification.finish"]) {
      assert(tools.tools.some((tool) => tool.name === name), `missing ${name}`);
    }
    const dashboard = tools.tools.find((tool) => tool.name === "orders.dashboard");
    const dashboardMeta = dashboard?._meta as { ui?: { resourceUri?: string } } | undefined;
    assert(dashboardMeta?.ui?.resourceUri === "ui://mcp-v2/orders-dashboard.html", "orders.dashboard must link its ui:// resource");
    const appUri = dashboardMeta.ui.resourceUri;
    const resources = await client.listResources();
    assert(resources.resources.some((resource) => resource.uri === appUri), "MCP App resource must be discoverable");
    const appResource = await client.readResource({ uri: appUri });
    const appContent = appResource.contents[0];
    assert(appContent?.mimeType === "text/html;profile=mcp-app", "MCP App resource must use the MCP Apps MIME type");
    assert(appContent !== undefined && "text" in appContent && appContent.text.includes("ui/initialize"), "MCP App resource must contain the UI bridge");
    const dashboardResult = await client.callTool({ name: "orders.dashboard", arguments: {} });
    assert(Array.isArray((dashboardResult.structuredContent as { orders?: unknown[] }).orders), "orders.dashboard must return structured UI data");
    const start = await client.callTool({ name: "verification.start", arguments: {} });
    const run = start.structuredContent as { runId: string };
    assert(typeof run.runId === "string", "verification.start must return runId");
    for (const [name, arguments_] of [
      ["system.health", { runId: run.runId }],
      ["skills.discover", { runId: run.runId }],
      ["orders.search", { runId: run.runId, query: "demo" }],
      ["skills.run", { runId: run.runId, skillId: "order-summary", orderId: "ord_demo_1001" }]
    ] as const) await client.callTool({ name, arguments: arguments_ });
    const finish = await client.callTool({ name: "verification.finish", arguments: { runId: run.runId, confirmed: true } });
    assert((finish.structuredContent as { status: string }).status === "passed", "verification must pass after full chain");
    await client.close();
    console.log("acceptance:http PASS");
  } finally {
    server.stop(true);
  }
}

await main();
