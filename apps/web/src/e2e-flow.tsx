import { useEffect, useMemo, useRef, useState } from "react";
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
import "@xyflow/react/dist/style.css";
import { asE2eReport, type E2eCaseView, type E2eGroup, type E2eReportView } from "./e2e";

type SceneState = "idle" | "queued" | "running" | "passed" | "failed";

type SceneNodeData = {
  group: E2eGroup;
  index: string;
  signal: string;
  copy: string;
  state: SceneState;
  selected: boolean;
  passed: number;
  total: number;
};

type FoxNodeData = {
  state: SceneState;
  score: string;
};

type SceneNode = Node<SceneNodeData, "scene">;
type FoxNode = Node<FoxNodeData, "fox">;
type TrailNode = SceneNode | FoxNode;

const scenes: Array<{
  group: E2eGroup;
  index: string;
  signal: string;
  copy: string;
  position: { x: number; y: number };
}> = [
  { group: "Protocol", index: "01", signal: "HANDSHAKE", copy: "Modern + stateless", position: { x: 30, y: 36 } },
  { group: "Discovery", index: "02", signal: "RADAR", copy: "Tools + resource", position: { x: 400, y: 0 } },
  { group: "Tools", index: "03", signal: "TOOL CALL", copy: "Inputs + outputs", position: { x: 790, y: 56 } },
  { group: "Skills", index: "04", signal: "SKILL RUN", copy: "Discover + execute", position: { x: 820, y: 410 } },
  { group: "Verification", index: "05", signal: "EVIDENCE", copy: "Confirm + reject", position: { x: 420, y: 492 } },
  { group: "MCP Apps", index: "06", signal: "UI BRIDGE", copy: "Resource + metadata", position: { x: 34, y: 404 } },
];

function SceneCard({ data }: NodeProps<SceneNode>) {
  return <article className={`trail-node trail-node-${data.state} ${data.selected ? "is-selected" : ""}`} data-scene={data.group}>
    <Handle type="target" position={Position.Left} />
    <button type="button" aria-label={`打开 ${data.group} 场景`}>
      <span className="trail-node-index">{data.index}</span>
      <span className="trail-node-copy">
        <small>{data.signal}</small>
        <strong>{data.group}</strong>
        <span>{data.copy}</span>
      </span>
      <span className="trail-node-score">{data.state === "running" ? "巡检中" : data.total > 0 ? `${data.passed}/${data.total}` : "待命"}</span>
    </button>
    <Handle type="source" position={Position.Right} />
  </article>;
}

function FoxCore({ data }: NodeProps<FoxNode>) {
  return <article className={`fox-core fox-core-${data.state}`} aria-label="Kenvo fox E2E runner">
    <Handle type="target" position={Position.Left} />
    <div className="fox-core-image"><img src="/agent-skills-fox.webp" alt="" /></div>
    <div className="fox-core-scan" />
    <div className="fox-core-caption">
      <span>KENVO // FOX RUNNER</span>
      <strong>{data.state === "running" ? "正在夜巡" : data.state === "passed" ? "链路清澈" : data.state === "failed" ? "发现足迹" : "等待出发"}</strong>
      <small>{data.score}</small>
    </div>
    <Handle type="source" position={Position.Right} />
  </article>;
}

const nodeTypes = { scene: SceneCard, fox: FoxCore };

function groupState(
  group: E2eGroup,
  report: E2eReportView | null,
  running: boolean,
  activeScene: number,
): SceneState {
  const index = scenes.findIndex((scene) => scene.group === group);
  if (running) return index === activeScene ? "running" : "queued";
  const cases = report?.cases.filter((item) => item.group === group) ?? [];
  if (cases.length === 0) return "idle";
  return cases.every((item) => item.status === "passed") ? "passed" : "failed";
}

