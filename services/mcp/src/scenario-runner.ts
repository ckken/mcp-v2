import {
  SCENARIO_IDS,
  scenarioEntryRequestSchema,
  type ScenarioEntryRequest,
  type ScenarioEntrySnapshot,
  type ScenarioId,
  type ScenarioReport,
  type ScenarioStepResult,
} from "@mcp-v2/shared";
import {
  Client,
  TRACEPARENT_META_KEY,
  type FetchLike,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import {
  LEGACY_PROTOCOL_VERSION,
  MODERN_PROTOCOL_VERSION,
  RUNTIME_CAPABILITIES,
} from "./domain.ts";
import {
  describeScenarioEntry as loadScenarioEntryDefinition,
  fallbackScenarioEntry,
  resolveScenarioEntry,
} from "./scenario-entry.ts";

export { SCENARIO_IDS };
export type { ScenarioId, ScenarioReport, ScenarioStepResult };

type ToolCallResult = Awaited<ReturnType<Client["callTool"]>>;
type StepOutput = { detail: string; evidence?: string[] };
type StepRunner = (id: string, title: string, check: () => Promise<StepOutput>) => Promise<void>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function structured<T>(result: ToolCallResult): T {
  assert(result.structuredContent !== undefined, "Tool result has no structuredContent");
  return result.structuredContent as T;
}

function traceMeta(entry: ScenarioEntrySnapshot) {
  return { [TRACEPARENT_META_KEY]: entry.traceparent };
}

function createClient(
  name: string,
  mode: "modern" | "legacy" = "modern",
  options: {
    elicitation?: (message: string) => boolean;
  } = {},
) {
  const client = new Client(
    { name, version: "0.1.0" },
    {
      capabilities: options.elicitation === undefined ? {} : {
        elicitation: { form: { applyDefaults: true } },
      },
      ...(options.elicitation === undefined ? {} : { inputRequired: {
        autoFulfill: true,
        maxRounds: 2,
      } }),
      supportedProtocolVersions: [mode === "modern" ? MODERN_PROTOCOL_VERSION : LEGACY_PROTOCOL_VERSION],
      versionNegotiation: { mode: mode === "modern" ? { pin: MODERN_PROTOCOL_VERSION } : "legacy" },
    },
  );
  if (options.elicitation !== undefined) {
    client.setRequestHandler("elicitation/create", async (request) => ({
      action: "accept" as const,
      content: { confirmed: options.elicitation?.(request.params.message) ?? false },
    }));
  }
  return client;
}

function createTransport(mcpUrl: URL, authToken?: string, fetchImpl?: FetchLike) {
  return new StreamableHTTPClientTransport(mcpUrl, {
    ...(authToken === undefined ? {} : { authProvider: { token: async () => authToken } }),
    ...(fetchImpl === undefined ? {} : { fetch: fetchImpl }),
  });
}

async function withModernClient<T>(
  mcpUrl: URL,
  authToken: string | undefined,
  name: string,
  run: (client: Client) => Promise<T>,
) {
  const client = createClient(name);
  await client.connect(createTransport(mcpUrl, authToken));
  try {
    return await run(client);
  } finally {
    await client.close();
  }
}

function createStepRunner(steps: ScenarioStepResult[]): StepRunner {
  let blockedBy: string | undefined;
  return async (id, title, check) => {
    if (blockedBy !== undefined) {
      steps.push({
        id,
        title,
        status: "skipped",
        durationMs: 0,
        detail: `前置步骤 ${blockedBy} 失败，本步骤未执行`,
        evidence: [`blockedBy=${blockedBy}`],
      });
      return;
    }
    const startedAt = performance.now();
    try {
      const output = await check();
      steps.push({
        id,
        title,
        status: "passed",
        durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
        detail: output.detail,
        evidence: output.evidence ?? [],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown scenario failure";
      steps.push({
        id,
        title,
        status: "failed",
        durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
        detail: message,
        evidence: [],
      });
      blockedBy = id;
    }
  };
}

async function runLoopScenario(baseUrl: URL, step: StepRunner, entry: ScenarioEntrySnapshot) {
  let statusPayload: {
    ok?: boolean;
    protocolVersion?: string;
    capabilities?: typeof RUNTIME_CAPABILITIES;
  } | undefined;
  let tools = 0;
  let prompts = 0;
  let skills = 0;

  await step("loop.status", "读取运行状态", async () => {
    const response = await fetch(new URL("/api/status", baseUrl));
    assert(response.ok, `Status endpoint returned HTTP ${response.status}`);
    statusPayload = await response.json() as typeof statusPayload;
    assert(statusPayload?.ok === true, "Status endpoint did not report ok");
    assert(entry.gates.every((gate) => gate.status === "passed"), "动态入口门禁未全部通过");
    return {
      detail: "MCP 服务状态与动态入口可读",
      evidence: [`protocol=${statusPayload.protocolVersion}`, `focus=${entry.selection ?? "extensions"}`],
    };
  });
  await step("loop.registry", "核对场景注册", async () => {
    const response = await fetch(new URL("/api/scenarios", baseUrl));
    assert(response.ok, `Scenario registry returned HTTP ${response.status}`);
    const value = await response.json() as { scenarios?: unknown[] };
    assert(value.scenarios?.length === SCENARIO_IDS.length, "Scenario registry is incomplete");
    return { detail: "6 个独立场景已注册", evidence: SCENARIO_IDS.map((id) => `scene=${id}`) };
  });
  await step("loop.catalogs", "读取能力目录", async () => {
    const [toolResponse, promptResponse, skillResponse] = await Promise.all([
      fetch(new URL("/api/demo/tools", baseUrl)),
      fetch(new URL("/api/demo/prompts", baseUrl)),
      fetch(new URL("/api/demo/skills", baseUrl)),
    ]);
    assert(toolResponse.ok && promptResponse.ok && skillResponse.ok, "One or more capability catalogs are unavailable");
    tools = ((await toolResponse.json()) as { tools?: unknown[] }).tools?.length ?? 0;
    prompts = ((await promptResponse.json()) as { prompts?: unknown[] }).prompts?.length ?? 0;
    skills = ((await skillResponse.json()) as { skills?: unknown[] }).skills?.length ?? 0;
    assert(tools === entry.discovery.tools.length && prompts === entry.discovery.prompts.length && skills === 2, "Capability catalog counts are inaccurate");
    return {
      detail: "HTTP 目录与 MCP 实时发现一致",
      evidence: [`tools=${tools}`, `prompts=${prompts}`, `resources=${entry.discovery.resources.length}`, `skills=${skills}`],
    };
  });
  await step("loop.matrix", "验证能力矩阵", async () => {
    assert(
      JSON.stringify(statusPayload?.capabilities) === JSON.stringify(RUNTIME_CAPABILITIES),
      "Runtime capability matrix is inaccurate",
    );
    return {
      detail: "8/8 项目能力与 v2 扩展可用",
      evidence: [
        ...Object.entries(RUNTIME_CAPABILITIES).map(([name, value]) => `${name}=${String(value)}`),
        ...entry.discovery.extensions.map((name) => `extension=${name}`),
      ],
    };
  });
  await step("loop.verdict", "形成闭环结论", async () => ({
    detail: "状态、注册、实时目录、扩展与缓存语义形成独立闭环",
    evidence: [
      "scope=loop-only",
      `discover-ttl=${entry.cache.discover.ttlMs}`,
      `tools-ttl=${entry.cache.tools.ttlMs}`,
    ],
  }));
}

async function runProtocolScenario(
  mcpUrl: URL,
  authToken: string | undefined,
  step: StepRunner,
  entry: ScenarioEntrySnapshot,
) {
  const observed: { era: "modern" | "legacy"; status: number; contentType: string }[] = [];
  const recordingFetch = (era: "modern" | "legacy"): FetchLike => async (input, init) => {
    const response = await fetch(input, init);
    if (new URL(input instanceof Request ? input.url : input.toString()).pathname === "/mcp") {
      observed.push({
        era,
        status: response.status,
        contentType: response.headers.get("content-type") ?? "",
      });
    }
    return response;
  };

  if (entry.protocolMode !== "legacy") {
    await step("protocol.modern", "Modern 握手", async () => {
      const client = createClient("scenario-protocol-modern");
      await client.connect(createTransport(mcpUrl, authToken, recordingFetch("modern")));
      try {
        assert(client.getNegotiatedProtocolVersion() === MODERN_PROTOCOL_VERSION, "Modern negotiation failed");
        await client.callTool({ name: "system.health", arguments: {}, _meta: traceMeta(entry) });
        return { detail: "Modern Client 协商并调用成功", evidence: [`version=${MODERN_PROTOCOL_VERSION}`] };
      } finally {
        await client.close();
      }
    });
  }
  if (entry.protocolMode !== "modern") {
    await step("protocol.legacy", "Legacy 握手", async () => {
      const client = createClient("scenario-protocol-legacy", "legacy");
      await client.connect(createTransport(mcpUrl, authToken, recordingFetch("legacy")));
      try {
        assert(client.getNegotiatedProtocolVersion() === LEGACY_PROTOCOL_VERSION, "Legacy negotiation failed");
        await client.callTool({ name: "system.health", arguments: {} });
        return { detail: "Legacy stateless Client 协商并调用成功", evidence: [`version=${LEGACY_PROTOCOL_VERSION}`] };
      } finally {
        await client.close();
      }
    });
  }
  await step("protocol.framing", "验证响应封装", async () => {
    const modern = observed.filter((item) => item.era === "modern" && item.status === 200);
    const legacy = observed.filter((item) => item.era === "legacy" && item.status === 200);
    if (entry.protocolMode !== "legacy") {
      assert(modern.length > 0 && modern.every((item) => item.contentType.includes("application/json")), "Modern framing is not JSON");
    }
    if (entry.protocolMode !== "modern") {
      assert(legacy.some((item) => item.contentType.includes("text/event-stream")), "Legacy framing did not use SSE");
    }
    return {
      detail: "响应封装与动态协议入口一致",
      evidence: [
        `mode=${entry.protocolMode}`,
        ...(entry.protocolMode === "legacy" ? [] : ["modern=application/json"]),
        ...(entry.protocolMode === "modern" ? [] : ["legacy=text/event-stream"]),
      ],
    };
  });
  await step("protocol.boundary", "核对传输边界", async () => {
    const response = await fetch(new URL("/api/status", mcpUrl));
    const value = await response.json() as { standaloneSseEndpoint?: boolean; subscriptions?: boolean };
    assert(value.standaloneSseEndpoint === false && value.subscriptions === false, "Unsupported streaming was advertised");
    return { detail: "未宣告独立 SSE 或订阅", evidence: ["standalone-sse=false", "subscriptions=false"] };
  });
  await step("protocol.verdict", "形成协议结论", async () => ({
    detail: "Modern、legacy、framing 与边界验证闭环",
    evidence: ["scope=protocol-only"],
  }));
}

async function runToolsScenario(
  mcpUrl: URL,
  authToken: string | undefined,
  step: StepRunner,
  entry: ScenarioEntrySnapshot,
) {
  await withModernClient(mcpUrl, authToken, "scenario-tools", async (client) => {
    let listedTools: Awaited<ReturnType<Client["listTools"]>>["tools"] = [];
    await step("tools.discover", "发现 13 个 Tool", async () => {
      listedTools = (await client.listTools()).tools;
      assert(listedTools.length === 13, `Expected 13 Tools, received ${listedTools.length}`);
      return { detail: "13/13 Tool 已发现", evidence: listedTools.map((tool) => tool.name) };
    });
    await step("tools.annotations", "检查安全注解与 Schema", async () => {
      const readOnly = ["system.health", "orders.search", "orders.dashboard", "skills.discover", "skills.run", "verification.status", "tasks.status", "tasks.list", "tasks.result"];
      for (const name of readOnly) {
        const annotations = listedTools.find((tool) => tool.name === name)?.annotations;
        assert(annotations?.readOnlyHint === true && annotations.destructiveHint === false, `${name} annotations are unsafe`);
      }
      const ordersSearch = listedTools.find((tool) => tool.name === "orders.search");
      const inputSchema = ordersSearch?.inputSchema as Record<string, unknown> | undefined;
      assert(inputSchema?.$defs !== undefined && inputSchema.allOf !== undefined, "JSON Schema 2020-12 composition is missing");
      assert(ordersSearch?.outputSchema !== undefined, "Tool outputSchema is missing");
      return {
        detail: "安全注解、组合输入 Schema 与输出 Schema 完整",
        evidence: [`readOnly=${readOnly.length}`, "json-schema=2020-12", "outputSchema=true"],
      };
    });
    await step("tools.read", "执行动态入口调用", async () => {
      const selected = entry.selection ?? "system.health";
      const argumentsByTool: Record<string, Record<string, unknown>> = {
        "system.health": {},
        "orders.search": { query: "northwind" },
        "orders.dashboard": { view: "orders", status: "paid" },
        "skills.discover": {},
        "tasks.create": { orderId: "ord_demo_1001", completeImmediately: true },
      };
      const result = await client.callTool({
        name: selected,
        arguments: argumentsByTool[selected] ?? {},
        _meta: traceMeta(entry),
      });
      assert(result.isError !== true && result.structuredContent !== undefined, `${selected} dynamic call failed`);
      const meta = result._meta as Record<string, unknown> | undefined;
      assert(meta?.["com.kenvoai/traceparent"] === entry.traceparent, "W3C traceparent was not preserved");
      return {
        detail: `${selected} 根据入口选择完成调用`,
        evidence: [`selection=${selected}`, "traceparent=preserved"],
      };
    });
    if (entry.parameters.taskLifecycle !== false) await step("tools.tasks", "执行应用任务生命周期", async () => {
      const pending = structured<{ taskId: string; status?: string }>(await client.callTool({
        name: "tasks.create",
        arguments: { orderId: "ord_demo_1001", completeImmediately: false },
      }));
      assert(pending.status === "pending", "Pending Task was not created");
      const cancelled = structured<{ status?: string }>(await client.callTool({ name: "tasks.cancel", arguments: { taskId: pending.taskId } }));
      const completed = structured<{ taskId: string }>(await client.callTool({
        name: "tasks.create",
        arguments: { orderId: "ord_demo_1002", completeImmediately: true },
      }));
      const result = structured<{ result?: { orders?: unknown[] } }>(await client.callTool({ name: "tasks.result", arguments: { taskId: completed.taskId } }));
      assert(cancelled.status === "cancelled" && result.result?.orders?.length === 1, "Task lifecycle failed");
      return {
        detail: "应用级 tasks.* Tool 创建、取消和结果形成闭环",
        evidence: ["classification=application-tools", "pending→cancelled", "completed→result"],
      };
    });
    await step("tools.verdict", "形成工具结论", async () => ({
      detail: "发现、安全注解、调用与 Task 生命周期验证闭环",
      evidence: ["scope=tools-only"],
    }));
  });
}

async function runSkillsScenario(
  mcpUrl: URL,
  authToken: string | undefined,
  step: StepRunner,
  entry: ScenarioEntrySnapshot,
) {
  await withModernClient(mcpUrl, authToken, "scenario-skills", async (client) => {
    await step("skills.prompts", "发现并渲染 Prompt", async () => {
      const prompts = await client.listPrompts();
      assert(prompts.prompts.length === 2, "Prompt discovery is incomplete");
      const rendered = await client.getPrompt({ name: "order-review", arguments: { orderId: "ord_demo_1001" } });
      const content = rendered.messages[0]?.content;
      assert(content?.type === "text" && content.text.includes("ord_demo_1001"), "Prompt rendering failed");
      return { detail: "2 个 Prompt 可发现并渲染", evidence: prompts.prompts.map((prompt) => prompt.name) };
    });
    await step("skills.discover", "发现应用 Skill", async () => {
      const value = structured<{ skills?: { id?: string }[] }>(await client.callTool({ name: "skills.discover", arguments: {} }));
      const ids = value.skills?.map((skill) => skill.id).filter((id): id is string => id !== undefined) ?? [];
      assert(ids.length === 2, "Skill discovery is incomplete");
      return { detail: "2/2 Skill 已发现", evidence: ids };
    });
    await step("skills.execute", "执行动态 Skill", async () => {
      const skillId = entry.selection ?? "order-summary";
      const orderId = typeof entry.parameters.orderId === "string"
        ? entry.parameters.orderId
        : "ord_demo_1001";
      const value = structured<{ skillId?: string; output?: { summary?: string; checklist?: string[] } }>(await client.callTool({
        name: "skills.run",
        arguments: {
          skillId,
          ...(skillId === "order-summary" ? { orderId } : {}),
        },
        _meta: traceMeta(entry),
      }));
      assert(value.skillId === skillId, "Dynamic Skill output is inaccurate");
      return {
        detail: `${skillId} 参数化输出正确`,
        evidence: [`skill=${skillId}`, ...(value.output?.summary === undefined ? [] : [value.output.summary])],
      };
    });
    await step("skills.input", "验证输入与错误路径", async () => {
      const checklist = structured<{ inputRequired?: boolean }>(await client.callTool({
        name: "skills.run",
        arguments: { skillId: "verification-checklist" },
      }));
      const unknown = await client.callTool({ name: "skills.run", arguments: { skillId: "unknown-skill" } });
      assert(checklist.inputRequired === true && unknown.isError === true, "Skill input or error behavior is inaccurate");
      return { detail: "输入需求与未知 Skill 拒绝通过", evidence: ["inputRequired=true", "unknown=isError"] };
    });
    await step("skills.verdict", "形成技能结论", async () => ({
      detail: "Prompt、发现、执行与错误路径验证闭环",
      evidence: ["scope=skills-only"],
    }));
  });
}

async function runMcpAppsScenario(
  mcpUrl: URL,
  authToken: string | undefined,
  step: StepRunner,
  entry: ScenarioEntrySnapshot,
) {
  await withModernClient(mcpUrl, authToken, "scenario-mcp-apps", async (client) => {
    const uri = "ui://mcp-v2/orders-dashboard.html";
    let html = "";
    await step("apps.metadata", "发现 Tool 元数据", async () => {
      const tool = (await client.listTools()).tools.find((candidate) => candidate.name === "orders.dashboard");
      const meta = tool?._meta as { ui?: { resourceUri?: string }; "openai/outputTemplate"?: string } | undefined;
      assert(meta?.ui?.resourceUri === uri && meta["openai/outputTemplate"] === uri, "MCP App metadata is incomplete");
      return { detail: "Tool 与 ui:// Resource 已关联", evidence: [uri] };
    });
    await step("apps.resource", "读取 ui:// Resource", async () => {
      const resource = await client.readResource({ uri });
      const content = resource.contents[0];
      assert(content !== undefined && "text" in content, "MCP App Resource has no HTML");
      assert(content.mimeType === "text/html;profile=mcp-app", "MCP App MIME is invalid");
      html = content.text;
      return { detail: "单文件 MCP App Resource 可读", evidence: [content.mimeType, `html=${html.length}`] };
    });
    await step("apps.bridge", "验证 Bridge 协议", async () => {
      assert(html.includes("ui/initialize") && html.includes("tools/call"), "MCP Apps bridge is incomplete");
      assert(!/<script[^>]+src=/.test(html) && !/<link[^>]+rel=[\"']stylesheet/.test(html), "MCP App is not self-contained");
      return { detail: "initialize、Tool 回调和单文件边界通过", evidence: ["ui/initialize", "tools/call", "self-contained"] };
    });
    await step("apps.render", "调用动态看板", async () => {
      const view = typeof entry.parameters.view === "string" ? entry.parameters.view : "orders";
      const status = typeof entry.parameters.status === "string" ? entry.parameters.status : "paid";
      const result = await client.callTool({
        name: "orders.dashboard",
        arguments: { view, status },
        _meta: traceMeta(entry),
      });
      const value = structured<{ parameters?: { view?: string; status?: string }; orders?: unknown[] }>(result);
      assert(value.parameters?.view === view && value.parameters.status === status, "Dashboard result is inaccurate");
      return {
        detail: "入口参数驱动 MCP App 结构化结果",
        evidence: [`view=${view}`, `status=${status}`, `orders=${value.orders?.length ?? 0}`],
      };
    });
    await step("apps.verdict", "形成应用结论", async () => ({
      detail: "元数据、Resource、Bridge 与 Tool 结果验证闭环",
      evidence: ["scope=mcp-apps-only"],
    }));
  });
}

async function runCodexScenario(
  mcpUrl: URL,
  authToken: string | undefined,
  step: StepRunner,
  entry: ScenarioEntrySnapshot,
) {
  const confirmation = entry.parameters.confirmation !== false;
  let elicitationCount = 0;
  const client = createClient("scenario-codex-session", "modern", {
    elicitation: () => {
      elicitationCount += 1;
      return confirmation;
    },
  });
  await client.connect(createTransport(mcpUrl, authToken));
  try {
    let runId = "";
    await step("codex.start", "开始验证会话", async () => {
      const value = structured<{ runId?: string }>(await client.callTool({ name: "verification.start", arguments: {} }));
      assert(typeof value.runId === "string", "verification.start returned no runId");
      runId = value.runId;
      return { detail: "服务端创建验证会话", evidence: [runId] };
    });
    await step("codex.calls", "执行 MCP 调用链", async () => {
      for (const [name, arguments_] of [
        ["system.health", { runId }],
        ["skills.discover", { runId }],
        ["orders.search", { runId, query: "demo" }],
        ["skills.run", { runId, skillId: "verification-checklist" }],
      ] as const) await client.callTool({ name, arguments: arguments_, _meta: traceMeta(entry) });
      return { detail: "四个限定 MCP 调用完成", evidence: ["system.health", "skills.discover", "orders.search", "skills.run"] };
    });
    await step("codex.evidence", "读取服务端证据", async () => {
      const value = structured<{ status?: string; evidence?: unknown[] }>(await client.callTool({
        name: "verification.status",
        arguments: { runId },
      }));
      assert(value.status === "started" && value.evidence?.length === 4, "Verification evidence is incomplete");
      return { detail: "服务端记录 4 条脱敏证据", evidence: ["evidence=4"] };
    });
    await step("codex.confirm", "确认并完成验证", async () => {
      const value = structured<{ status?: string; confirmationReceived?: boolean }>(await client.callTool({
        name: "verification.finish",
        arguments: { runId },
        _meta: traceMeta(entry),
      }));
      const expectedStatus = confirmation ? "passed" : "failed";
      assert(
        value.status === expectedStatus
          && value.confirmationReceived === confirmation
          && elicitationCount === 1,
        "Multi-round-trip verification result is inaccurate",
      );
      return {
        detail: "input_required 经 HMAC requestState 重入并进入服务端判定",
        evidence: [
          "input_required=1",
          "requestState=hmac",
          `confirmed=${confirmation}`,
          `status=${expectedStatus}`,
        ],
      };
    });
    await step("codex.verdict", "形成会话结论", async () => ({
      detail: "创建、调用、证据、确认与结果验证闭环",
      evidence: [runId, "scope=codex-only"],
    }));
  } finally {
    await client.close();
  }
}

async function executeScenario(
  scenarioId: ScenarioId,
  mcpUrl: URL,
  authToken?: string,
  entryRequest: ScenarioEntryRequest = scenarioEntryRequestSchema.parse({}),
): Promise<ScenarioReport> {
  const startedAt = new Date().toISOString();
  const runId = `scene_${scenarioId}_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
  let entry: ScenarioEntrySnapshot;
  try {
    entry = resolveScenarioEntry(
      await loadScenarioEntryDefinition(scenarioId, mcpUrl, authToken),
      entryRequest,
    );
  } catch (error) {
    entry = fallbackScenarioEntry(scenarioId, entryRequest, error);
  }
  const steps: ScenarioStepResult[] = [];
  const step = createStepRunner(steps);
  switch (scenarioId) {
    case "loop":
      await runLoopScenario(new URL("/", mcpUrl), step, entry);
      break;
    case "protocol":
      await runProtocolScenario(mcpUrl, authToken, step, entry);
      break;
    case "tools":
      await runToolsScenario(mcpUrl, authToken, step, entry);
      break;
    case "skills":
      await runSkillsScenario(mcpUrl, authToken, step, entry);
      break;
    case "mcp-apps":
      await runMcpAppsScenario(mcpUrl, authToken, step, entry);
      break;
    case "codex":
      await runCodexScenario(mcpUrl, authToken, step, entry);
      break;
  }
  const report: ScenarioReport = {
    runId,
    scenarioId,
    status: entry.gates.every((gate) => gate.status === "passed")
      && steps.every((item) => item.status === "passed")
      && steps.length > 0
      ? "passed"
      : "failed",
    startedAt,
    finishedAt: new Date().toISOString(),
    entry,
    route: steps.map((item) => item.id),
    steps,
  };
  return report;
}

export function isScenarioId(value: string): value is ScenarioId {
  return (SCENARIO_IDS as readonly string[]).includes(value);
}

export function createScenarioRunner() {
  const latestReports = new Map<ScenarioId, ScenarioReport>();
  const activeRuns = new Map<string, Promise<ScenarioReport>>();

  return {
    getScenarioReport(scenarioId: ScenarioId) {
      return latestReports.get(scenarioId);
    },
    listScenarioReports() {
      return SCENARIO_IDS.map((id) => ({ id, report: latestReports.get(id) ?? null }));
    },
    describeScenarioEntry(scenarioId: ScenarioId, mcpUrl: URL, authToken?: string) {
      return loadScenarioEntryDefinition(scenarioId, mcpUrl, authToken);
    },
    runScenario(
      scenarioId: ScenarioId,
      mcpUrl: URL,
      authToken?: string,
      entryRequest: ScenarioEntryRequest = scenarioEntryRequestSchema.parse({}),
    ) {
      const activeKey = `${scenarioId}:${JSON.stringify(entryRequest)}`;
      const active = activeRuns.get(activeKey);
      if (active !== undefined) return active;
      const promise = executeScenario(scenarioId, mcpUrl, authToken, entryRequest)
        .then((report) => {
          latestReports.set(scenarioId, report);
          return report;
        })
        .finally(() => {
          activeRuns.delete(activeKey);
        });
      activeRuns.set(activeKey, promise);
      return promise;
    },
  };
}
