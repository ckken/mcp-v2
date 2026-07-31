import { useEffect, useMemo, useState } from "react";
import {
  scenarioEntryDefinitionSchema,
  type ScenarioEntryDefinition,
  type ScenarioEntryField,
  type ScenarioEntryRequest,
  type ScenarioEntryValue,
} from "@mcp-v2/shared";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import {
  CheckIcon,
  CircleIcon,
  GitBranchIcon,
  PlayIcon,
  RefreshCwIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { asScenarioReport, type ScenarioId, type ScenarioReportView } from "./scenario-report";
import { SCENARIOS, type ScenarioDefinition, type ScenarioStepDefinition } from "./scenarios";

type FlowView = "old" | "v2";
type FlowState = "idle" | "running" | "passed" | "failed" | "skipped";
type EntryMap = Partial<Record<ScenarioId, ScenarioEntryDefinition>>;
type RequestMap = Partial<Record<ScenarioId, ScenarioEntryRequest>>;
type ReportMap = Partial<Record<ScenarioId, ScenarioReportView | null>>;

type RouteNodeData = {
  index: string;
  eyebrow: string;
  label: string;
  copy: string;
  state: FlowState;
  view: FlowView;
  selected: boolean;
  compact: boolean;
  tags: readonly string[];
};

type RouteNode = Node<RouteNodeData, "route">;
type RenderedStep = Pick<ScenarioStepDefinition, "id" | "label" | "copy">;

const wait = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

function initializeEntryRequest(entry: ScenarioEntryDefinition): ScenarioEntryRequest {
  const request: ScenarioEntryRequest = {
    trigger: "ui",
    protocolMode: "auto",
    parameters: {},
  };
  for (const field of entry.fields) {
    if (field.defaultValue === undefined) continue;
    if (field.binding === "protocolMode") {
      request.protocolMode = String(field.defaultValue) as ScenarioEntryRequest["protocolMode"];
    } else if (field.binding === "selection") {
      request.selection = String(field.defaultValue);
    } else {
      request.parameters[field.key] = field.defaultValue;
    }
  }
  return request;
}

function matchesDefinition(report: ScenarioReportView, definition: ScenarioDefinition) {
  return report.scenarioId === definition.id
    && report.route.length === report.steps.length
    && report.steps.every((step, index) => step.id === report.route[index]);
}

function useCompactFlow() {
  const [compact, setCompact] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(max-width: 640px)");
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return compact;
}

function routePosition(index: number, count: number, compact: boolean) {
  if (compact) return { x: 44, y: 34 + index * 126 };
  const angle = -Math.PI / 2 + (Math.PI * 2 * index) / Math.max(count, 1);
  return {
    x: 425 + Math.cos(angle) * 335,
    y: 250 + Math.sin(angle) * 205,
  };
}

function oldPosition(index: number, compact: boolean) {
  if (compact) return { x: 44, y: 54 + index * 164 };
  return { x: 54 + index * 292, y: index % 2 === 0 ? 192 : 278 };
}

function RouteNodeCard({ data }: NodeProps<RouteNode>) {
  return (
    <article
      className={[
        "master-node",
        `master-node-${data.state}`,
        `master-node-${data.view}`,
        data.selected ? "is-selected" : "",
      ].filter(Boolean).join(" ")}
      aria-label={`${data.label}：${data.state}`}
    >
      <Handle type="target" position={data.compact ? Position.Top : Position.Left} />
      <span className="master-node-index">{data.index}</span>
      <span className="master-node-content">
        <small>{data.eyebrow}</small>
        <strong>{data.label}</strong>
        <span>{data.copy}</span>
        {data.tags.length > 0 && (
          <span className="master-node-tags">
            {data.tags.map((tag) => <code key={tag}>{tag}</code>)}
          </span>
        )}
      </span>
      <span className="master-node-state" aria-hidden="true">
        {data.state === "passed" && <CheckIcon />}
        {data.state === "failed" && <XIcon />}
        {data.state === "running" && <RefreshCwIcon />}
        {data.state === "skipped" && <span>—</span>}
        {data.state === "idle" && <CircleIcon />}
      </span>
      <Handle type="source" position={data.compact ? Position.Bottom : Position.Right} />
    </article>
  );
}

const nodeTypes = { route: RouteNodeCard };

async function readEntry(definition: ScenarioDefinition) {
  const response = await fetch(`/api/scenarios/${definition.id}/entry`, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`${definition.label}动态发现失败：HTTP ${response.status}`);
  const parsed = scenarioEntryDefinitionSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error(`${definition.label}动态入口契约无效`);
  return parsed.data;
}

async function readLatest(definition: ScenarioDefinition) {
  const response = await fetch(`/api/scenarios/${definition.id}/latest`, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`${definition.label}报告读取失败：HTTP ${response.status}`);
  const report = asScenarioReport(await response.json());
  if (report !== null && !matchesDefinition(report, definition)) {
    throw new Error(`${definition.label}报告与路线不一致`);
  }
  return report;
}

function fieldValue(request: ScenarioEntryRequest, field: ScenarioEntryField): ScenarioEntryValue {
  if (field.binding === "protocolMode") return request.protocolMode;
  if (field.binding === "selection") return request.selection ?? field.defaultValue ?? "";
  return request.parameters[field.key] ?? field.defaultValue ?? "";
}

function updateField(
  request: ScenarioEntryRequest,
  field: ScenarioEntryField,
  value: ScenarioEntryValue,
): ScenarioEntryRequest {
  if (field.binding === "protocolMode") {
    return { ...request, protocolMode: String(value) as ScenarioEntryRequest["protocolMode"] };
  }
  if (field.binding === "selection") return { ...request, selection: String(value) };
  return { ...request, parameters: { ...request.parameters, [field.key]: value } };
}

function plannedSteps(definition: ScenarioDefinition, request: ScenarioEntryRequest): RenderedStep[] {
  return definition.steps
    .filter((step) => {
      if (definition.id === "protocol" && request.protocolMode === "modern") return step.id !== "protocol.legacy";
      if (definition.id === "protocol" && request.protocolMode === "legacy") return step.id !== "protocol.modern";
      if (definition.id === "tools" && request.parameters.taskLifecycle === false) return step.id !== "tools.tasks";
      return true;
    })
    .map((step) => {
      if (step.id === "tools.read") {
        return { ...step, label: `调用 ${request.selection ?? "system.health"}` };
      }
      if (step.id === "skills.execute") {
        return { ...step, label: `执行 ${request.selection ?? "order-summary"}` };
      }
      if (step.id === "apps.render") {
        return {
          ...step,
          label: `${String(request.parameters.view ?? "orders")} / ${String(request.parameters.status ?? "paid")}`,
        };
      }
      if (step.id === "codex.confirm" && request.parameters.confirmation === false) {
        return { ...step, label: "拒绝未确认完成", copy: "input_required 返回拒绝，服务端保持 failed" };
      }
      return step;
    });
}

function conditionSummary(definition: ScenarioDefinition, request: ScenarioEntryRequest) {
  const values = [`运行面=${definition.label}`];
  if (definition.id === "protocol") values.push(`协议=${request.protocolMode}`);
  if (request.selection !== undefined) values.push(`选择=${request.selection}`);
  for (const [key, value] of Object.entries(request.parameters)) values.push(`${key}=${String(value)}`);
  return values.join(" AND ");
}

function reportMatchesRequest(report: ScenarioReportView, request: ScenarioEntryRequest) {
  return report.entry.protocolMode === request.protocolMode
    && report.entry.selection === request.selection
    && JSON.stringify(report.entry.parameters) === JSON.stringify(request.parameters);
}

function nodeState(
  id: string,
  report: ScenarioReportView | null | undefined,
  activeStepIndex: number,
  renderedSteps: readonly RenderedStep[],
  running: boolean,
): FlowState {
  if (id === "discover" || id === "route") {
    if (running && activeStepIndex < 0) return "running";
    return report?.status ?? "idle";
  }
  const reportStep = report?.steps.find((step) => step.id === id);
  if (reportStep !== undefined) return reportStep.status;
  const index = renderedSteps.findIndex((step) => step.id === id);
  if (running && index === activeStepIndex) return "running";
  if (running && index < activeStepIndex) return "passed";
  return "idle";
}

export function UnifiedWorkflow({
  focusedScenario,
  onFocus,
  onCompleted,
}: {
  focusedScenario: ScenarioId;
  onFocus: (scenario: ScenarioId) => void;
  onCompleted?: () => Promise<void>;
}) {
  const compact = useCompactFlow();
  const [flowView, setFlowView] = useState<FlowView>("v2");
  const [entries, setEntries] = useState<EntryMap>({});
  const [requests, setRequests] = useState<RequestMap>({});
  const [reports, setReports] = useState<ReportMap>({});
  const [activeStepIndex, setActiveStepIndex] = useState(-1);
  const [closing, setClosing] = useState(false);
  const [running, setRunning] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedDefinition = SCENARIOS.find((item) => item.id === focusedScenario) ?? SCENARIOS[0]!;
  const selectedEntry = entries[focusedScenario];
  const selectedRequest = requests[focusedScenario]
    ?? (selectedEntry === undefined ? undefined : initializeEntryRequest(selectedEntry));
  const storedReport = reports[focusedScenario];
  const selectedReport = storedReport !== null
    && storedReport !== undefined
    && selectedRequest !== undefined
    && reportMatchesRequest(storedReport, selectedRequest)
    ? storedReport
    : null;

  const refresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      const discovered = await Promise.all(SCENARIOS.map(async (definition) => {
        const [entry, report] = await Promise.all([readEntry(definition), readLatest(definition)]);
        return { id: definition.id, entry, report };
      }));
      setEntries(Object.fromEntries(discovered.map(({ id, entry }) => [id, entry])) as EntryMap);
      setRequests((current) => {
        const next = { ...current };
        for (const { id, entry } of discovered) next[id] ??= initializeEntryRequest(entry);
        return next;
      });
      setReports(Object.fromEntries(discovered.map(({ id, report }) => [id, report])) as ReportMap);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "动态入口发现失败");
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    setActiveStepIndex(-1);
    setClosing(false);
    setError(null);
  }, [focusedScenario]);

  const run = async () => {
    if (flowView === "old" || selectedEntry === undefined || selectedRequest === undefined) return;
    setRunning(true);
    setClosing(false);
    setActiveStepIndex(-1);
    setError(null);
    setReports((current) => ({ ...current, [focusedScenario]: null }));

    try {
      await wait(260);
      const response = await fetch(`/api/scenarios/${focusedScenario}/run`, {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify(selectedRequest),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: unknown };
        throw new Error(
          typeof payload.error === "string"
            ? payload.error
            : `${selectedDefinition.label}运行失败：HTTP ${response.status}`,
        );
      }
      const report = asScenarioReport(await response.json());
      if (report === null || !matchesDefinition(report, selectedDefinition)) {
        throw new Error(`${selectedDefinition.label}返回了无效的服务端报告`);
      }
      setReports((current) => ({ ...current, [focusedScenario]: report }));
      for (let index = 0; index < report.steps.length; index += 1) {
        setActiveStepIndex(index);
        await wait(300);
      }
      setActiveStepIndex(-1);
      setClosing(true);
      await wait(520);
      setClosing(false);
      await onCompleted?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "动态闭环运行失败");
      setActiveStepIndex(-1);
      setClosing(false);
    } finally {
      setRunning(false);
    }
  };

  const renderedSteps = useMemo(() => {
    if (selectedRequest === undefined) return selectedDefinition.steps;
    const report = selectedReport;
    if (report !== null && report !== undefined) {
      return report.steps.map((step) => ({ id: step.id, label: step.title, copy: step.detail }));
    }
    return plannedSteps(selectedDefinition, selectedRequest);
  }, [selectedDefinition, selectedReport, selectedRequest]);

  const routeNodes = useMemo<RouteNode[]>(() => {
    const request = selectedRequest ?? { trigger: "ui", protocolMode: "auto", parameters: {} };
    const entry = selectedEntry;
    const sequence: RenderedStep[] = [
      {
        id: "discover",
        label: "server/discover",
        copy: entry === undefined
          ? "正在读取服务端能力"
          : `${entry.discovery.tools.length} Tools · ${entry.discovery.extensions.length} Extensions`,
      },
      {
        id: "route",
        label: `${selectedDefinition.label}条件路由`,
        copy: conditionSummary(selectedDefinition, request),
      },
      ...renderedSteps,
    ];
    return sequence.map((step, index) => {
      const result = selectedReport?.steps.find((item) => item.id === step.id);
      const isRoute = step.id === "route";
      const isDiscover = step.id === "discover";
      return {
        id: step.id,
        type: "route",
        position: routePosition(index, sequence.length, compact),
        data: {
          index: String(index).padStart(2, "0"),
          eyebrow: isDiscover ? "LIVE CAPABILITIES" : isRoute ? "IF / THEN ROUTER" : "SERVER EVIDENCE",
          label: step.label,
          copy: result?.detail ?? step.copy,
          state: nodeState(step.id, selectedReport, activeStepIndex, renderedSteps, running),
          view: "v2",
          selected: isRoute,
          compact,
          tags: isRoute
            ? selectedDefinition.features.map((feature) => feature.tag)
            : result?.evidence.slice(0, 2) ?? [],
        },
      };
    });
  }, [
    activeStepIndex,
    compact,
    renderedSteps,
    running,
    selectedDefinition,
    selectedEntry,
    selectedReport,
    selectedRequest,
  ]);

  const routeEdges = useMemo<Edge[]>(() => {
    const sequence = routeNodes.map((node) => node.id);
    const edges: Edge[] = [];

    if (selectedDefinition.id === "protocol" && sequence.includes("protocol.modern") && sequence.includes("protocol.legacy")) {
      const beforeBranches = ["discover", "route"];
      edges.push({
        id: "discover-route",
        source: beforeBranches[0]!,
        target: beforeBranches[1]!,
        label: "发现能力",
      });
      edges.push(
        { id: "route-modern", source: "route", target: "protocol.modern", label: "mode ≠ legacy" },
        { id: "route-legacy", source: "route", target: "protocol.legacy", label: "mode ≠ modern" },
        { id: "modern-framing", source: "protocol.modern", target: "protocol.framing" },
        { id: "legacy-framing", source: "protocol.legacy", target: "protocol.framing" },
      );
      const tail = ["protocol.framing", "protocol.boundary", "protocol.verdict", "discover"];
      for (let index = 0; index < tail.length - 1; index += 1) {
        edges.push({ id: `${tail[index]}-${tail[index + 1]}`, source: tail[index]!, target: tail[index + 1]! });
      }
    } else {
      const closed = [...sequence, "discover"];
      for (let index = 0; index < closed.length - 1; index += 1) {
        edges.push({
          id: `${closed[index]}-${closed[index + 1]}`,
          source: closed[index]!,
          target: closed[index + 1]!,
          ...(index === closed.length - 2 ? { label: "Verdict → rediscover" } : {}),
        });
      }
    }

    return edges.map((edge) => {
      const targetStepIndex = renderedSteps.findIndex((step) => step.id === edge.target);
      const sourceReport = selectedReport?.steps.find((step) => step.id === edge.source);
      const active = edge.target === "discover"
        ? closing
        : running && (
          edge.target === "route"
            ? activeStepIndex < 0 && !closing
            : targetStepIndex === activeStepIndex
        );
      return {
        ...edge,
        type: "step",
        animated: active,
        className: sourceReport?.status === "failed"
          ? "master-edge-failed"
          : sourceReport?.status === "skipped"
            ? "master-edge-skipped"
            : active
              ? "master-edge-running"
              : selectedReport !== null && selectedReport !== undefined
                ? "master-edge-passed"
                : "master-edge-idle",
        markerEnd: { type: MarkerType.ArrowClosed },
      };
    });
  }, [activeStepIndex, closing, renderedSteps, routeNodes, running, selectedDefinition.id, selectedReport]);

  const oldNodes = useMemo<RouteNode[]>(() => [
    ["OLD 01", "STATIC CONFIG", "客户端写死能力", "预设版本、方法与调用顺序"],
    ["OLD 02", "SESSION SETUP", "初始化与会话", "连接期协商后保存服务端状态"],
    ["OLD 03", "SINGLE PATH", "固定调用路径", "条件变化依赖客户端重新编排"],
    ["OLD 04", "CLIENT RESULT", "客户端解释结果", "没有 server/discover 驱动的再路由"],
  ].map(([index, eyebrow, label, copy], nodeIndex) => ({
    id: `old-${nodeIndex}`,
    type: "route" as const,
    position: oldPosition(nodeIndex, compact),
    data: {
      index: index!,
      eyebrow: eyebrow!,
      label: label!,
      copy: copy!,
      state: "idle" as const,
      view: "old" as const,
      selected: false,
      compact,
      tags: [],
    },
  })), [compact]);

  const oldEdges = useMemo<Edge[]>(() => oldNodes.slice(0, -1).map((node, index) => ({
    id: `${node.id}-${oldNodes[index + 1]!.id}`,
    source: node.id,
    target: oldNodes[index + 1]!.id,
    type: "step",
    className: "master-edge-old",
    markerEnd: { type: MarkerType.ArrowClosed },
  })), [oldNodes]);

  const selectedEvidence = selectedReport === null
    ? []
    : [...selectedReport.steps].reverse().flatMap((step) => step.evidence).slice(0, 3);
  const updateSelectedField = (field: ScenarioEntryField, value: ScenarioEntryValue) => {
    if (selectedRequest === undefined) return;
    setReports((current) => ({ ...current, [focusedScenario]: null }));
    setRequests((current) => ({
      ...current,
      [focusedScenario]: updateField(selectedRequest, field, value),
    }));
  };

  return (
    <section className="master-flow" data-testid="master-workflow">
      <header className="master-flow-toolbar">
        <div className="master-flow-title">
          <p>CAPABILITY-DRIVEN ROUTING</p>
          <h1>MCP v2 动态路由</h1>
          <span>验证路线（不是固定协议生命周期）：发现 → 条件选路 → 命中节点 → Verdict</span>
        </div>
        <div className="master-flow-controls">
          <div className="master-version-switch" role="group" aria-label="切换 React Flow 版本路径">
            <button type="button" aria-pressed={flowView === "old"} onClick={() => setFlowView("old")}>
              老版本
            </button>
            <button type="button" aria-pressed={flowView === "v2"} onClick={() => setFlowView("v2")}>
              v2 动态路由
            </button>
          </div>
          <Button
            variant="outline"
            aria-label="刷新动态入口"
            disabled={running || refreshing}
            onClick={() => void refresh()}
          >
            <RefreshCwIcon data-icon="inline-start" />
            <span className="hidden sm:inline">{refreshing ? "发现中…" : "刷新"}</span>
          </Button>
          <Button
            aria-label={flowView === "old" ? "老版本仅作概念对照" : "运行当前动态闭环"}
            disabled={flowView === "old" || running || refreshing || selectedEntry === undefined}
            onClick={() => void run()}
          >
            {flowView === "old" ? <GitBranchIcon data-icon="inline-start" /> : <PlayIcon data-icon="inline-start" />}
            {flowView === "old" ? "老版本仅对照" : running ? "流转中…" : "运行当前闭环"}
          </Button>
        </div>
      </header>

      {flowView === "v2" && selectedEntry !== undefined && selectedRequest !== undefined && (
        <div className="route-condition-bar" aria-label="当前动态路由条件">
          <span className="route-condition-prefix">IF</span>
          {selectedEntry.fields
            .filter((field) => field.binding !== "protocolMode" || selectedDefinition.id === "protocol")
            .map((field) => (
            <label key={field.key}>
              <small>{field.label}</small>
              {field.control === "select" && (
                <select
                  aria-label={field.label}
                  value={String(fieldValue(selectedRequest, field))}
                  disabled={running}
                  onChange={(event) => updateSelectedField(field, event.target.value)}
                >
                  {field.options?.map((option) => (
                    <option key={String(option.value)} value={String(option.value)}>{option.label}</option>
                  ))}
                </select>
              )}
              {field.control === "text" && (
                <input
                  aria-label={field.label}
                  type="text"
                  value={String(fieldValue(selectedRequest, field))}
                  disabled={running}
                  onChange={(event) => updateSelectedField(field, event.target.value)}
                />
              )}
              {field.control === "boolean" && (
                <select
                  aria-label={field.label}
                  value={String(fieldValue(selectedRequest, field))}
                  disabled={running}
                  onChange={(event) => updateSelectedField(field, event.target.value === "true")}
                >
                  <option value="true">开启</option>
                  <option value="false">关闭</option>
                </select>
              )}
            </label>
          ))}
          <span className="route-condition-then">THEN · {renderedSteps.map((step) => step.label).join(" → ")}</span>
        </div>
      )}

      <div className="master-flow-status" role="status" aria-live="polite">
        <span className={`status-dot ${error ? "failed" : running ? "running" : selectedReport?.status ?? "checking"}`} />
        <strong>
          {error
            ?? (selectedReport?.status === "passed"
                ? `${selectedDefinition.label}路线已闭环`
                : running
                  ? `${selectedDefinition.label}路线正在流转`
                : "等待选择条件并运行")}
        </strong>
        <span>
          {flowView === "old"
            ? "概念对照不发送请求；真实 Legacy 请在协议路线选择"
            : selectedRequest === undefined
              ? "正在读取 server/discover"
              : conditionSummary(selectedDefinition, selectedRequest)}
        </span>
      </div>

      <div className="master-canvas" data-testid="master-canvas" data-view={flowView}>
        <ReactFlow<RouteNode, Edge>
          key={`${flowView}-${focusedScenario}-${selectedEntry === undefined ? "loading" : "ready"}-${routeNodes.map((node) => node.id).join(":")}-${compact ? "compact" : "wide"}`}
          nodes={flowView === "v2" ? routeNodes : oldNodes}
          edges={flowView === "v2" ? routeEdges : oldEdges}
          nodeTypes={nodeTypes}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
          onNodeClick={(_, node) => {
            if (flowView !== "v2") return;
            const scenario = SCENARIOS.find((item) => item.steps.some((step) => step.id === node.id));
            if (scenario !== undefined) onFocus(scenario.id);
          }}
          minZoom={0.4}
          maxZoom={1.3}
          fitView
          fitViewOptions={{ padding: compact ? 0.08 : 0.16 }}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>

      {flowView === "v2" && (
        <footer
          className="master-evidence-bar"
          role="contentinfo"
          aria-label={`${selectedDefinition.label}服务端证据`}
        >
          <span className={`status-dot ${selectedReport?.status ?? "checking"}`} />
          <div className="master-evidence-title">
            <small>SCENE {selectedDefinition.scene} · MATCHED ROUTE</small>
            <strong>{selectedDefinition.label}</strong>
          </div>
          <p>
            {selectedReport?.steps.at(-1)?.detail
              ?? `条件命中 ${renderedSteps.length} 个执行节点；未命中节点不会进入实际路线`}
          </p>
          <div className="master-evidence-codes">
            {selectedEvidence.length > 0
              ? selectedEvidence.map((item) => <code key={item}>{item}</code>)
              : <code>{selectedRequest === undefined ? "WAITING DISCOVERY" : conditionSummary(selectedDefinition, selectedRequest)}</code>}
          </div>
          <time>{selectedReport?.runId ?? "NO RUN"}</time>
        </footer>
      )}
    </section>
  );
}
