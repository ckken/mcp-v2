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
  MinusIcon,
  PlayIcon,
  RefreshCwIcon,
  XIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { asScenarioReport, type ScenarioReportView } from "./scenario-report";
import type { ScenarioDefinition } from "./scenarios";

type WorkflowState = "idle" | "queued" | "running" | "passed" | "failed" | "skipped";
type FlowView = "old" | "v2";

type WorkflowNodeData = {
  index: string;
  label: string;
  copy: string;
  state: WorkflowState;
  era: FlowView;
  featured: boolean;
  compact: boolean;
  durationMs?: number;
};

type WorkflowNode = Node<WorkflowNodeData, "workflow">;

const wait = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

function WorkflowNodeCard({ data }: NodeProps<WorkflowNode>) {
  return (
    <article
      className={`scenario-node scenario-node-${data.state} scenario-node-era-${data.era}${data.featured ? " scenario-node-featured" : ""}`}
      aria-label={`${data.label}：${data.state}`}
    >
      <Handle type="target" position={data.compact ? Position.Top : Position.Left} />
      <span className="scenario-node-index">{data.index}</span>
      <span className="scenario-node-copy">
        <strong>{data.label}</strong>
        <small>{data.copy}</small>
      </span>
      <span className="scenario-node-state">
        {data.state === "passed" && <CheckIcon />}
        {data.state === "failed" && <XIcon />}
        {data.state === "skipped" && <MinusIcon />}
        {data.state === "running" && <RefreshCwIcon />}
        {(data.state === "idle" || data.state === "queued") && <CircleIcon />}
      </span>
      {data.durationMs !== undefined && <time>{data.durationMs}ms</time>}
      <Handle type="source" position={data.compact ? Position.Bottom : Position.Right} />
    </article>
  );
}

const nodeTypes = { workflow: WorkflowNodeCard };

function matchesDefinition(report: ScenarioReportView, definition: ScenarioDefinition) {
  return report.scenarioId === definition.id
    && report.route.length === report.steps.length
    && report.steps.every((step, index) => step.id === report.route[index]);
}

function nodePosition(index: number, count: number, compact: boolean) {
  if (compact) {
    return {
      x: index % 2 === 0 ? 46 : 74,
      y: 104 + index * 96,
    };
  }

  const angle = -Math.PI / 2 + (Math.PI * 2 * index) / Math.max(count, 1);
  return {
    x: 420 + Math.cos(angle) * 290,
    y: 205 + Math.sin(angle) * 170,
  };
}

function oldPathPosition(index: number, compact: boolean) {
  if (compact) {
    return {
      x: index % 2 === 0 ? 46 : 74,
      y: 36 + index * 126,
    };
  }

  return {
    x: 76 + index * 278,
    y: index % 2 === 0 ? 146 : 226,
  };
}

