import { Client, type FetchLike, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { app, createApp } from "../src/index.ts";
import { LEGACY_PROTOCOL_VERSION, MODERN_PROTOCOL_VERSION, RUNTIME_CAPABILITIES } from "../src/domain.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: app.fetch });
  const baseUrl = `http://127.0.0.1:${server.port}`;
  const validToken = crypto.randomUUID();
  const limitedToken = crypto.randomUUID();
  const securedApp = createApp({
    auth: {
      tokens: [
        { token: validToken, clientId: "acceptance-valid", scopes: ["mcp:access"] },
        { token: limitedToken, clientId: "acceptance-limited", scopes: ["profile:read"] },
      ],
      requiredScopes: ["mcp:access"],
    },
  });
  const securedServer = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: securedApp.fetch });
  const securedBaseUrl = `http://127.0.0.1:${securedServer.port}`;
  const mcpResponses: { era: "legacy" | "modern" | "auto"; method: string; status: number; contentType: string }[] = [];
  const transport = (era: "legacy" | "modern" | "auto") => {
    const recordingFetch: FetchLike = async (input, init) => {
      const response = await fetch(input, init);
      const requestUrl = input instanceof Request ? input.url : input.toString();
      if (new URL(requestUrl).pathname === "/mcp") {
        mcpResponses.push({
          era,
          method: input instanceof Request ? input.method : init?.method ?? "GET",
          status: response.status,
          contentType: response.headers.get("content-type") ?? "",
        });
      }
      return response;
    };
    return new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), { fetch: recordingFetch });
  };
  try {
    const statusResponse = await fetch(`${baseUrl}/api/status`);
    assert(statusResponse.headers.get("content-type")?.includes("application/json"), "status must be JSON");
    const status = await statusResponse.json() as {
      protocolVersion: string;
      legacy: string;
      legacyProtocolVersion: string;
      transport: string;
      responseFraming: { modern: string; legacy: string };
      standaloneSseEndpoint: boolean;
      subscriptions: boolean;
      authConfigured: boolean;
      authMode: string;
      taskModel: string;
      capabilities: typeof RUNTIME_CAPABILITIES;
    };
    assert(status.protocolVersion === MODERN_PROTOCOL_VERSION && status.legacy === "stateless", "status must advertise modern mode with stateless compatibility");
    assert(status.transport === "streamable-http", "status must identify Streamable HTTP");
    assert(status.legacyProtocolVersion === LEGACY_PROTOCOL_VERSION, "status must identify the tested legacy protocol version");
    assert(status.responseFraming.modern === "application/json" && status.responseFraming.legacy === "text/event-stream", "status must report era-specific response framing");
    assert(status.standaloneSseEndpoint === false && status.subscriptions === false, "status must not advertise unimplemented streaming capabilities");
    assert(status.authConfigured === false && status.authMode === "disabled", "default local runtime must keep Auth optional");
    assert(status.taskModel === "application-tools", "status must identify the application-level Task model");
    assert(JSON.stringify(status.capabilities) === JSON.stringify(RUNTIME_CAPABILITIES), "status must report the implemented capability matrix");

    const legacyClient = new Client(
      { name: "mcp-v2-legacy-acceptance", version: "0.1.0" },
      {
        supportedProtocolVersions: [LEGACY_PROTOCOL_VERSION],
        versionNegotiation: { mode: "legacy" },
      }
    );
    await legacyClient.connect(transport("legacy"));
    assert(legacyClient.getNegotiatedProtocolVersion() === LEGACY_PROTOCOL_VERSION, "legacy client must negotiate 2025-06-18");
    assert(legacyClient.getProtocolEra() === "legacy", "legacy client must use the legacy era");
    const legacyTools = await legacyClient.listTools();
    assert(legacyTools.tools.some((tool) => tool.name === "orders.dashboard"), "legacy client must discover orders.dashboard");
    const legacyDashboard = await legacyClient.callTool({ name: "orders.dashboard", arguments: {} });
    assert(Array.isArray((legacyDashboard.structuredContent as { orders?: unknown[] }).orders), "legacy client must call orders.dashboard");
    assert(legacyDashboard._meta?.["openai/outputTemplate"] === "ui://mcp-v2/orders-dashboard.html", "legacy result must expose the UI template");
    await legacyClient.close();

    const client = new Client(
      { name: "mcp-v2-http-acceptance", version: "0.1.0" },
      {
        supportedProtocolVersions: [MODERN_PROTOCOL_VERSION],
        versionNegotiation: { mode: { pin: MODERN_PROTOCOL_VERSION } },
      }
    );
    await client.connect(transport("modern"));
    assert(client.getNegotiatedProtocolVersion() === MODERN_PROTOCOL_VERSION, "modern client must negotiate 2026-07-28");
    assert(client.getProtocolEra() === "modern", "modern client must use the modern era");
    const discoverCapabilities = client.getDiscoverResult()?.capabilities;
    assert(discoverCapabilities?.tools?.listChanged === false, "modern discovery must not advertise Tool subscriptions");
    assert(discoverCapabilities.resources?.listChanged === false, "modern discovery must not advertise Resource subscriptions");
    const tools = await client.listTools();
    for (const name of [
      "system.health",
      "orders.search",
      "orders.dashboard",
      "skills.discover",
      "skills.run",
      "verification.start",
      "verification.status",
      "verification.finish",
      "tasks.create",
      "tasks.status",
      "tasks.list",
      "tasks.cancel",
      "tasks.result",
    ]) {
      assert(tools.tools.some((tool) => tool.name === name), `missing ${name}`);
    }
    assert(tools.tools.length === 13, "modern client must discover exactly 13 tools");
    for (const name of [
      "system.health",
      "orders.search",
      "orders.dashboard",
      "skills.discover",
      "skills.run",
      "verification.status",
      "tasks.status",
      "tasks.list",
      "tasks.result",
    ]) {
      const annotations = tools.tools.find((tool) => tool.name === name)?.annotations;
      assert(
        annotations?.readOnlyHint === true
          && annotations.destructiveHint === false
          && annotations.openWorldHint === false
          && annotations.idempotentHint === true,
        `${name} must advertise safe read-only annotations`,
      );
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
    const prompts = await client.listPrompts();
    assert(prompts.prompts.length === 2, "modern client must discover exactly two Prompts");
    assert(prompts.prompts.some((prompt) => prompt.name === "order-review"), "order-review Prompt must be discoverable");
    const prompt = await client.getPrompt({ name: "order-review", arguments: { orderId: "ord_demo_1001" } });
    const promptContent = prompt.messages[0]?.content;
    assert(promptContent?.type === "text" && promptContent.text.includes("ord_demo_1001"), "order-review Prompt must interpolate orderId");
    const taskCreated = await client.callTool({
      name: "tasks.create",
      arguments: { orderId: "ord_demo_1002", completeImmediately: true },
    });
    const taskId = (taskCreated.structuredContent as { taskId?: string }).taskId;
    assert(typeof taskId === "string", "tasks.create must return taskId");
    const taskResult = await client.callTool({ name: "tasks.result", arguments: { taskId } });
    assert(
      (taskResult.structuredContent as { result?: { orders?: { id?: string }[] } }).result?.orders?.[0]?.id === "ord_demo_1002",
      "tasks.result must return the selected order",
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

    const autoClient = new Client(
      { name: "mcp-v2-auto-negotiation-acceptance", version: "0.1.0" },
      {
        supportedProtocolVersions: [MODERN_PROTOCOL_VERSION, LEGACY_PROTOCOL_VERSION],
        versionNegotiation: { mode: "auto" },
      },
    );
    await autoClient.connect(transport("auto"));
    assert(autoClient.getNegotiatedProtocolVersion() === MODERN_PROTOCOL_VERSION, "auto client must prefer the modern protocol");
    assert(autoClient.getProtocolEra() === "modern", "auto client must select the modern era");
    assert((await autoClient.listTools()).tools.length === 13, "auto client must discover all tools");
    await autoClient.close();

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
    assert(e2e.status === "passed" && e2e.total === 25 && e2e.passed === 25 && e2e.failed === 0, "all 25 E2E cases must pass");
    for (const id of [
      "protocol.modern",
      "protocol.legacy",
      "discovery.prompts",
      "discovery.prompt-render",
      "tasks.pending-cancel",
      "tasks.completed-result",
      "tasks.list-errors",
      "skills.order-summary",
      "skills.unknown",
      "verification.success",
      "verification.rejected",
      "mcp-app.resource",
    ]) {
      assert(e2e.cases?.some((item) => item.id === id && item.status === "passed"), `missing passed E2E case ${id}`);
    }
    assert(mcpResponses.length > 0, "MCP response content types were not observed");
    assert(
      mcpResponses
        .filter(({ era }) => era !== "legacy")
        .every(({ contentType }) => !contentType.includes("text/event-stream")),
      `modern MCP responses must not use SSE: ${JSON.stringify(mcpResponses)}`,
    );
    assert(
      mcpResponses
        .filter(({ era, status }) => era !== "legacy" && status === 200)
        .every(({ contentType }) => contentType.includes("application/json")),
      "successful modern MCP result responses must use application/json",
    );
    assert(
      mcpResponses.some(({ era, status, contentType }) => era === "legacy" && status === 200 && contentType.includes("text/event-stream")),
      "legacy stateless compatibility must exercise its SSE response framing",
    );

    const unauthorized = await fetch(`${securedBaseUrl}/mcp`, { method: "POST", body: "{}" });
    assert(unauthorized.status === 401 && unauthorized.headers.get("www-authenticate")?.includes("Bearer"), "missing bearer token must return a Bearer challenge");
    const invalid = await fetch(`${securedBaseUrl}/mcp`, {
      method: "POST",
      headers: { authorization: `Bearer ${crypto.randomUUID()}` },
      body: "{}",
    });
    assert(invalid.status === 401, "invalid bearer token must return HTTP 401");
    const insufficient = await fetch(`${securedBaseUrl}/mcp`, {
      method: "POST",
      headers: { authorization: `Bearer ${limitedToken}` },
      body: "{}",
    });
    assert(insufficient.status === 403, "insufficient bearer scope must return HTTP 403");
    const securedStatus = await fetch(`${securedBaseUrl}/api/status`).then((response) => response.json()) as {
      authConfigured?: boolean;
      authMode?: string;
    };
    assert(securedStatus.authConfigured === true && securedStatus.authMode === "bearer", "secured runtime status must expose Bearer Auth");
    const securedClient = new Client(
      { name: "mcp-v2-auth-acceptance", version: "0.1.0" },
      {
        supportedProtocolVersions: [MODERN_PROTOCOL_VERSION],
        versionNegotiation: { mode: { pin: MODERN_PROTOCOL_VERSION } },
      },
    );
    await securedClient.connect(new StreamableHTTPClientTransport(new URL(`${securedBaseUrl}/mcp`), {
      authProvider: { token: async () => validToken },
    }));
    const securedHealth = await securedClient.callTool({ name: "system.health", arguments: {} });
    assert((securedHealth.structuredContent as { ok?: boolean }).ok === true, "valid bearer token must authorize MCP calls");
    await securedClient.close();
    console.log("acceptance:http PASS");
  } finally {
    server.stop(true);
    securedServer.stop(true);
  }
}

await main();
