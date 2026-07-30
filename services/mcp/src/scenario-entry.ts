import {
  SCENARIO_IDS,
  scenarioEntryDefinitionSchema,
  scenarioEntryRequestSchema,
  scenarioEntrySnapshotSchema,
  type ScenarioCacheHint,
  type ScenarioDiscoverySnapshot,
  type ScenarioEntryDefinition,
  type ScenarioEntryField,
  type ScenarioEntryRequest,
  type ScenarioEntrySnapshot,
  type ScenarioEntryValue,
  type ScenarioId,
} from "@mcp-v2/shared";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { LEGACY_PROTOCOL_VERSION, MODERN_PROTOCOL_VERSION } from "./domain.ts";

const DYNAMIC_ENTRY_EXTENSION = "com.kenvoai.mcp-v2.dynamic-entry";
const DEFAULT_CACHE_HINT: ScenarioCacheHint = { ttlMs: 0, cacheScope: "private" };

function createDiscoveryClient() {
  return new Client(
    { name: "scenario-entry-discovery", version: "0.1.0" },
    {
      supportedProtocolVersions: [MODERN_PROTOCOL_VERSION, LEGACY_PROTOCOL_VERSION],
      versionNegotiation: { mode: "auto" },
    },
  );
}

function createTransport(mcpUrl: URL, authToken?: string) {
  return new StreamableHTTPClientTransport(mcpUrl, {
    ...(authToken === undefined ? {} : { authProvider: { token: async () => authToken } }),
  });
}

function readCacheHint(value: unknown): ScenarioCacheHint {
  if (typeof value !== "object" || value === null) return DEFAULT_CACHE_HINT;
  const record = value as Record<string, unknown>;
  return {
    ttlMs: typeof record.ttlMs === "number" && record.ttlMs >= 0 ? record.ttlMs : 0,
    cacheScope: record.cacheScope === "public" ? "public" : "private",
  };
}

function protocolVersions(discover: unknown): string[] {
  if (typeof discover !== "object" || discover === null) return [MODERN_PROTOCOL_VERSION];
  const record = discover as Record<string, unknown>;
  const candidates = [record.protocolVersions, record.supportedProtocolVersions];
  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.every((item) => typeof item === "string")) return candidate;
  }
  return [MODERN_PROTOCOL_VERSION];
}

function extensionNames(discover: unknown): string[] {
  if (typeof discover !== "object" || discover === null) return [];
  const capabilities = (discover as { capabilities?: unknown }).capabilities;
  if (typeof capabilities !== "object" || capabilities === null) return [];
  const extensions = (capabilities as { extensions?: unknown }).extensions;
  return typeof extensions === "object" && extensions !== null ? Object.keys(extensions) : [];
}

function option(value: ScenarioEntryValue, label = String(value)) {
  return { value, label };
}

function protocolField(): ScenarioEntryField {
  return {
    key: "protocolMode",
    label: "协议入口",
    description: "从 server/discover 的实时协商能力选择运行模式",
    control: "select",
    binding: "protocolMode",
    required: true,
    defaultValue: "auto",
    options: [
      option("auto", "自动协商"),
      option("modern", "仅 Modern 2026-07-28"),
      option("legacy", "Legacy 兼容"),
    ],
    source: "server/discover",
  };
}