function useCompactWorkflow() {
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

function stateLabel(state: WorkflowState) {
  if (state === "passed") return "已通过";
  if (state === "failed") return "失败";
  if (state === "skipped") return "已跳过";
  if (state === "running") return "运行中";
  return "待运行";
}

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

function stepState({
  index,
  report,
  playbackReport,
  activeStepIndex,
  running,
}: {
  index: number;
  report: ScenarioReportView | null;
  playbackReport: ScenarioReportView | null;
  activeStepIndex: number;
  running: boolean;
}): WorkflowState {
  if (report !== null) return report.steps[index]?.status ?? "queued";
  if (!running) return "queued";
  if (index === activeStepIndex) {
    return playbackReport?.steps[index]?.status === "skipped" ? "skipped" : "running";
  }
  if (index < activeStepIndex) return playbackReport?.steps[index]?.status ?? "passed";
  return "queued";
}

export function ScenarioWorkflow({
  definition,
  onRefresh,
  onCompleted,
}: {
  definition: ScenarioDefinition;
  onRefresh?: () => Promise<void>;
  onCompleted?: () => Promise<void>;
}) {
  const [report, setReport] = useState<ScenarioReportView | null>(null);
  const [playbackReport, setPlaybackReport] = useState<ScenarioReportView | null>(null);
  const [activeStepIndex, setActiveStepIndex] = useState(-1);
  const [closing, setClosing] = useState(false);
  const [running, setRunning] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entry, setEntry] = useState<ScenarioEntryDefinition | null>(null);
  const [entryRequest, setEntryRequest] = useState<ScenarioEntryRequest>({
    trigger: "ui",
    protocolMode: "auto",
    parameters: {},
  });
  const [selectedFeatureId, setSelectedFeatureId] = useState(definition.features[0]?.id ?? "");
  const [selectedStepId, setSelectedStepId] = useState(
    definition.features[0]?.stepId ?? definition.steps[0]?.id ?? "",
  );
  const [entryDirty, setEntryDirty] = useState(false);
  const [flowView, setFlowView] = useState<FlowView>("v2");
  const compact = useCompactWorkflow();

  const loadLatest = async () => {
    const response = await fetch(`/api/scenarios/${definition.id}/latest`, {
      headers: { accept: "application/json" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const next = asScenarioReport(await response.json());
    if (next !== null && !matchesDefinition(next, definition)) throw new Error("场景报告与工作流定义不一致");
    return next;
  };

  const loadEntry = async () => {
    const response = await fetch(`/api/scenarios/${definition.id}/entry`, {
      headers: { accept: "application/json" },
    });
    if (!response.ok) throw new Error(`动态入口发现失败：HTTP ${response.status}`);
    const parsed = scenarioEntryDefinitionSchema.safeParse(await response.json());
    if (!parsed.success) throw new Error("动态入口契约无效");
    return parsed.data;
  };

  useEffect(() => {
    let current = true;
    setEntry(null);
    setReport(null);
    setError(null);
    setEntryDirty(false);
    setFlowView("v2");
    setSelectedFeatureId(definition.features[0]?.id ?? "");
    setSelectedStepId(definition.features[0]?.stepId ?? definition.steps[0]?.id ?? "");
    void Promise.all([loadLatest(), loadEntry()])
      .then(([nextReport, nextEntry]) => {
        if (current) {
          setReport(nextReport);
          setEntry(nextEntry);
          setEntryRequest(initializeEntryRequest(nextEntry));
        }
      })
      .catch((cause) => {
        if (current) setError(cause instanceof Error ? cause.message : "场景报告不可用");
      });
    return () => { current = false; };
  }, [definition.id]);

  const run = async () => {
    setFlowView("v2");
    setRunning(true);
    setEntryDirty(false);
    setClosing(false);
    setReport(null);
    setPlaybackReport(null);
    setActiveStepIndex(0);
    setError(null);
    try {
      const response = await fetch(`/api/scenarios/${definition.id}/run`, {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify(entryRequest),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: unknown };
        throw new Error(typeof payload.error === "string" ? payload.error : `HTTP ${response.status}`);
      }
      const next = asScenarioReport(await response.json());
      if (next === null || !matchesDefinition(next, definition)) throw new Error("场景报告格式无效");
      setPlaybackReport(next);
      for (let index = 0; index < next.steps.length; index += 1) {
        setActiveStepIndex(index);
        await wait(220);
      }
      setActiveStepIndex(next.steps.length);
      setClosing(true);
      await wait(420);
      setReport(next);
      setPlaybackReport(null);
      setActiveStepIndex(-1);
      setClosing(false);
      await onCompleted?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "场景运行失败");
      setActiveStepIndex(-1);
      setClosing(false);
    } finally {
      setRunning(false);
    }
  };

  const refreshScene = async () => {
    setRefreshing(true);
    setError(null);
    try {
      const [next, nextEntry] = await Promise.all([
        loadLatest(),
        loadEntry(),
        onRefresh?.() ?? Promise.resolve(),
      ]);
      setReport(next);
      setEntry(nextEntry);
      setEntryRequest(initializeEntryRequest(nextEntry));
      setEntryDirty(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "场景刷新失败");
    } finally {
      setRefreshing(false);
    }
  };

  const updateEntryField = (field: ScenarioEntryField, value: ScenarioEntryValue) => {
    setEntryDirty(true);
    setEntryRequest((current) => {
      if (field.binding === "protocolMode") {
        return { ...current, protocolMode: String(value) as ScenarioEntryRequest["protocolMode"] };
      }
      if (field.binding === "selection") return { ...current, selection: String(value) };
      return {
        ...current,
        parameters: { ...current.parameters, [field.key]: value },
      };
    });
  };

  const entryFieldValue = (field: ScenarioEntryField): ScenarioEntryValue => {
    if (field.binding === "protocolMode") return entryRequest.protocolMode;
    if (field.binding === "selection") return entryRequest.selection ?? field.defaultValue ?? "";
    return entryRequest.parameters[field.key] ?? field.defaultValue ?? "";
  };

  const visibleReport = report ?? playbackReport;
  const renderedSteps = useMemo(() => {
    if (visibleReport !== null) {
      return visibleReport.steps.map((step, index) => ({
        id: step.id,
        label: step.title,
        copy: step.detail,
        position: nodePosition(index, visibleReport.steps.length, compact),
      }));
    }
    return definition.steps.map((step, index) => ({
      ...step,
      position: nodePosition(index, definition.steps.length, compact),
    }));
  }, [compact, definition.steps, visibleReport]);

  const nodes = useMemo<WorkflowNode[]>(() => {
    const readyState: WorkflowState = report?.status
      ?? (closing ? "running" : running ? "idle" : "idle");
    return [
      {
        id: "ready",
        type: "workflow",
        position: compact ? { x: 60, y: 8 } : { x: 20, y: 182 },
        data: {
          index: "00",
          label: closing ? "闭环回流" : "动态入口",
          copy: entry === null
            ? "正在发现 v2 能力"
            : `${entry.discovery.tools.length} Tools · ${entryRequest.protocolMode}`,
          state: readyState,
          era: "v2" as const,
          featured: false,
          compact,
        },
      },
      ...renderedSteps.map((step, index) => {
        const result = (report ?? playbackReport)?.steps.find((item) => item.id === step.id);
        return {
          id: step.id,
          type: "workflow" as const,
          position: step.position,
          data: {
            index: String(index + 1).padStart(2, "0"),
            label: step.label,
            copy: result?.detail ?? step.copy,
            state: stepState({ index, report, playbackReport, activeStepIndex, running }),
            era: "v2" as const,
            featured: selectedStepId === step.id,
            compact,
            ...(result === undefined ? {} : { durationMs: result.durationMs }),
          },
        };
      }),
    ];
  }, [
    activeStepIndex,
    closing,
    compact,
    entry,
    entryRequest.protocolMode,
    playbackReport,
    renderedSteps,
    report,
    running,
    selectedStepId,
  ]);

  const edges = useMemo<Edge[]>(() => {
    const sequence = ["ready", ...renderedSteps.map((step) => step.id), "ready"];
    return sequence.slice(0, -1).map((source, index) => {
      const target = sequence[index + 1] ?? "ready";
      const isClosingEdge = index === sequence.length - 2;
      const visible = report ?? playbackReport;
      const stepStatus = isClosingEdge ? undefined : visible?.steps[index]?.status;
      const active = isClosingEdge
        ? closing
        : running && activeStepIndex === index && stepStatus !== "skipped";
      const completed = report !== null
        || (running && !isClosingEdge && activeStepIndex > index);
      const failed = isClosingEdge
        ? visible?.status === "failed"
        : stepStatus === "failed";
      const skipped = stepStatus === "skipped";
      return {
        id: `${definition.id}-${source}-${target}`,
        source,
        target,
        animated: active,
        className: failed
          ? "scenario-edge-failed"
          : skipped
            ? "scenario-edge-skipped"
          : active
            ? "scenario-edge-running"
            : completed
              ? "scenario-edge-passed"
              : "scenario-edge-idle",
        markerEnd: { type: MarkerType.ArrowClosed },
      };
    });
  }, [activeStepIndex, closing, definition.id, playbackReport, renderedSteps, report, running]);

  useEffect(() => {
    if (activeStepIndex < 0) return;
    const stepId = visibleReport?.steps[activeStepIndex]?.id;
    if (stepId === undefined) return;
    setSelectedStepId(stepId);
    const matchingFeature = definition.features.find((feature) => feature.stepId === stepId);
    if (matchingFeature !== undefined) setSelectedFeatureId(matchingFeature.id);
  }, [activeStepIndex, definition.features, visibleReport]);

  const activeStep = activeStepIndex >= 0 ? visibleReport?.steps[activeStepIndex] : undefined;
  const selectedFeature = definition.features.find((feature) => feature.id === selectedFeatureId)
    ?? definition.features[0];
  const selectedDefinitionStep = definition.steps.find((step) => step.id === selectedStepId);
  const selectedRenderedStep = renderedSteps.find((step) => step.id === selectedStepId);
  const selectedResult = visibleReport?.steps.find((step) => step.id === selectedStepId);
  const selectedState = nodes.find((node) => node.id === selectedStepId)?.data.state
    ?? (visibleReport !== null && selectedDefinitionStep !== undefined ? "skipped" : "queued");
  const selectedEvidence = selectedResult?.evidence ?? [];

  const oldNodes = useMemo<WorkflowNode[]>(() => {
    const oldSteps = [
      {
        id: "old-entry",
        label: "客户端写死入口",
        copy: `预设版本、${definition.label}能力与调用顺序`,
      },
      {
        id: "old-call",
        label: "发起一次请求",
        copy: selectedFeature?.before ?? "调用方自行约定请求语义",
      },
      {
        id: "old-result",
        label: "客户端解释结果",
        copy: `没有 ${selectedFeature?.tag ?? "SERVER EVIDENCE"} 对应的服务端证明`,
      },
      {
        id: "old-stop",
        label: "流程到此结束",
        copy: "无动态恢复、真实路线或服务端 Verdict 闭环",
      },
    ] as const;

    return oldSteps.map((step, index) => ({
      id: step.id,
      type: "workflow" as const,
      position: oldPathPosition(index, compact),
      data: {
        index: `OLD ${index + 1}`,
        label: step.label,
        copy: step.copy,
        state: "idle" as const,
        era: "old" as const,
        featured: index === 1,
        compact,
      },
    }));
  }, [compact, definition.label, selectedFeature]);

  const oldEdges = useMemo<Edge[]>(() => oldNodes.slice(0, -1).map((node, index) => ({
    id: `${definition.id}-${node.id}-${oldNodes[index + 1]!.id}`,
    source: node.id,
    target: oldNodes[index + 1]!.id,
    className: "scenario-edge-old",
    markerEnd: { type: MarkerType.ArrowClosed },
  })), [definition.id, oldNodes]);

  const displayedNodes = flowView === "v2" ? nodes : oldNodes;
  const displayedEdges = flowView === "v2" ? edges : oldEdges;

  const selectFeature = (featureId: string, stepId: string) => {
    setSelectedFeatureId(featureId);
    setSelectedStepId(stepId);
  };

  return (
    <section className="scenario-workflow" data-testid={`scenario-workflow-${definition.id}`}>
      <header className="scenario-workflow-header">
        <div>
          <p>ANIMATED CLOSED LOOP</p>
          <h2>{definition.label}工作流</h2>
          <span>入口由实时 v2 发现结果生成，只更新 Scene {definition.scene}，结束后沿闭环边回流。</span>
        </div>
        <div className="scenario-workflow-actions">
          {definition.id === "codex" && (
            <Button
              aria-label="刷新数据"
              variant="outline"
              disabled={running || refreshing}
              onClick={() => void refreshScene()}
            >
              <RefreshCwIcon data-icon="inline-start" />
              {refreshing ? "正在刷新…" : "刷新数据"}
            </Button>
          )}
          <Button
            aria-label={definition.runLabel}
            disabled={running || refreshing || entry === null}
            onClick={() => void run()}
          >
            <PlayIcon data-icon="inline-start" />
            {running ? "正在运行…" : definition.runLabel}
          </Button>
        </div>
      </header>

      {selectedFeature !== undefined && (
        <section className="scenario-features" aria-label={`${definition.label} v2 新特征`}>
          <div className="scenario-features-heading">
            <div>
              <p>WHAT CHANGED IN V2</p>
              <h3>v2 新特征</h3>
              <span>选择特征，定位到实际路线节点；结论只取自服务端证据。</span>
            </div>
            <Badge variant="outline">{definition.features.length} 个现场特征</Badge>
          </div>
          <div className="scenario-feature-selector" aria-label="选择要查看的新特征">
            {definition.features.map((feature, index) => (
              <button
                key={feature.id}
                type="button"
                aria-pressed={feature.id === selectedFeature.id}
                onClick={() => selectFeature(feature.id, feature.stepId)}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{feature.label}</strong>
                <small>{feature.tag}</small>
              </button>
            ))}
          </div>
          <article className="scenario-feature-story" aria-live="polite">
            <div className="scenario-feature-before">
              <span>过去的问题</span>
              <p>{selectedFeature.before}</p>
            </div>
            <div className="scenario-feature-now">
              <span>v2 当前行为</span>
              <p>{selectedFeature.now}</p>
            </div>
            <div className="scenario-feature-proof">
              <span>服务端证明</span>
              <p>{selectedFeature.proof}</p>
              <code>{selectedFeature.stepId}</code>
            </div>
          </article>
        </section>
      )}

      <section className="scenario-entry" aria-label={`${definition.label}动态入口`}>
        <div className="scenario-entry-heading">
          <div>
            <p>SERVER-DISCOVERED ENTRY</p>
            <h3>动态入口</h3>
            <span>字段来源于当前服务能力，参数只触发本场景的独立闭环。</span>
          </div>
          <div className="scenario-entry-summary">
            <Badge variant="outline">server/discover</Badge>
            <Badge variant="outline">{entry?.discovery.tools.length ?? 0} TOOLS</Badge>
            <Badge variant="outline">{entry?.cache.tools.ttlMs ?? 0}ms CACHE</Badge>
          </div>
        </div>
        {entry === null ? (
          <div className="scenario-entry-loading">正在读取协议、目录和扩展能力…</div>
        ) : (
          <>
            <div className="scenario-entry-fields">
              {entry.fields.map((field) => (
                <label key={field.key} className="scenario-entry-field">
                  <span>
                    <strong>{field.label}</strong>
                    <small>{field.description}</small>
                  </span>
                  {field.control === "select" && (
                    <select
                      aria-label={field.label}
                      value={String(entryFieldValue(field))}
                      disabled={running}
                      onChange={(event) => updateEntryField(field, event.target.value)}
                    >
                      {field.options?.map((entryOption) => (
                        <option key={String(entryOption.value)} value={String(entryOption.value)}>
                          {entryOption.label}
                        </option>
                      ))}
                    </select>
                  )}
                  {field.control === "text" && (
                    <input
                      aria-label={field.label}
                      type="text"
                      maxLength={256}
                      value={String(entryFieldValue(field))}
                      disabled={running}
                      onChange={(event) => updateEntryField(field, event.target.value)}
                    />
                  )}
                  {field.control === "boolean" && (
                    <input
                      aria-label={field.label}
                      type="checkbox"
                      checked={entryFieldValue(field) === true}
                      disabled={running}
                      onChange={(event) => updateEntryField(field, event.target.checked)}
                    />
                  )}
                  <code>{field.source}</code>
                </label>
              ))}
            </div>
            <div className="scenario-entry-contract">
              {(visibleReport?.entry.gates ?? []).map((gate) => (
                <span key={gate.id} className={`scenario-entry-gate ${gate.status}`}>
                  <span className={`status-dot ${gate.status}`} />
                  {gate.label}
                </span>
              ))}
              {visibleReport === null && entry.discovery.extensions.map((extension) => (
                <span key={extension} className="scenario-entry-gate checking">
                  <span className="status-dot checking" />
                  {extension}
                </span>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="scenario-route-explorer" aria-label={`${definition.label}实际路线`}>
        <div className="scenario-route-heading">
          <div>
            <p>ACTUAL SERVER ROUTE</p>
            <h3>实际路线与证据</h3>
          </div>
          <span>
            {entryDirty
              ? "入口已改变 · 等待重新运行"
              : visibleReport !== null
                ? `runId · ${visibleReport.runId}`
                : `${entryRequest.protocolMode} · ${entryRequest.selection ?? "default"}`}
          </span>
        </div>
        <div className="scenario-route-rail" aria-label="选择路线证据节点">
          {renderedSteps.map((step, index) => {
            const state = nodes.find((node) => node.id === step.id)?.data.state ?? "queued";
            return (
              <button
                key={step.id}
                type="button"
                className={selectedStepId === step.id ? "selected" : undefined}
                aria-current={selectedStepId === step.id ? "step" : undefined}
                onClick={() => setSelectedStepId(step.id)}
              >
                <span className={`status-dot ${state}`} />
                <small>{String(index + 1).padStart(2, "0")}</small>
                <strong>{step.label}</strong>
              </button>
            );
          })}
        </div>
        <article className={`scenario-step-inspector ${selectedState}`}>
          <div className="scenario-step-state">
            <span className={`status-dot ${selectedState}`} />
            <small>{stateLabel(selectedState)}</small>
          </div>
          <div className="scenario-step-copy">
            <span>SELECTED EVIDENCE NODE</span>
            <h4>{selectedRenderedStep?.label ?? selectedDefinitionStep?.label ?? "选择路线节点"}</h4>
            <p>
              {selectedResult?.detail
                ?? (visibleReport !== null && selectedDefinitionStep !== undefined
                  ? "当前服务端路线没有经过此节点；入口选择已真实改变运行路径。"
                  : selectedDefinitionStep?.copy ?? "运行场景后查看服务端步骤证据。")}
            </p>
          </div>
          <div className="scenario-step-evidence">
            {selectedEvidence.length > 0
              ? selectedEvidence.map((evidence) => <code key={evidence}>{evidence}</code>)
              : <span>运行后显示 detail、evidence、duration 与 runId</span>}
          </div>
          <time>{selectedResult === undefined ? "—" : `${selectedResult.durationMs}ms`}</time>
        </article>
      </section>

      <section className="scenario-flow-comparison" aria-label={`${definition.label} React Flow 版本对比`}>
        <div className="scenario-flow-comparison-heading">
          <div>
            <p>REACT FLOW VERSION SWITCH</p>
            <h3>老版本与 v2 路径切换</h3>
            <span>直接切换画布结构，观察静态单次调用与动态证据闭环的差别。</span>
          </div>
          <Badge variant={flowView === "v2" ? "secondary" : "outline"}>
            {flowView === "v2" ? "V2 · LIVE" : "OLD · CONCEPT"}
          </Badge>
        </div>
        <div className="scenario-flow-switch" role="group" aria-label="切换 React Flow 版本路径">
          <button
            type="button"
            aria-pressed={flowView === "old"}
            onClick={() => setFlowView("old")}
          >
            <small>OLD FLOW · 概念对照</small>
            <strong>老版本路径</strong>
            <span>静态入口 → 一次请求 → 客户端解释 → 结束</span>
          </button>
          <button
            type="button"
            aria-pressed={flowView === "v2"}
            onClick={() => setFlowView("v2")}
          >
            <small>V2 FLOW · 真实运行</small>
            <strong>v2 真实路径</strong>
            <span>动态发现 → 服务端路线 → 步骤证据 → Verdict 回流</span>
          </button>
        </div>
        <p className="scenario-flow-boundary">
          “老版本路径”只解释交互差异，不发送请求；它不等于本项目可真实运行的 2025-06-18 stateless fallback。
        </p>
      </section>

      <div
        className="scenario-canvas"
        data-testid={`scenario-canvas-${definition.id}`}
        data-view={flowView}
      >
        <ReactFlow<WorkflowNode, Edge>
          key={`${definition.id}-${flowView}-${compact ? "compact" : "wide"}`}
          nodes={displayedNodes}
          edges={displayedEdges}
          nodeTypes={nodeTypes}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
          onNodeClick={(_, node) => {
            if (flowView === "v2" && node.id !== "ready") setSelectedStepId(node.id);
          }}
          minZoom={0.45}
          maxZoom={1.25}
          fitView
          fitViewOptions={{ padding: 0.14 }}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>

      <footer className="scenario-workflow-footer">
        <div className="scenario-live-state">
          <span className={`status-dot ${error !== null ? "failed" : running ? "running" : report?.status ?? "checking"}`} />
          <div>
            <strong>{error ?? activeStep?.title ?? (report === null ? "等待本场景运行" : report.status === "passed" ? "闭环已通过" : "闭环存在异常")}</strong>
            <small>{activeStep?.detail ?? report?.runId ?? "尚无运行记录"}</small>
          </div>
        </div>
        <div className="scenario-workflow-badges">
          <Badge variant="outline">SCENE {definition.scene}</Badge>
          <Badge variant={report?.status === "failed" ? "destructive" : "secondary"}>
            {report === null ? "IDLE" : report.status.toUpperCase()}
          </Badge>
        </div>
      </footer>

      {visibleReport !== null && visibleReport.steps.length > 0 && (
        <div className="scenario-evidence" aria-label={`${definition.label}场景证据`}>
          {visibleReport.steps.map((step) => (
            <article key={step.id}>
              <span className={`status-dot ${step.status}`} />
              <div>
                <strong>{step.title}</strong>
                <p>{step.detail}</p>
                {step.evidence.length > 0 && <code>{step.evidence.join(" · ")}</code>}
              </div>
              <time>{step.durationMs}ms</time>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
