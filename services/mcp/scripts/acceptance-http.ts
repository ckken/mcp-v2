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
    assert(status.protocolVersion === "2026-07-28" && status.legacy === "stateless" && status.sse === false, "status must advertise modern mode with stateless compatibility");

    const legacyClient = new Client(
      { name: "mcp-v2-legacy-acceptance", version: "0.1.0" },
      { versionNegotiation: { mode: "legacy" } }
    );
    await legacyClient.connect(new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`)));
    const legacyTools = await legacyClient.listTools();
    assert(legacyTools.tools.some((tool) => tool.name === "orders.dashboard"), "legacy client must discover orders.dashboard");
    const legacyDashboard = await legacyClient.callTool({ name: "orders.dashboard", arguments: {} });
    assert(Array.isArray((legacyDashboard.structuredContent as { orders?: unknown[] }).orders), "legacy client must call orders.dashboard");
    assert(legacyDashboard._meta?.["openai/outputTemplate"] === "ui://mcp-v2/orders-dashboard.html", "legacy result must expose the UI template");
    await legacyClient.close();

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
    assert(dashboardResult._meta?.["openai/outputTemplate"] === "ui://mcp-v2/orders-dashboard.html", "modern result must expose the UI template");
    const filteredDashboard = await client.callTool({
      name: "orders.dashboard",
      arguments: { view: "orders", status: "paid" },
    });
    assert(
      (filteredDashboard.structuredContent as { parameters?: { view?: string; status?: string } }).parameters?.view === "orders"
        && (filteredDashboard.structuredContent as { parameters?: { view?: string; status?: string } }).parameters?.status === "paid",
      "orders.dashboard must preserve dynamic view parameters",
    );
    assert(
      (filteredDashboard.structuredContent as { orders?: unknown[] }).orders?.length === 1,
      "orders.dashboard must apply the status parameter",
    );
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

    const e2eResponse = await fetch(`${baseUrl}/api/e2e/run`, {
      method: "POST",
      headers: { accept: "application/json" },
    });
    assert(e2eResponse.ok, "E2E API must return HTTP 200");
    const e2e = await e2eResponse.json() as {
      status?: string;
      total?: number;
      passed?: number;
      failed?: number;
      cases?: { id?: string; status?: string }[];
    };
    assert(e2e.status === "passed" && e2e.total === 20 && e2e.passed === 20 && e2e.failed === 0, "all 20 E2E cases must pass");
    for (const id of ["protocol.modern", "protocol.legacy", "skills.order-summary", "skills.unknown", "verification.success", "verification.rejected", "mcp-app.resource"]) {
      assert(e2e.cases?.some((item) => item.id === id && item.status === "passed"), `missing passed E2E case ${id}`);
    }
    console.log("acceptance:http PASS");
  } finally {
    server.stop(true);
  }
}

await main();
