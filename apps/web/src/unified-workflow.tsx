import { useEffect, useMemo, useState } from "react";
import {
  scenarioEntryDefinitionSchema,
  type ScenarioEntryDefinition,
  type ScenarioEntryRequest,
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
  PlayIcon,
  RefreshCwIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { asScenarioReport, type ScenarioId, type ScenarioReportView } from "./scenario-report";
import { SCENARIOS, type ScenarioDefinition } from "./scenarios";

type FlowView = "old" | "v2";
type FlowState = "idle" | "running" | "passed" | "failed";

type MasterNodeData = {
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

type MasterNode = Node<MasterNodeData, "master">;
type EntryMap = Partial<Record<ScenarioId, ScenarioEntryDefinition>>;
type ReportMap = Partial<Record<ScenarioId, ScenarioReportView | null>>;

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

function v2Position(index: number, count: number, compact: boolean) {
  if (compact) return { x: 42, y: 42 + index * 126 };
  const angle = -Math.PI / 2 + (Math.PI * 2 * index) / count;
  return {
    x: 425 + Math.cos(angle) * 335,
    y: 248 + Math.sin(angle) * 205,
  };
}

function oldPosition(index: number, compact: boolean) {
  if (compact) return { x: 42, y: 56 + index * 164 };
  return { x: 54 + index * 292, y: index % 2 === 0 ? 192 : 278 };
}

function MasterNodeCard({ data }: NodeProps<MasterNode>) {
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
        {data.state === "idle" && <CircleIcon />}
      </span>
      <Handle type="source" position={data.compact ? Position.Bottom : Position.Right} />
    </article>
  );
}

const nodeTypes = { master: MasterNodeCard };

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
  const [reports, setReports] = useState<ReportMap>({});
  const [activeIndex, setActiveIndex] = useState(-1);
  const [closing, setClosing] = useState(false);
  const [running, setRunning] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      const discovered = await Promise.all(SCENARIOS.map(async (definition) => {
        const [entry, report] = await Promise.all([readEntry(definition), readLatest(definition)]);
        return { id: definition.id, entry, report };
      }));
      setEntries(Object.fromEntries(discovered.map(({ id, entry }) => [id, entry])) as EntryMap);
      setReports(Object.fromEntries(discovered.map(({ id, report }) => [id, report])) as ReportMap);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "主流程发现失败");
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const run = async () => {
    setFlowView("v2");
    setRunning(true);
    setClosing(false);
    setError(null);
    setReports({});

    try {
      for (const [index, definition] of SCENARIOS.entries()) {
        const entry = entries[definition.id] ?? await readEntry(definition);
        setEntries((current) => ({ ...current, [definition.id]: entry }));
        setActiveIndex(index);
        onFocus(definition.id);

        const response = await fetch(`/api/scenarios/${definition.id}/run`, {
          method: "POST",
          headers: { accept: "application/json", "content-type": "application/json" },
          body: JSON.stringify(initializeEntryRequest(entry)),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({})) as { error?: unknown };
          throw new Error(
            typeof payload.error === "string"
              ? `${definition.label}：${payload.error}`
              : `${definition.label}运行失败：HTTP ${response.status}`,
          );
        }

        const report = asScenarioReport(await response.json());
        if (report === null || !matchesDefinition(report, definition)) {
          throw new Error(`${definition.label}返回了无效的服务端报告`);
        }
        setReports((current) => ({ ...current, [definition.id]: report }));
        await wait(420);
      }

      setActiveIndex(-1);
      setClosing(true);
      await wait(620);
      setClosing(false);
      await onCompleted?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "完整闭环运行失败");
      setActiveIndex(-1);
      setClosing(false);
    } finally {
      setRunning(false);
    }
  };

  const nodes = useMemo<MasterNode[]>(() => SCENARIOS.map((definition, index) => {
    const report = reports[definition.id];
    const entry = entries[definition.id];
    const state: FlowState = activeIndex === index
      ? "running"
      : report?.status === "passed"
        ? "passed"
        : report?.status === "failed"
          ? "failed"
          : "idle";
    const lastStep = report?.steps.at(-1);
    return {
      id: definition.id,
      type: "master",
      position: v2Position(index, SCENARIOS.length, compact),
      data: {
        index: definition.scene,
        eyebrow: index === 0 ? "SERVER DISCOVERY" : "SERVER ROUTE",
        label: definition.label,
        copy: activeIndex === index
          ? "服务端路线正在流转…"
          : lastStep?.detail
            ?? `${entry?.discovery.tools.length ?? "—"} Tools · ${definition.description}`,
        state,
        view: "v2",
        selected: definition.id === focusedScenario,
        compact,
        tags: definition.features.map((feature) => feature.tag),
      },
    };
  }), [activeIndex, compact, entries, focusedScenario, reports]);

  const edges = useMemo<Edge[]>(() => SCENARIOS.map((definition, index) => {
    const target = SCENARIOS[(index + 1) % SCENARIOS.length]!;
    const active = index === SCENARIOS.length - 1 ? closing : activeIndex === index + 1;
    const completed = reports[definition.id]?.status === "passed";
    const failed = reports[definition.id]?.status === "failed";
    return {
      id: `${definition.id}-${target.id}`,
      source: definition.id,
      target: target.id,
      animated: active,
      label: index === SCENARIOS.length - 1 ? "Verdict 回流" : undefined,
      className: failed
        ? "master-edge-failed"
        : active
          ? "master-edge-running"
          : completed
            ? "master-edge-passed"
            : "master-edge-idle",
      markerEnd: { type: MarkerType.ArrowClosed },
    };
  }), [activeIndex, closing, reports]);

  const oldNodes = useMemo<MasterNode[]>(() => [
    ["OLD 01", "STATIC CLIENT", "写死能力入口", "版本与调用顺序由客户端预设"],
    ["OLD 02", "SINGLE REQUEST", "发起一次请求", "没有动态发现与路线协商"],
    ["OLD 03", "CLIENT DECISION", "客户端解释结果", "成功与否取决于本地判断"],
    ["OLD 04", "STOP", "流程结束", "没有服务端 Verdict 回流"],
  ].map(([index, eyebrow, label, copy], nodeIndex) => ({
    id: `old-${nodeIndex}`,
    type: "master" as const,
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
    className: "master-edge-old",
    markerEnd: { type: MarkerType.ArrowClosed },
  })), [oldNodes]);

  const selectedDefinition = SCENARIOS.find((item) => item.id === focusedScenario) ?? SCENARIOS[0]!;
  const selectedReport = reports[selectedDefinition.id];
  const selectedEntry = entries[selectedDefinition.id];
  const selectedEvidence = selectedReport?.steps.flatMap((step) => step.evidence).slice(0, 3) ?? [];
  const allPassed = SCENARIOS.every((definition) => reports[definition.id]?.status === "passed");

  return (
    <section className="master-flow" data-testid="master-workflow">
      <header className="master-flow-toolbar">
        <div className="master-flow-title">
          <p>ONE LIVE CLOSED LOOP</p>
          <h1>MCP v2 主流程</h1>
          <span>动态发现 → 六条服务端路线 → 证据 Verdict → 回流入口</span>
        </div>
        <div className="master-flow-controls">
          <div className="master-version-switch" role="group" aria-label="切换 React Flow 版本路径">
            <button
              type="button"
              aria-pressed={flowView === "old"}
              onClick={() => setFlowView("old")}
            >
              老版本
            </button>
            <button
              type="button"
              aria-pressed={flowView === "v2"}
              onClick={() => setFlowView("v2")}
            >
              v2 实时闭环
            </button>
          </div>
          <Button
            variant="outline"
            aria-label="刷新主流程"
            disabled={running || refreshing}
            onClick={() => void refresh()}
          >
            <RefreshCwIcon data-icon="inline-start" />
            <span className="hidden sm:inline">{refreshing ? "发现中…" : "刷新"}</span>
          </Button>
          <Button
            aria-label="运行完整 v2 闭环"
            disabled={running || refreshing || Object.keys(entries).length !== SCENARIOS.length}
            onClick={() => void run()}
          >
            <PlayIcon data-icon="inline-start" />
            {running ? "流转中…" : "运行完整闭环"}
          </Button>
        </div>
      </header>

      <div className="master-flow-status" role="status" aria-live="polite">
        <span className={`status-dot ${error ? "failed" : running ? "running" : allPassed ? "passed" : "checking"}`} />
        <strong>{error ?? (running ? `${SCENARIOS[activeIndex]?.label ?? "Verdict"}正在流转` : allPassed ? "六条服务端路线已闭环" : "等待运行")}</strong>
        <span>
          {flowView === "old"
            ? "概念对照，不发送请求"
            : allPassed
              ? "结论来自六份服务端报告"
              : "节点状态只读取服务端证据"}
        </span>
      </div>

      <div className="master-canvas" data-testid="master-canvas" data-view={flowView}>
        <ReactFlow<MasterNode, Edge>
          key={`${flowView}-${compact ? "compact" : "wide"}`}
          nodes={flowView === "v2" ? nodes : oldNodes}
          edges={flowView === "v2" ? edges : oldEdges}
          nodeTypes={nodeTypes}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
          onNodeClick={(_, node) => {
            if (flowView === "v2" && SCENARIOS.some((item) => item.id === node.id)) {
              onFocus(node.id as ScenarioId);
            }
          }}
          minZoom={0.42}
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
            <small>SCENE {selectedDefinition.scene} · SERVER EVIDENCE</small>
            <strong>{selectedDefinition.label}</strong>
          </div>
          <p>
            {selectedReport?.steps.at(-1)?.detail
              ?? `${selectedEntry?.discovery.extensions.join(" · ") || "正在发现服务端扩展"} · 点击节点查看对应路线`}
          </p>
          <div className="master-evidence-codes">
            {selectedEvidence.length > 0
              ? selectedEvidence.map((item) => <code key={item}>{item}</code>)
              : selectedDefinition.features.map((feature) => <code key={feature.id}>{feature.tag}</code>)}
          </div>
          <time>{selectedReport?.runId ?? "NO RUN"}</time>
        </footer>
      )}
    </section>
  );
}
