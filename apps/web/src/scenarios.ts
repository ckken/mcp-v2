import type { ScenarioId } from "./scenario-report";

export interface ScenarioStepDefinition {
  id: string;
  label: string;
  copy: string;
  position: { x: number; y: number };
}

export interface ScenarioDefinition {
  id: ScenarioId;
  scene: string;
  label: string;
  signal: string;
  description: string;
  runLabel: string;
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
    steps: steps([
      ["protocol.modern", "Modern 握手", "按入口协商 2026-07-28"],
      ["protocol.legacy", "Legacy 握手", "验证 stateless fallback"],
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
