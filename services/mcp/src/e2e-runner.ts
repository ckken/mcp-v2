import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { LEGACY_PROTOCOL_VERSION, MODERN_PROTOCOL_VERSION, RUNTIME_CAPABILITIES } from "./domain.ts";

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
  readonly protocolVersion: typeof MODERN_PROTOCOL_VERSION;
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
    {
      supportedProtocolVersions: [mode === "modern" ? MODERN_PROTOCOL_VERSION : LEGACY_PROTOCOL_VERSION],
      versionNegotiation: { mode: mode === "modern" ? { pin: MODERN_PROTOCOL_VERSION } : "legacy" },
    },
  );
}

function createTransport(mcpUrl: URL, authToken?: string) {
  return new StreamableHTTPClientTransport(mcpUrl, {
    ...(authToken === undefined ? {} : { authProvider: { token: async () => authToken } }),
  });
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

async function executeSuite(mcpUrl: URL, authToken?: string): Promise<E2eReport> {
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
    await add("protocol.json-http", "Protocol", "按时代验证响应封装", async () => {
      const response = await fetch(new URL("/api/status", mcpUrl), { headers: { accept: "application/json" } });
      const contentType = response.headers.get("content-type") ?? "";
      const value = await response.json() as {
        protocolVersion?: string;
        legacyProtocolVersion?: string;
        transport?: string;
        responseFraming?: { modern?: string; legacy?: string };
        standaloneSseEndpoint?: boolean;
        subscriptions?: boolean;
        capabilities?: typeof RUNTIME_CAPABILITIES;
      };
      assert(response.ok, `Status endpoint returned HTTP ${response.status}`);
      assert(contentType.includes("application/json"), "Status endpoint is not JSON");
      assert(!contentType.includes("text/event-stream"), "Status endpoint must return JSON");
      assert(value.protocolVersion === MODERN_PROTOCOL_VERSION && value.transport === "streamable-http", "Unexpected protocol status");
      assert(value.legacyProtocolVersion === LEGACY_PROTOCOL_VERSION, "Unexpected legacy protocol version");
      assert(value.responseFraming?.modern === "application/json" && value.responseFraming.legacy === "text/event-stream", "Response framing matrix is inaccurate");
      assert(value.standaloneSseEndpoint === false && value.subscriptions === false, "Unsupported streaming capabilities must remain disabled");
      assert(JSON.stringify(value.capabilities) === JSON.stringify(RUNTIME_CAPABILITIES), "Runtime capability matrix is inaccurate");
      return { detail: "Streamable HTTP · modern JSON · legacy SSE framing", evidence: [contentType, `legacy=${LEGACY_PROTOCOL_VERSION}`, "standalone-sse=false"] };
    });

    await add("protocol.modern", "Protocol", "Modern Client 握手", async () => {
      modern = createClient("e2e-modern-client", "modern");
      await modern.connect(createTransport(mcpUrl, authToken));
      assert(modern.getNegotiatedProtocolVersion() === MODERN_PROTOCOL_VERSION, "Modern Client negotiated the wrong protocol version");
      assert(modern.getProtocolEra() === "modern", "Modern Client did not enter the modern era");
      const capabilities = modern.getDiscoverResult()?.capabilities;
      assert(capabilities?.tools?.listChanged === false, "Server must not advertise unimplemented Tool subscriptions");
      assert(capabilities.resources?.listChanged === false, "Server must not advertise unimplemented Resource subscriptions");
      return { detail: "Client pinned and negotiated to 2026-07-28", evidence: ["era=modern", `version=${MODERN_PROTOCOL_VERSION}`, "subscriptions=false"] };
    });

    await add("protocol.legacy", "Protocol", "旧 Codex stateless fallback", async () => {
      legacy = createClient("e2e-legacy-client", "legacy");
      await legacy.connect(createTransport(mcpUrl, authToken));
      assert(legacy.getNegotiatedProtocolVersion() === LEGACY_PROTOCOL_VERSION, "Legacy Client negotiated the wrong protocol version");
      assert(legacy.getProtocolEra() === "legacy", "Legacy Client did not enter the legacy era");
      const result = await legacy.callTool({
        name: "orders.dashboard",
        arguments: { view: "orders", status: "paid" },
      });
      const value = structured<{ parameters?: { view?: string; status?: string }; orders?: unknown[] }>(result);
      assert(value.parameters?.view === "orders" && value.parameters.status === "paid", "Legacy parameters were not preserved");
      assert(value.orders?.length === 1, "Legacy dashboard did not return one paid order");
      return { detail: "2025-06-18 Client 可调用参数化 Dashboard", evidence: ["era=legacy", `version=${LEGACY_PROTOCOL_VERSION}`, "orders=1"] };
    });

    await add("discovery.tools", "Discovery", "发现全部 13 个 Tool", async () => {
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
        "tasks.create",
        "tasks.status",
        "tasks.list",
        "tasks.cancel",
        "tasks.result",
      ];
      for (const name of expected) assert(tools.some((tool) => tool.name === name), `Missing Tool: ${name}`);
      assert(tools.length === expected.length, `Expected ${expected.length} Tools, received ${tools.length}`);
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
        const annotations = tools.find((tool) => tool.name === name)?.annotations;
        assert(
          annotations?.readOnlyHint === true
            && annotations.destructiveHint === false
            && annotations.openWorldHint === false
            && annotations.idempotentHint === true,
          `${name} must advertise safe read-only annotations`,
        );
      }
      return { detail: "13/13 Tool 已发现", evidence: expected };
    });

    await add("discovery.resource", "Discovery", "发现 MCP App Resource", async () => {
      assert(modern !== undefined, "Modern Client is unavailable");
      const { resources } = await modern.listResources();
      const app = resources.find((resource) => resource.uri === "ui://mcp-v2/orders-dashboard.html");
      assert(app !== undefined, "Orders MCP App Resource was not discovered");
      assert(app.mimeType === "text/html;profile=mcp-app", "Unexpected MCP App MIME type");
      return { detail: "ui:// Resource 与 MIME 正确", evidence: [app.uri, app.mimeType ?? "missing MIME"] };
    });

    await add("discovery.prompts", "Discovery", "发现两个原生 Prompt", async () => {
      assert(modern !== undefined && legacy !== undefined, "MCP Clients are unavailable");
      const modernPrompts = await modern.listPrompts();
      const legacyPrompts = await legacy.listPrompts();
      const expected = ["order-review", "verification-checklist"];
      for (const name of expected) {
        assert(modernPrompts.prompts.some((prompt) => prompt.name === name), `Modern Client missing Prompt: ${name}`);
        assert(legacyPrompts.prompts.some((prompt) => prompt.name === name), `Legacy Client missing Prompt: ${name}`);
      }
      assert(modernPrompts.prompts.length === 2 && legacyPrompts.prompts.length === 2, "Prompt discovery count is inaccurate");
      return { detail: "modern 与 legacy 均发现 2/2 Prompt", evidence: expected };
    });

    await add("discovery.prompt-render", "Discovery", "渲染参数化 Prompt", async () => {
      assert(modern !== undefined && legacy !== undefined, "MCP Clients are unavailable");
      const modernPrompt = await modern.getPrompt({ name: "order-review", arguments: { orderId: "ord_demo_1001" } });
      const legacyPrompt = await legacy.getPrompt({ name: "verification-checklist", arguments: {} });
      const modernText = modernPrompt.messages[0]?.content;
      const legacyText = legacyPrompt.messages[0]?.content;
      assert(modernText?.type === "text" && modernText.text.includes("ord_demo_1001") && modernText.text.includes("paid"), "Parameterized Prompt output is invalid");
      assert(legacyText?.type === "text" && legacyText.text.includes("system.health"), "Legacy Prompt output is invalid");
      return { detail: "参数插值与 legacy Prompt 获取均通过", evidence: ["ord_demo_1001", "status=paid", "legacy=getPrompt"] };
    });

    await add("tool.health", "Tools", "system.health", async () => {
      assert(modern !== undefined, "Modern Client is unavailable");
      const result = await modern.callTool({ name: "system.health", arguments: {} });
      const value = structured<{
        ok?: boolean;
        protocolVersion?: string;
        transport?: string;
        standaloneSseEndpoint?: boolean;
      }>(result);
      assert(
        value.ok === true
          && value.protocolVersion === MODERN_PROTOCOL_VERSION
          && value.transport === "streamable-http"
          && value.standaloneSseEndpoint === false,
        "Health payload is invalid",
      );
      return { detail: "Server online，协议与传输声明一致", evidence: ["ok=true", "transport=streamable-http", "standalone-sse=false"] };
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

    await add("tasks.pending-cancel", "Tools", "应用级 Task 轮询与取消", async () => {
      assert(modern !== undefined, "Modern Client is unavailable");
      const createdResult = await modern.callTool({
        name: "tasks.create",
        arguments: { orderId: "ord_demo_1001", completeImmediately: false },
      });
      const created = structured<{ taskId?: string; status?: string }>(createdResult);
      assert(created.taskId !== undefined && created.status === "pending", "Pending Task was not created");
      const statusResult = await modern.callTool({ name: "tasks.status", arguments: { taskId: created.taskId } });
      assert(structured<{ status?: string }>(statusResult).status === "pending", "Task polling did not preserve pending state");
      const cancelledResult = await modern.callTool({ name: "tasks.cancel", arguments: { taskId: created.taskId } });
      assert(structured<{ status?: string }>(cancelledResult).status === "cancelled", "Task cancellation failed");
      return { detail: "create → status → cancel", evidence: [created.taskId, "pending", "cancelled"] };
    });

    await add("tasks.completed-result", "Tools", "应用级 Task 完成与结果", async () => {
      assert(modern !== undefined, "Modern Client is unavailable");
      const createdResult = await modern.callTool({
        name: "tasks.create",
        arguments: { orderId: "ord_demo_1002", completeImmediately: true },
      });
      const created = structured<{ taskId?: string; status?: string }>(createdResult);
      assert(created.taskId !== undefined && created.status === "completed", "Completed Task was not created");
      const result = await modern.callTool({ name: "tasks.result", arguments: { taskId: created.taskId } });
      const value = structured<{ result?: { orders?: { id?: string }[] } }>(result);
      assert(value.result?.orders?.length === 1 && value.result.orders[0]?.id === "ord_demo_1002", "Completed Task result is incorrect");
      return { detail: "completed Task 返回指定订单", evidence: [created.taskId, "ord_demo_1002"] };
    });

    await add("tasks.list-errors", "Tools", "应用级 Task 列表与错误路径", async () => {
      assert(modern !== undefined, "Modern Client is unavailable");
      const listed = await modern.callTool({ name: "tasks.list", arguments: {} });
      const value = structured<{ tasks?: { taskId?: string }[] }>(listed);
      assert((value.tasks?.length ?? 0) >= 2, "Task list is incomplete");
      const missing = await modern.callTool({ name: "tasks.status", arguments: { taskId: "task_missing" } });
      assert(missing.isError === true, "Unknown Task must return an MCP Tool error");
      return { detail: "Task 列表可发现，未知 ID 被拒绝", evidence: [`tasks=${value.tasks?.length ?? 0}`, "missing=isError"] };
    });

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
    protocolVersion: MODERN_PROTOCOL_VERSION,
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

export function runE2eSuite(mcpUrl: URL, authToken?: string) {
  if (activeRun !== undefined) return activeRun;
  activeRun = executeSuite(mcpUrl, authToken).finally(() => {
    activeRun = undefined;
  });
  return activeRun;
}
