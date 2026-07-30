import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

export type E2eCaseGroup = "Protocol" | "Discovery" | "Tools" | "Skills" | "Verification" | "MCP Apps";

export interface E2eCaseResult {
  readonly id: string;
  readonly group: E2eCaseGroup;
  readonly title: string;
  readonly status: "passed" | "failed";
  readonly durationMs: number;
  readonly detail: string;
  readonly evidence: readonly string[];
}

export interface E2eReport {
  readonly runId: string;
  readonly status: "passed" | "failed";
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly protocolVersion: "2026-07-28";
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly cases: readonly E2eCaseResult[];
}

type ToolCallResult = Awaited<ReturnType<Client["callTool"]>>;

let latestReport: E2eReport | undefined;
let activeRun: Promise<E2eReport> | undefined;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function structured<T>(result: ToolCallResult): T {
  assert(result.structuredContent !== undefined, "Tool result has no structuredContent");
  return result.structuredContent as T;
}

function createClient(name: string, mode: "modern" | "legacy") {
  return new Client(
    { name, version: "0.1.0" },
    { versionNegotiation: { mode: mode === "modern" ? { pin: "2026-07-28" } : "legacy" } },
  );
}

async function runCase(
  id: string,
  group: E2eCaseGroup,
  title: string,
  check: () => Promise<{ detail: string; evidence?: string[] }>,
): Promise<E2eCaseResult> {
  const startedAt = performance.now();
  try {
    const result = await check();
    return {
      id,
      group,
      title,
      status: "passed",
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      detail: result.detail,
      evidence: result.evidence ?? [],
    };
  } catch (error) {
    return {
      id,
      group,
      title,
      status: "failed",
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      detail: error instanceof Error ? error.message : "Unknown E2E failure",
      evidence: [],
    };
  }
}