function FoxTrail({
  report,
  running,
  activeScene,
  selected,
  onSelect,
}: {
  report: E2eReportView | null;
  running: boolean;
  activeScene: number;
  selected: E2eGroup;
  onSelect: (group: E2eGroup) => void;
}) {
  const nodes = useMemo<TrailNode[]>(() => {
    const sceneNodes: SceneNode[] = scenes.map((scene) => {
      const cases = report?.cases.filter((item) => item.group === scene.group) ?? [];
      return {
        id: scene.group,
        type: "scene",
        position: scene.position,
        data: {
          group: scene.group,
          index: scene.index,
          signal: scene.signal,
          copy: scene.copy,
          state: groupState(scene.group, report, running, activeScene),
          selected: selected === scene.group,
          passed: cases.filter((item) => item.status === "passed").length,
          total: cases.length,
        },
      };
    });
    const foxState: SceneState = running
      ? "running"
      : report?.status === "passed"
        ? "passed"
        : report?.status === "failed"
          ? "failed"
          : "idle";
    return [
      ...sceneNodes,
      {
        id: "fox-runner",
        type: "fox",
        position: { x: 390, y: 212 },
        data: {
          state: foxState,
          score: report === null ? "6 scenes · 20 live cases" : `${report.passed}/${report.total} verified`,
        },
      },
    ];
  }, [activeScene, report, running, selected]);

  const edges = useMemo<Edge[]>(() => {
    const sequence = ["fox-runner", ...scenes.map((scene) => scene.group), "fox-runner"];
    return sequence.slice(0, -1).map((source, index) => {
      const target = sequence[index + 1] ?? "fox-runner";
      const sourceSceneIndex = index - 1;
      const active = running && (index === 0 ? activeScene === 0 : sourceSceneIndex === activeScene);
      const completed = report?.status === "passed";
      return {
        id: `trail-${source}-${target}`,
        source,
        target,
        type: "smoothstep",
        animated: active || completed,
        className: active ? "trail-edge-active" : completed ? "trail-edge-passed" : "trail-edge-idle",
        markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12 },
      };
    });
  }, [activeScene, report?.status, running]);

  return <div className="trail-canvas" data-testid="fox-trail-canvas">
    <ReactFlow<TrailNode, Edge>
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      nodesDraggable={false}
      nodesConnectable={false}
      minZoom={0.25}
      maxZoom={1.4}
      fitView
      fitViewOptions={{ padding: 0.09 }}
      onNodeClick={(_, node) => {
        if (node.type === "scene") onSelect(node.id as E2eGroup);
      }}
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="rgba(112, 179, 255, .17)" />
      <Controls showInteractive={false} position="bottom-right" />
    </ReactFlow>
    <div className="trail-coordinate">STREAMABLE HTTP // JSON ONLY</div>
  </div>;
}

function CaseItem({ item }: { item: E2eCaseView }) {
  return <article className={`scene-case ${item.status}`} data-testid={`e2e-case-${item.id}`}>
    <div className="scene-case-top">
      <span className={`scene-case-status ${item.status}`} />
      <strong>{item.title}</strong>
      <time>{item.durationMs}ms</time>
    </div>
    <code>{item.id}</code>
    <p>{item.detail}</p>
    {item.evidence.length > 0 && <div className="scene-evidence">{item.evidence.map((value) => <span key={value}>{value}</span>)}</div>}
  </article>;
}

