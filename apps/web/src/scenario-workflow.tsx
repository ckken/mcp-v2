import { useEffect, useMemo, useState } from "react";
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

type WorkflowNodeData = {
  index: string;
  label: string;
  copy: string;
  state: WorkflowState;
  durationMs?: number;
};

type WorkflowNode = Node<WorkflowNodeData, "workflow">;

const wait = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

function WorkflowNodeCard({ data }: NodeProps<WorkflowNode>) {
  return (
    <article className={`scenario-node scenario-node-${data.state}`}>
      <Handle type="target" position={Position.Left} />
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
      <Handle type="source" position={Position.Right} />
    </article>
  );
}

const nodeTypes = { workflow: WorkflowNodeCard };

function matchesDefinition(report: ScenarioReportView, definition: ScenarioDefinition) {
  return report.scenarioId === definition.id
    && report.steps.length === definition.steps.length
    && report.steps.every((step, index) => step.id === definition.steps[index]?.id);
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

  const loadLatest = async () => {
    const response = await fetch(`/api/scenarios/${definition.id}/latest`, {
      headers: { accept: "application/json" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const next = asScenarioReport(await response.json());
    if (next !== null && !matchesDefinition(next, definition)) throw new Error("场景报告与工作流定义不一致");
    return next;
  };

  useEffect(() => {
    let current = true;
    void loadLatest()
      .then((next) => {
        if (current) setReport(next);
      })
      .catch((cause) => {
        if (current) setError(cause instanceof Error ? cause.message : "场景报告不可用");
      });
    return () => { current = false; };
  }, [definition.id]);

  const run = async () => {
    setRunning(true);
    setClosing(false);
    setReport(null);
    setPlaybackReport(null);
    setActiveStepIndex(0);
    setError(null);
    try {
      const response = await fetch(`/api/scenarios/${definition.id}/run`, {
        method: "POST",
        headers: { accept: "application/json" },
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
      const [next] = await Promise.all([loadLatest(), onRefresh?.() ?? Promise.resolve()]);
      setReport(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "场景刷新失败");
    } finally {
      setRefreshing(false);
    }
  };

  const nodes = useMemo<WorkflowNode[]>(() => {
    const readyState: WorkflowState = report?.status
      ?? (closing ? "running" : running ? "idle" : "idle");
    return [
      {
        id: "ready",
        type: "workflow",
        position: { x: 20, y: 182 },
        data: {
          index: "00",
          label: closing ? "闭环回流" : "Ready",
          copy: report === null ? "等待本场景触发" : `最近结果 ${report.status}`,
          state: readyState,
        },
      },
      ...definition.steps.map((step, index) => {
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
            ...(result === undefined ? {} : { durationMs: result.durationMs }),
          },
        };
      }),
    ];
  }, [activeStepIndex, closing, definition.steps, playbackReport, report, running]);

  const edges = useMemo<Edge[]>(() => {
    const sequence = ["ready", ...definition.steps.map((step) => step.id), "ready"];
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
  }, [activeStepIndex, closing, definition.id, definition.steps, playbackReport, report, running]);

  const visibleReport = report ?? playbackReport;
  const activeStep = activeStepIndex >= 0 ? visibleReport?.steps[activeStepIndex] : undefined;

  return (
    <section className="scenario-workflow" data-testid={`scenario-workflow-${definition.id}`}>
      <header className="scenario-workflow-header">
        <div>
          <p>ANIMATED CLOSED LOOP</p>
          <h2>{definition.label}工作流</h2>
          <span>每次运行只更新 Scene {definition.scene}，结束后沿闭环边返回 Ready。</span>
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
            disabled={running || refreshing}
            onClick={() => void run()}
          >
            <PlayIcon data-icon="inline-start" />
            {running ? "正在运行…" : definition.runLabel}
          </Button>
        </div>
      </header>

      <div className="scenario-canvas" data-testid={`scenario-canvas-${definition.id}`}>
        <ReactFlow<WorkflowNode, Edge>
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
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