async function executeSuite(mcpUrl: URL): Promise<E2eReport> {
  const startedAt = new Date().toISOString();
  const runId = `e2e_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
  const cases: E2eCaseResult[] = [];
  let modern: Client | undefined;
  let legacy: Client | undefined;

  const add = async (
    id: string,
    group: E2eCaseGroup,
    title: string,
    check: () => Promise<{ detail: string; evidence?: string[] }>,
  ) => {
    cases.push(await runCase(id, group, title, check));
  };

  try {
    await add("protocol.json-http", "Protocol", "JSON HTTP，不使用 SSE", async () => {
      const response = await fetch(new URL("/api/status", mcpUrl), { headers: { accept: "application/json" } });
      const contentType = response.headers.get("content-type") ?? "";
      const value = await response.json() as { protocolVersion?: string; transport?: string; sse?: boolean };
      assert(response.ok, `Status endpoint returned HTTP ${response.status}`);
      assert(contentType.includes("application/json"), "Status endpoint is not JSON");
      assert(!contentType.includes("text/event-stream") && value.sse === false, "SSE must remain disabled");
      assert(value.protocolVersion === "2026-07-28" && value.transport === "json-http", "Unexpected protocol status");
      return { detail: "2026-07-28 · application/json · sse=false", evidence: [contentType] };
    });

    await add("protocol.modern", "Protocol", "Modern Client 握手", async () => {
      modern = createClient("e2e-modern-client", "modern");
      await modern.connect(new StreamableHTTPClientTransport(mcpUrl));
      return { detail: "Client pinned to 2026-07-28", evidence: ["versionNegotiation=2026-07-28"] };
    });

    await add("protocol.legacy", "Protocol", "旧 Codex stateless fallback", async () => {
      legacy = createClient("e2e-legacy-client", "legacy");
      await legacy.connect(new StreamableHTTPClientTransport(mcpUrl));
      const result = await legacy.callTool({
        name: "orders.dashboard",
        arguments: { view: "orders", status: "paid" },
      });
      const value = structured<{ parameters?: { view?: string; status?: string }; orders?: unknown[] }>(result);
      assert(value.parameters?.view === "orders" && value.parameters.status === "paid", "Legacy parameters were not preserved");
      assert(value.orders?.length === 1, "Legacy dashboard did not return one paid order");
      return { detail: "2025-era Client 可调用参数化 Dashboard", evidence: ["legacy=stateless", "orders=1"] };
    });

    await add("discovery.tools", "Discovery", "发现全部 8 个 Tool", async () => {
      assert(modern !== undefined, "Modern Client is unavailable");
      const { tools } = await modern.listTools();
      const expected = [
        "system.health",
        "orders.search",
        "orders.dashboard",
        "skills.discover",
        "skills.run",
        "verification.start",
        "verification.status",
        "verification.finish",
      ];
      for (const name of expected) assert(tools.some((tool) => tool.name === name), `Missing Tool: ${name}`);
      assert(tools.length === expected.length, `Expected ${expected.length} Tools, received ${tools.length}`);
      return { detail: "8/8 Tool 已发现", evidence: expected };
    });

    await add("discovery.resource", "Discovery", "发现 MCP App Resource", async () => {
      assert(modern !== undefined, "Modern Client is unavailable");
      const { resources } = await modern.listResources();
      const app = resources.find((resource) => resource.uri === "ui://mcp-v2/orders-dashboard.html");
      assert(app !== undefined, "Orders MCP App Resource was not discovered");
      assert(app.mimeType === "text/html;profile=mcp-app", "Unexpected MCP App MIME type");
      return { detail: "ui:// Resource 与 MIME 正确", evidence: [app.uri, app.mimeType ?? "missing MIME"] };
    });

    await add("tool.health", "Tools", "system.health", async () => {
      assert(modern !== undefined, "Modern Client is unavailable");
      const result = await modern.callTool({ name: "system.health", arguments: {} });
      const value = structured<{ ok?: boolean; protocolVersion?: string; sse?: boolean }>(result);
      assert(value.ok === true && value.protocolVersion === "2026-07-28" && value.sse === false, "Health payload is invalid");
      return { detail: "Server online，协议与传输声明一致", evidence: ["ok=true", "sse=false"] };
    });

    await add("tool.orders-hit", "Tools", "orders.search 命中", async () => {
      assert(modern !== undefined, "Modern Client is unavailable");
      const result = await modern.callTool({ name: "orders.search", arguments: { query: "northwind" } });
      const value = structured<{ orders?: { id?: string }[] }>(result);
      assert(value.orders?.length === 1 && value.orders[0]?.id === "ord_demo_1002", "Order search hit is incorrect");
      return { detail: "northwind → ord_demo_1002", evidence: ["orders=1"] };
    });

    await add("tool.orders-miss", "Tools", "orders.search 空结果", async () => {
      assert(modern !== undefined, "Modern Client is unavailable");
      const result = await modern.callTool({ name: "orders.search", arguments: { query: "missing-order" } });
      const value = structured<{ orders?: unknown[] }>(result);
      assert(value.orders?.length === 0, "Missing order query must return an empty list");
      return { detail: "未知关键词返回空数组", evidence: ["orders=0"] };
    });

    for (const [id, view, status, expectedOrders] of [
      ["tool.dashboard-overview", "overview", "all", 3],
      ["tool.dashboard-orders", "orders", "paid", 1],
      ["tool.dashboard-status", "status", "fulfilled", 1],
    ] as const) {
      await add(id, "Tools", `orders.dashboard · ${view}`, async () => {
        assert(modern !== undefined, "Modern Client is unavailable");
        const result = await modern.callTool({ name: "orders.dashboard", arguments: { view, status } });
        const value = structured<{ parameters?: { view?: string; status?: string }; orders?: unknown[] }>(result);
        assert(value.parameters?.view === view && value.parameters.status === status, "Dashboard parameters were not preserved");
        assert(value.orders?.length === expectedOrders, `Expected ${expectedOrders} dashboard orders`);
        return { detail: `view=${view} · status=${status} · orders=${expectedOrders}`, evidence: [`view=${view}`, `status=${status}`] };
      });
    }

    await add("skills.discover", "Skills", "发现两个应用层 Skill", async () => {
      assert(modern !== undefined, "Modern Client is unavailable");
      const result = await modern.callTool({ name: "skills.discover", arguments: {} });
      const value = structured<{ skills?: { id?: string }[] }>(result);
      const ids = value.skills?.map((skill) => skill.id) ?? [];
      assert(ids.includes("order-summary") && ids.includes("verification-checklist") && ids.length === 2, "Skill discovery is incomplete");
      return { detail: "2/2 Skill 已发现", evidence: ids.filter((id): id is string => id !== undefined) };
    });

    await add("skills.order-summary", "Skills", "order-summary 指定订单", async () => {
      assert(modern !== undefined, "Modern Client is unavailable");
      const result = await modern.callTool({
        name: "skills.run",
        arguments: { skillId: "order-summary", orderId: "ord_demo_1001" },
      });
      const value = structured<{ output?: { summary?: string }; inputRequired?: boolean }>(result);
      assert(value.output?.summary === "ord_demo_1001: paid" && value.inputRequired === false, "Order summary output is incorrect");
      return { detail: "ord_demo_1001: paid", evidence: ["inputRequired=false"] };
    });

    await add("skills.order-summary-default", "Skills", "order-summary 默认摘要", async () => {
      assert(modern !== undefined, "Modern Client is unavailable");
      const result = await modern.callTool({ name: "skills.run", arguments: { skillId: "order-summary" } });
      const value = structured<{ output?: { summary?: string } }>(result);
      assert(value.output?.summary === "3 demo orders available", "Default order summary is incorrect");
      return { detail: "未传 orderId 时返回订单总数", evidence: ["3 demo orders available"] };
    });

    await add("skills.checklist", "Skills", "verification-checklist", async () => {
      assert(modern !== undefined, "Modern Client is unavailable");
      const result = await modern.callTool({ name: "skills.run", arguments: { skillId: "verification-checklist" } });
      const value = structured<{ output?: { checklist?: string[] }; inputRequired?: boolean }>(result);
      assert(value.output?.checklist?.length === 4 && value.inputRequired === true, "Verification checklist output is incorrect");
      return { detail: "返回 4 个验证步骤，并要求输入", evidence: value.output.checklist };
    });

    await add("skills.unknown", "Skills", "未知 Skill 拒绝", async () => {
      assert(modern !== undefined, "Modern Client is unavailable");
      const result = await modern.callTool({ name: "skills.run", arguments: { skillId: "unknown-skill" } });
      assert(result.isError === true, "Unknown Skill must return an MCP Tool error");
      return { detail: "未知 skillId 被拒绝", evidence: ["isError=true"] };
    });

    await add("verification.success", "Verification", "完整证据链通过", async () => {
      assert(modern !== undefined, "Modern Client is unavailable");
      const started = await modern.callTool({ name: "verification.start", arguments: {} });
      const { runId: verificationRunId } = structured<{ runId: string }>(started);
      for (const [name, arguments_] of [
        ["system.health", { runId: verificationRunId }],
        ["skills.discover", { runId: verificationRunId }],
        ["orders.search", { runId: verificationRunId, query: "demo" }],
        ["skills.run", { runId: verificationRunId, skillId: "order-summary", orderId: "ord_demo_1001" }],
      ] as const) await modern.callTool({ name, arguments: arguments_ });
      const statusResult = await modern.callTool({ name: "verification.status", arguments: { runId: verificationRunId } });
      const running = structured<{ status?: string; evidence?: unknown[] }>(statusResult);
      assert(running.status === "started" && running.evidence?.length === 4, "Running verification evidence is incomplete");
      const finished = await modern.callTool({
        name: "verification.finish",
        arguments: { runId: verificationRunId, confirmed: true },
      });
      const value = structured<{ status?: string; confirmationReceived?: boolean }>(finished);
      assert(value.status === "passed" && value.confirmationReceived === true, "Complete verification did not pass");
      return { detail: "4 个 Tool 证据 + 人工确认 → passed", evidence: [verificationRunId, "evidence=4"] };
    });

    await add("verification.rejected", "Verification", "未确认路径失败", async () => {
      assert(modern !== undefined, "Modern Client is unavailable");
      const started = await modern.callTool({ name: "verification.start", arguments: {} });
      const { runId: verificationRunId } = structured<{ runId: string }>(started);
      const finished = await modern.callTool({
        name: "verification.finish",
        arguments: { runId: verificationRunId, confirmed: false },
      });
      const value = structured<{ status?: string; confirmationReceived?: boolean }>(finished);
      assert(value.status === "failed" && value.confirmationReceived === false, "Unconfirmed verification must fail");
      return { detail: "confirmed=false → failed", evidence: [verificationRunId] };
    });

    await add("mcp-app.resource", "MCP Apps", "单文件 App 与 bridge", async () => {
      assert(modern !== undefined, "Modern Client is unavailable");
      const resource = await modern.readResource({ uri: "ui://mcp-v2/orders-dashboard.html" });
      const content = resource.contents[0];
      assert(content !== undefined && "text" in content, "MCP App HTML is missing");
      assert(content.mimeType === "text/html;profile=mcp-app", "MCP App MIME type is invalid");
      assert(content.text.includes("ui/initialize") && content.text.includes("tools/call"), "MCP Apps bridge is incomplete");
      assert(!/<script[^>]+src=/.test(content.text) && !/<link[^>]+rel=[\"']stylesheet/.test(content.text), "MCP App must be self-contained");
      return { detail: "内联 HTML 包含 initialize、Tool 回调和样式", evidence: [`html=${content.text.length} bytes`] };
    });

    await add("mcp-app.metadata", "MCP Apps", "Tool 与 ui:// 元数据关联", async () => {
      assert(modern !== undefined, "Modern Client is unavailable");
      const { tools } = await modern.listTools();
      const tool = tools.find((candidate) => candidate.name === "orders.dashboard");
      const meta = tool?._meta as { ui?: { resourceUri?: string }; "ui/resourceUri"?: string; "openai/outputTemplate"?: string } | undefined;
      const uri = "ui://mcp-v2/orders-dashboard.html";
      assert(meta?.ui?.resourceUri === uri && meta["ui/resourceUri"] === uri && meta["openai/outputTemplate"] === uri, "MCP App metadata is incomplete");
      return { detail: "三种 Resource 元数据均指向同一 ui://", evidence: [uri] };
    });
  } finally {
    await Promise.allSettled([
      modern?.close() ?? Promise.resolve(),
      legacy?.close() ?? Promise.resolve(),
    ]);
  }

  const passed = cases.filter((item) => item.status === "passed").length;
  const report: E2eReport = {
    runId,
    status: passed === cases.length ? "passed" : "failed",
    startedAt,
    finishedAt: new Date().toISOString(),
    protocolVersion: "2026-07-28",
    total: cases.length,
    passed,
    failed: cases.length - passed,
    cases,
  };
  latestReport = report;
  return report;
}

export function getLatestE2eReport() {
  return latestReport;
}

export function runE2eSuite(mcpUrl: URL) {
  if (activeRun !== undefined) return activeRun;
  activeRun = executeSuite(mcpUrl).finally(() => {
    activeRun = undefined;
  });
  return activeRun;
}