function fieldsFor(
  scenarioId: ScenarioId,
  discovery: ScenarioDiscoverySnapshot,
  skillIds: string[],
): ScenarioEntryField[] {
  const protocol = protocolField();
  switch (scenarioId) {
    case "loop":
      return [
        protocol,
        {
          key: "focus",
          label: "闭环焦点",
          description: "决定闭环入口首先核对的 v2 运行面",
          control: "select",
          binding: "selection",
          required: true,
          defaultValue: "extensions",
          options: [
            option("extensions", "扩展与动态入口"),
            option("catalogs", "实时能力目录"),
            option("capabilities", "运行能力矩阵"),
          ],
          source: "application",
        },
      ];
    case "protocol":
      return [protocol];
    case "tools": {
      const safeTools = discovery.tools.filter((name) => [
        "system.health",
        "orders.search",
        "orders.dashboard",
        "skills.discover",
        "tasks.create",
      ].includes(name));
      return [
        protocol,
        {
          key: "tool",
          label: "入口 Tool",
          description: "选项直接来自本次 tools/list，运行时据此改变调用路径",
          control: "select",
          binding: "selection",
          required: true,
          defaultValue: safeTools[0] ?? "system.health",
          options: (safeTools.length === 0 ? ["system.health"] : safeTools).map((name) => option(name)),
          source: "tools/list",
        },
        {
          key: "taskLifecycle",
          label: "应用任务闭环",
          description: "是否追加验证现有应用级 tasks.* Tool 生命周期",
          control: "boolean",
          binding: "parameter",
          required: true,
          defaultValue: true,
          source: "application",
        },
      ];
    }
    case "skills":
      return [
        protocol,
        {
          key: "skill",
          label: "入口 Skill",
          description: "先通过 skills.discover 实时读取，再执行选中的应用 Skill",
          control: "select",
          binding: "selection",
          required: true,
          defaultValue: skillIds[0] ?? "order-summary",
          options: (skillIds.length === 0 ? ["order-summary"] : skillIds).map((id) => option(id)),
          source: "application",
        },
        {
          key: "orderId",
          label: "订单参数",
          description: "作为 Skill 的有界运行输入",
          control: "text",
          binding: "parameter",
          required: false,
          defaultValue: "ord_demo_1001",
          source: "application",
        },
      ];
    case "mcp-apps":
      return [
        protocol,
        {
          key: "view",
          label: "应用视图",
          description: "决定 MCP App Tool 返回的场景视图",
          control: "select",
          binding: "parameter",
          required: true,
          defaultValue: "orders",
          options: ["overview", "orders", "status"].map((value) => option(value)),
          source: "application",
        },
        {
          key: "status",
          label: "状态过滤",
          description: "与应用视图共同形成独立的动态闭环",
          control: "select",
          binding: "parameter",
          required: true,
          defaultValue: "paid",
          options: ["all", "paid", "pending", "fulfilled"].map((value) => option(value)),
          source: "application",
        },
      ];
    case "codex":
      return [
        protocol,
        {
          key: "confirmation",
          label: "人工确认",
          description: "由客户端响应 input_required，服务端校验 HMAC requestState 后重入",
          control: "boolean",
          binding: "parameter",
          required: true,
          defaultValue: true,
          source: "application",
        },
      ];
  }
}

async function inspectLiveServer(mcpUrl: URL, authToken?: string) {
  const client = createDiscoveryClient();
  await client.connect(createTransport(mcpUrl, authToken));
  try {
    const discover = client.getDiscoverResult() ?? await client.discover();
    const [toolsResult, promptsResult, resourcesResult, skillsResult] = await Promise.all([
      client.listTools(),
      client.listPrompts(),
      client.listResources(),
      client.callTool({ name: "skills.discover", arguments: {} }),
    ]);
    const skills = skillsResult.structuredContent as { skills?: { id?: unknown }[] } | undefined;
    return {
      discovery: {
        protocolVersions: protocolVersions(discover),
        tools: toolsResult.tools.map((tool) => tool.name),
        prompts: promptsResult.prompts.map((prompt) => prompt.name),
        resources: resourcesResult.resources.map((resource) => resource.uri),
        extensions: extensionNames(discover),
      } satisfies ScenarioDiscoverySnapshot,
      cache: {
        discover: readCacheHint(discover),
        tools: readCacheHint(toolsResult),
      },
      skillIds: skills?.skills
        ?.map((skill) => skill.id)
        .filter((id): id is string => typeof id === "string") ?? [],
    };
  } finally {
    await client.close();
  }
}

export async function describeScenarioEntry(
  scenarioId: ScenarioId,
  mcpUrl: URL,
  authToken?: string,
): Promise<ScenarioEntryDefinition> {
  const live = await inspectLiveServer(mcpUrl, authToken);
  return scenarioEntryDefinitionSchema.parse({
    scenarioId,
    fields: fieldsFor(scenarioId, live.discovery, live.skillIds),
    supportedTriggers: ["ui", "api", "mcp-client", "codex"],
    discovery: live.discovery,
    cache: live.cache,
  });
}

function makeTraceparent(): string {
  const traceId = [...crypto.getRandomValues(new Uint8Array(16))]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  const parentId = [...crypto.getRandomValues(new Uint8Array(8))]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  return `00-${traceId}-${parentId}-01`;
}

