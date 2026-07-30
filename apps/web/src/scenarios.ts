import type { ScenarioId } from "./scenario-report";

export interface ScenarioStepDefinition {
  id: string;
  label: string;
  copy: string;
  position: { x: number; y: number };
}

export interface ScenarioFeatureDefinition {
  id: string;
  tag: string;
  label: string;
  stepId: string;
  before: string;
  now: string;
  proof: string;
}

export interface ScenarioDefinition {
  id: ScenarioId;
  scene: string;
  label: string;
  signal: string;
  description: string;
  runLabel: string;
  features: readonly ScenarioFeatureDefinition[];
  steps: readonly ScenarioStepDefinition[];
}

const positions = [
  { x: 250, y: 12 },
  { x: 520, y: 46 },
  { x: 650, y: 238 },
  { x: 430, y: 365 },
  { x: 140, y: 328 },
] as const;

function steps(values: readonly (readonly [string, string, string])[]): readonly ScenarioStepDefinition[] {
  return values.map(([id, label, copy], index) => ({
    id,
    label,
    copy,
    position: positions[index] ?? positions[0],
  }));
}

export const SCENARIOS: readonly ScenarioDefinition[] = [
  {
    id: "loop",
    scene: "00",
    label: "闭环实验",
    signal: "闭环现场",
    description: "从实时发现进入扩展、缓存、能力目录和运行矩阵，不触发其他场景。",
    runLabel: "运行闭环自检",
    features: [
      {
        id: "extensions",
        tag: "EXTENSIONS",
        label: "扩展驱动入口",
        stepId: "loop.matrix",
        before: "前端预先写死能力与入口，服务变化后仍展示旧路径。",
        now: "server/discover 暴露扩展，当前场景据此生成有界入口。",
        proof: "运行矩阵节点回显 extension=com.kenvoai.mcp-v2.dynamic-entry。",
      },
      {
        id: "cache-hints",
        tag: "CACHE HINTS",
        label: "发现缓存语义",
        stepId: "loop.verdict",
        before: "目录能否缓存、缓存多久没有可验证边界。",
        now: "发现与 tools/list 分别返回 ttlMs 和 cacheScope。",
        proof: "闭环结论节点回显 discover-ttl 与 tools-ttl。",
      },
      {
        id: "server-verdict",
        tag: "SERVER EVIDENCE",
        label: "服务端拥有结论",
        stepId: "loop.verdict",
        before: "前端动画结束就容易被误判为测试通过。",
        now: "React Flow 只播放服务端报告，无法自行制造 passed。",
        proof: "Verdict、runId、步骤状态和证据全部来自本场景报告。",
      },
    ],
    steps: steps([
      ["loop.status", "读取状态", "确认当前 MCP 服务可达"],
      ["loop.registry", "核对注册", "检查六个独立场景"],
      ["loop.catalogs", "读取目录", "核对 Tool、Prompt、Resource 与 Skill"],
      ["loop.matrix", "验证矩阵", "确认运行能力与协商扩展"],
      ["loop.verdict", "闭环结论", "生成本场景独立 Verdict"],
    ]),
  },
  {
    id: "protocol",
    scene: "01",
    label: "协议",
    signal: "协商现场",
    description: "按动态入口选择 auto、modern 或 legacy，观察协商与响应封装边界。",
    runLabel: "运行协议场景",
    features: [
      {
        id: "version-negotiation",
        tag: "NEGOTIATION",
        label: "时代协商",
        stepId: "protocol.modern",
        before: "单一版本路径无法证明 modern 与兼容客户端的真实边界。",
        now: "入口可选择 auto、Modern 2026-07-28 或 Legacy 2025-06-18。",
        proof: "自包含请求或 Legacy 兼容节点回显实际 protocolVersion。",
      },
      {
        id: "era-framing",
        tag: "ERA FRAMING",
        label: "分时代响应封装",
        stepId: "protocol.framing",
        before: "JSON 与 SSE 被混成同一种“请求成功”状态。",
        now: "Modern 成功响应固定为 JSON，legacy stateless 结果使用 SSE 帧。",
        proof: "响应封装节点记录 application/json 与 text/event-stream。",
      },
      {
        id: "bounded-fallback",
        tag: "BOUNDARY",
        label: "有界兼容",
        stepId: "protocol.boundary",
        before: "兼容 legacy 容易被误解为提供独立 SSE 或动态订阅。",
        now: "只保留同一 Streamable HTTP 入口上的 stateless fallback。",
        proof: "传输边界节点验证 standalone SSE 与 subscriptions 均未宣称。",
      },
    ],
    steps: steps([
      ["protocol.modern", "Modern 自包含请求", "请求携带版本、客户端信息与能力"],
      ["protocol.legacy", "Legacy 兼容连接", "验证 2025-06-18 stateless fallback"],
      ["protocol.framing", "响应封装", "区分 JSON 与 SSE framing"],
      ["protocol.boundary", "传输边界", "拒绝虚假订阅与独立 SSE"],
      ["protocol.verdict", "协议结论", "收敛本场景证据"],
    ]),
  },
  {
    id: "tools",
    scene: "02",
    label: "工具",
    signal: "调用现场",
    description: "从 tools/list 选择实际入口，确认 Schema、Trace 与可选应用任务分支。",
    runLabel: "运行工具场景",
    features: [
      {
        id: "schema-2020",
        tag: "JSON SCHEMA 2020-12",
        label: "完整输入输出契约",
        stepId: "tools.annotations",
        before: "只展示 Tool 名称，调用者无法判断输出结构与安全注解。",
        now: "Tool 同时公开 inputSchema、outputSchema 与行为 annotations。",
        proof: "Schema 与注解节点验证 2020-12 契约和只读/破坏性边界。",
      },
      {
        id: "trace-context",
        tag: "TRACE CONTEXT",
        label: "调用可追踪",
        stepId: "tools.read",
        before: "入口选择与实际 Tool 调用之间没有可关联的请求证据。",
        now: "每次动态调用携带 W3C traceparent，并由服务端报告回显。",
        proof: "动态调用节点展示 selection、trace 与结构化结果。",
      },
      {
        id: "application-tasks",
        tag: "APPLICATION TASKS",
        label: "可选任务生命周期",
        stepId: "tools.tasks",
        before: "长操作只能同步等待，或误称为已移除的原生 Task RPC。",
        now: "通过有界 tasks.* Tool 演示创建、状态、取消与结果读取。",
        proof: "开启“应用任务闭环”后，实际路线追加 tasks 节点。",
      },
    ],
    steps: steps([
      ["tools.discover", "发现 Tool", "核对 13 个公开入口"],
      ["tools.annotations", "Schema 与注解", "确认 JSON Schema 2020-12 与安全边界"],
      ["tools.read", "动态调用", "执行入口选中的 Tool 与 Trace"],
      ["tools.tasks", "应用任务", "可选创建、取消并读取结果"],
      ["tools.verdict", "工具结论", "收敛本场景证据"],
    ]),
  },
  {
    id: "skills",
    scene: "03",
    label: "技能",
    signal: "编排现场",
    description: "从实时 Skill 目录选择入口，查看 Prompt、参数化执行与拒绝路径。",
    runLabel: "运行技能场景",
    features: [
      {
        id: "prompt-composition",
        tag: "PROMPTS",
        label: "参数化 Prompt",
        stepId: "skills.prompts",
        before: "技能说明与 Prompt 模板脱节，输入只能靠调用方猜测。",
        now: "原生 prompts/list 与 prompts/get 提供可发现、可渲染的参数入口。",
        proof: "Prompt 节点回显真实目录与参数化渲染结果。",
      },
      {
        id: "live-skill-catalog",
        tag: "LIVE DISCOVERY",
        label: "实时 Skill 目录",
        stepId: "skills.discover",
        before: "前端硬编码 Skill 名称，无法反映服务端当前编排能力。",
        now: "先运行 skills.discover，再执行用户从实时目录选择的 Skill。",
        proof: "发现节点与执行节点分别证明目录和选中项。",
      },
      {
        id: "bounded-input",
        tag: "INPUT BOUNDARY",
        label: "输入与拒绝路径",
        stepId: "skills.input",
        before: "只演示成功路径，缺少必填输入和非法 Skill 的边界。",
        now: "同一闭环验证 inputRequired 与拒绝结果，不把错误吞成通过。",
        proof: "输入与错误节点保存服务端拒绝证据。",
      },
    ],
    steps: steps([
      ["skills.prompts", "Prompt", "发现并渲染参数化 Prompt"],
      ["skills.discover", "Skill 发现", "读取应用层 Skill 目录"],
      ["skills.execute", "Skill 执行", "运行入口选中的应用 Skill"],
      ["skills.input", "输入与错误", "验证 inputRequired 和拒绝"],
      ["skills.verdict", "技能结论", "收敛本场景证据"],
    ]),
  },
  {
    id: "mcp-apps",
    scene: "04",
    label: "MCP 应用",
    signal: "交互现场",
    description: "入口参数驱动 Tool 元数据、ui:// Resource、Bridge 与实际应用结果。",
    runLabel: "运行应用场景",
    features: [
      {
        id: "tool-linked-ui",
        tag: "UI RESOURCE",
        label: "Tool 关联 ui://",
        stepId: "apps.metadata",
        before: "Tool 调用成功与宿主应该渲染哪个界面没有明确关系。",
        now: "Tool 元数据通过 ui.resourceUri 指向可发现的 ui:// Resource。",
        proof: "元数据节点回显 ui://mcp-v2/orders-dashboard.html。",
      },
      {
        id: "sandbox-bridge",
        tag: "MCP APPS BRIDGE",
        label: "沙箱双向交互",
        stepId: "apps.bridge",
        before: "HTML 展示与 MCP Tool 调用割裂，宿主无法验证反向交互。",
        now: "自包含 App 通过 ui/initialize 与 tools/call Bridge 连接宿主。",
        proof: "Bridge 节点分别验证初始化、反向调用和单文件边界。",
      },
      {
        id: "structured-ui",
        tag: "STRUCTURED RESULT",
        label: "参数驱动界面",
        stepId: "apps.render",
        before: "静态 iframe 无法证明 Tool 参数真正改变了应用数据。",
        now: "view 与 status 入口直接驱动 orders.dashboard 结构化结果。",
        proof: "动态看板节点回显视图、状态和订单数量。",
      },
    ],
    steps: steps([
      ["apps.metadata", "Tool 元数据", "解析 ui.resourceUri"],
      ["apps.resource", "读取 Resource", "获取自包含 App HTML"],
      ["apps.bridge", "Bridge 初始化", "核对 initialize 与 tools/call"],
      ["apps.render", "动态看板", "调用参数化 orders.dashboard"],
      ["apps.verdict", "应用结论", "收敛本场景证据"],
    ]),
  },
  {
    id: "codex",
    scene: "05",
    label: "Codex 会话",
    signal: "验证现场",
    description: "回看真实 Client 调用、Trace、input_required、HMAC 状态和最终 Verdict。",
    runLabel: "运行会话验证",
    features: [
      {
        id: "trace-chain",
        tag: "TRACE CONTEXT",
        label: "限定调用链",
        stepId: "codex.calls",
        before: "Client 声称完成调用，但各 Tool 之间没有同一会话证据。",
        now: "四个限定调用携带 runId 与 traceparent，由服务端串联。",
        proof: "调用链节点逐项回显 system.health、skills.discover、orders.search、skills.run。",
      },
      {
        id: "owned-evidence",
        tag: "SERVER EVIDENCE",
        label: "脱敏证据归服务端",
        stepId: "codex.evidence",
        before: "客户端可以直接把最终状态写成 passed。",
        now: "客户端只能读取审计证据，Verdict 由服务端判定。",
        proof: "证据节点要求四条服务端记录齐全。",
      },
      {
        id: "input-required",
        tag: "INPUT_REQUIRED",
        label: "多轮确认重入",
        stepId: "codex.confirm",
        before: "人工确认脱离协议调用，状态容易伪造或重放。",
        now: "verification.finish 通过 input_required 与 HMAC requestState 完成重入。",
        proof: "确认节点回显 input_required=1、requestState=hmac 与最终状态。",
      },
    ],
    steps: steps([
      ["codex.start", "开始会话", "服务端创建 runId"],
      ["codex.calls", "MCP 调用链", "执行四个限定调用"],
      ["codex.evidence", "读取证据", "核对服务端审计记录"],
      ["codex.confirm", "多轮人工确认", "input_required 重入后完成 Verdict"],
      ["codex.verdict", "会话结论", "收敛本场景证据"],
    ]),
  },
];

export function getScenario(id: ScenarioId) {
  return SCENARIOS.find((scenario) => scenario.id === id) ?? SCENARIOS[0]!;
}