export function E2eFlowLab() {
  const [report, setReport] = useState<E2eReportView | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<E2eGroup>("Protocol");
  const [activeScene, setActiveScene] = useState(-1);
  const patrolTimer = useRef<number | null>(null);

  const stopPatrol = () => {
    if (patrolTimer.current !== null) window.clearInterval(patrolTimer.current);
    patrolTimer.current = null;
  };

  const loadLatest = async () => {
    const response = await fetch("/api/e2e/latest", { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    setReport(asE2eReport(await response.json()));
  };

  const runAll = async () => {
    const patrolStartedAt = performance.now();
    stopPatrol();
    setRunning(true);
    setActiveScene(0);
    setError(null);
    patrolTimer.current = window.setInterval(() => {
      setActiveScene((current) => (current + 1) % scenes.length);
    }, 420);
    try {
      const response = await fetch("/api/e2e/run", {
        method: "POST",
        headers: { accept: "application/json" },
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: unknown };
        throw new Error(typeof payload.error === "string" ? payload.error : `HTTP ${response.status}`);
      }
      const next = asE2eReport(await response.json());
      if (next === null) throw new Error("E2E report contract is invalid");
      const remainingPatrolMs = Math.max(0, 2_520 - (performance.now() - patrolStartedAt));
      if (remainingPatrolMs > 0) await new Promise((resolve) => window.setTimeout(resolve, remainingPatrolMs));
      setReport(next);
      setSelected(next.cases.find((item) => item.status === "failed")?.group ?? "Protocol");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "E2E suite failed");
    } finally {
      stopPatrol();
      setActiveScene(-1);
      setRunning(false);
    }
  };

  useEffect(() => {
    void loadLatest().catch((cause) => setError(cause instanceof Error ? cause.message : "E2E report unavailable"));
    return stopPatrol;
  }, []);

  const selectedCases = report?.cases.filter((item) => item.group === selected) ?? [];
  const selectedMeta = scenes.find((scene) => scene.group === selected) ?? scenes[0]!;
  const elapsed = report === null
    ? 0
    : Math.max(0, new Date(report.finishedAt).getTime() - new Date(report.startedAt).getTime());

  return <div className="e2e-experience">
    <section className="fox-hero">
      <div className="fox-hero-copy">
        <p className="fox-overline"><span /> FOX TRAIL // LIVE ACCEPTANCE</p>
        <h2>让狐狸真的跑完<br /><em>每一段 MCP 链路</em></h2>
        <p>六个场景岛、二十条真实用例。不是播放预设结果，而是把 modern、legacy、Tool、Skill 与 MCP App 的现场证据送回这张巡检地图。</p>
        <div className="fox-hero-actions">
          <button className="fox-run-button" aria-label="运行全部 E2E" disabled={running} onClick={() => void runAll()}>
            <span className="fox-run-icon">{running ? "···" : "↗"}</span>
            <span><small>{running ? "FOX IS ON THE TRAIL" : "RELEASE THE FOX"}</small>{running ? "正在穿越场景…" : "释放狐狸 · RUN 20"}</span>
          </button>
          <span className="fox-live-note"><i /> REAL SERVER<br />NO MOCK PASS</span>
        </div>
      </div>
      <div className="fox-hero-art" aria-label="Kenvo Agent Skills fox">
        <img src="/agent-skills-fox.webp" alt="Kenvo Agent Skills 狐狸 IP" />
        <div className="fox-orbit fox-orbit-one" />
        <div className="fox-orbit fox-orbit-two" />
        <span className="fox-tag fox-tag-one">MCP / 2026</span>
        <span className="fox-tag fox-tag-two">20 LIVE CASES</span>
      </div>
    </section>

    {error !== null && <div className="notice fox-notice" role="alert">E2E 运行失败：{error}</div>}

    <section className="trail-board">
      <header className="trail-board-head">
        <div>
          <p className="fox-overline"><span /> SCENARIO MAP</p>
          <h3>全链路 E2E 验收</h3>
        </div>
        <div className="trail-legend">
          <span><i className="legend-running" />巡检</span>
          <span><i className="legend-passed" />通过</span>
          <span><i className="legend-failed" />异常</span>
        </div>
      </header>
      <FoxTrail report={report} running={running} activeScene={activeScene} selected={selected} onSelect={setSelected} />
    </section>

    <nav className="scene-rail" aria-label="E2E 场景切换">
      {scenes.map((scene) => {
        const cases = report?.cases.filter((item) => item.group === scene.group) ?? [];
        const passed = cases.filter((item) => item.status === "passed").length;
        return <button className={selected === scene.group ? "active" : ""} key={scene.group} onClick={() => setSelected(scene.group)}>
          <span>{scene.index}</span>
          <strong>{scene.group}</strong>
          <small>{cases.length > 0 ? `${passed}/${cases.length}` : scene.signal}</small>
        </button>;
      })}
    </nav>

    {report === null || running ? <section className="scene-inspector scene-empty">
      <span className="scene-empty-mark">{running ? "巡" : "狐"}</span>
      <div>
        <p className="fox-overline"><span /> {running ? "LIVE PATROL" : "WAITING AT BASE"}</p>
        <h3>{running ? "狐狸正在穿越六个场景" : "还没有巡检记录"}</h3>
        <p>{running
          ? <>上轮结果已暂时收起；真实报告到达前不会显示新的 PASS。</>
          : <>点击“释放狐狸”，页面会调用真实的 <code>POST /api/e2e/run</code>。服务端返回前不会点亮任何通过状态。</>}</p>
      </div>
    </section> : <>
      <section className={`fox-verdict ${report.status}`} aria-label="E2E summary">
        <div className="fox-verdict-stamp"><span>{report.status === "passed" ? "CLEAR" : "ALERT"}</span><strong>{report.passed}</strong><small>/ {report.total}</small></div>
        <div>
          <p className="fox-overline"><span /> LATEST RUN</p>
          <h2>{report.status === "passed" ? `${report.total} 个用例全部通过` : `${report.failed} 个用例失败`}</h2>
          <p>{report.runId} · MCP {report.protocolVersion} · {elapsed}ms</p>
        </div>
        <div className="fox-verdict-counters">
          <span><small>SCENES</small><strong>06</strong></span>
          <span><small>FAILED</small><strong>{String(report.failed).padStart(2, "0")}</strong></span>
        </div>
      </section>

      <section className="scene-inspector">
        <header>
          <div className="scene-index">{selectedMeta.index}</div>
          <div>
            <p className="fox-overline"><span /> {selectedMeta.signal}</p>
            <h3>{selected}</h3>
            <p>{selectedMeta.copy} 的真实执行证据</p>
          </div>
          <div className="scene-score"><strong>{selectedCases.filter((item) => item.status === "passed").length}</strong><span>/ {selectedCases.length}</span></div>
        </header>
        <div className="scene-case-grid">{selectedCases.map((item) => <CaseItem item={item} key={item.id} />)}</div>
      </section>
    </>}
  </div>;
}