function effectiveRequest(
  definition: ScenarioEntryDefinition,
  requested: ScenarioEntryRequest,
): ScenarioEntryRequest {
  const parameters = { ...requested.parameters };
  let protocolMode = requested.protocolMode;
  let selection = requested.selection;
  for (const field of definition.fields) {
    if (field.defaultValue === undefined) continue;
    if (field.binding === "protocolMode" && requested.protocolMode === "auto") {
      protocolMode = String(field.defaultValue) as ScenarioEntryRequest["protocolMode"];
    } else if (field.binding === "selection" && selection === undefined) {
      selection = String(field.defaultValue);
    } else if (field.binding === "parameter" && parameters[field.key] === undefined) {
      parameters[field.key] = field.defaultValue;
    }
  }
  return {
    trigger: requested.trigger,
    protocolMode,
    ...(selection === undefined ? {} : { selection }),
    parameters,
  };
}

export function resolveScenarioEntry(
  definition: ScenarioEntryDefinition,
  request: ScenarioEntryRequest = scenarioEntryRequestSchema.parse({}),
): ScenarioEntrySnapshot {
  const resolved = effectiveRequest(definition, scenarioEntryRequestSchema.parse(request));
  const selectedField = definition.fields.find((field) => field.binding === "selection");
  const selectionIsValid = selectedField === undefined
    || selectedField.options === undefined
    || selectedField.options.some((entry) => entry.value === resolved.selection);
  const invalidParameterFields = definition.fields
    .filter((field) => field.binding === "parameter")
    .filter((field) => {
      const value = resolved.parameters[field.key];
      if (value === undefined) return field.required;
      if (field.required && typeof value === "string" && value.trim() === "") return true;
      return field.options !== undefined
        && !field.options.some((entry) => entry.value === value);
    })
    .map((field) => field.key);
  const traceparent = makeTraceparent();
  return scenarioEntrySnapshotSchema.parse({
    ...resolved,
    traceparent,
    discovery: definition.discovery,
    cache: definition.cache,
    gates: [
      {
        id: "entry.discovery",
        label: "Modern 动态发现",
        status: definition.discovery.protocolVersions.includes(MODERN_PROTOCOL_VERSION) ? "passed" : "failed",
        detail: `${definition.discovery.tools.length} tools · ${definition.discovery.prompts.length} prompts · ${definition.discovery.resources.length} resources`,
      },
      {
        id: "entry.cache",
        label: "缓存语义",
        status: definition.cache.discover.ttlMs > 0 && definition.cache.tools.ttlMs > 0 ? "passed" : "failed",
        detail: `discover=${definition.cache.discover.ttlMs}ms · tools=${definition.cache.tools.ttlMs}ms`,
      },
      {
        id: "entry.extension",
        label: "扩展协商",
        status: definition.discovery.extensions.includes(DYNAMIC_ENTRY_EXTENSION) ? "passed" : "failed",
        detail: definition.discovery.extensions.join(", ") || "未发现扩展",
      },
      {
        id: "entry.selection",
        label: "动态选择",
        status: selectionIsValid ? "passed" : "failed",
        detail: resolved.selection === undefined ? "无选择型入口" : `selection=${resolved.selection}`,
      },
      {
        id: "entry.parameters",
        label: "有界参数",
        status: invalidParameterFields.length === 0 ? "passed" : "failed",
        detail: invalidParameterFields.length === 0
          ? `${Object.keys(resolved.parameters).length} 个参数通过入口契约`
          : `无效字段：${invalidParameterFields.join(", ")}`,
      },
      {
        id: "entry.trace",
        label: "Trace Context",
        status: "passed",
        detail: traceparent,
      },
    ],
  });
}

export function fallbackScenarioEntry(
  scenarioId: ScenarioId,
  request: ScenarioEntryRequest,
  error: unknown,
): ScenarioEntrySnapshot {
  const emptyDiscovery: ScenarioDiscoverySnapshot = {
    protocolVersions: [],
    tools: [],
    prompts: [],
    resources: [],
    extensions: [],
  };
  const definition = scenarioEntryDefinitionSchema.parse({
    scenarioId,
    fields: fieldsFor(scenarioId, emptyDiscovery, []),
    supportedTriggers: ["ui", "api", "mcp-client", "codex"],
    discovery: emptyDiscovery,
    cache: { discover: DEFAULT_CACHE_HINT, tools: DEFAULT_CACHE_HINT },
  });
  const snapshot = resolveScenarioEntry(definition, request);
  return {
    ...snapshot,
    gates: snapshot.gates.map((gate) => gate.id === "entry.discovery" ? {
      ...gate,
      status: "failed",
      detail: error instanceof Error ? error.message : "动态发现失败",
    } : gate),
  };
}

export { SCENARIO_IDS };
