import { useEffect, useMemo, useState, type CSSProperties } from "react";
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

type PlaybackState = "idle" | "queued" | "running" | "passed" | "failed";

type SceneNodeData = {
  group: E2eGroup;
  index: string;
  signal: string;
  copy: string;
  state: PlaybackState;
  selected: boolean;
  passed: number;
  completed: number;
  total: number;
};

type CoreNodeData = {
  state: PlaybackState;
  currentId: string;
  currentTitle: string;
  progress: string;
};

type SceneNode = Node<SceneNodeData, "scene">;
type CoreNode = Node<CoreNodeData, "core">;
type FlowNode = SceneNode | CoreNode;

const scenes: Array<{
  group: E2eGroup;
  index: string;
  signal: string;
  copy: string;
  position: { x: number; y: number };
}> = [
  { group: "Protocol", index: "01", signal: "协议握手", copy: "现代协议与无状态回退", position: { x: 30, y: 36 } },
  { group: "Discovery", index: "02", signal: "能力发现", copy: "工具与资源", position: { x: 400, y: 0 } },
  { group: "Tools", index: "03", signal: "工具调用", copy: "输入与输出", position: { x: 790, y: 56 } },
  { group: "Skills", index: "04", signal: "技能运行", copy: "发现与执行", position: { x: 820, y: 410 } },
  { group: "Verification", index: "05", signal: "验证证据", copy: "确认与拒绝", position: { x: 420, y: 492 } },
  { group: "MCP Apps", index: "06", signal: "界面通信", copy: "资源与元数据", position: { x: 34, y: 404 } },
];

const wait = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

function SceneCard({ data }: NodeProps<SceneNode>) {
  return <article className={`flow-scene flow-scene-${data.state} ${data.selected ? "is-selected" : ""}`} data-scene={data.group}>
    <Handle type="target" position={Position.Left} />
    <button type="button" aria-label={`打开 ${data.group} 场景`}>
      <span className="flow-scene-index">{data.index}</span>
      <span className="flow-scene-copy">
        <small>{data.signal}</small>
        <strong>{data.group}</strong>
        <span>{data.copy}</span>
      </span>
      <span className="flow-scene-score">
        {data.state === "running" ? `${data.completed + 1}/${data.total}` : data.total > 0 ? `${data.passed}/${data.total}` : "待命"}
      </span>
    </button>
    <Handle type="source" position={Position.Right} />
  </article>;
}

function RunnerCore({ data }: NodeProps<CoreNode>) {
  return <article className={`runner-core runner-core-${data.state}`} aria-label="E2E 用例运行器">
    <Handle type="target" position={Position.Left} />
    <div className="runner-rings"><i /><i /><i /></div>
    <div className="runner-scan" />
    <div className="runner-copy">
      <span>实时 E2E 用例流</span>
      <strong>{data.currentId}</strong>
      <p>{data.currentTitle}</p>
      <small>{data.progress}</small>
    </div>
    <Handle type="source" position={Position.Right} />
  </article>;
}

const nodeTypes = { scene: SceneCard, core: RunnerCore };

function visibleCases(report: E2eReportView | null, playbackReport: E2eReportView | null, activeCaseIndex: number) {
  if (report !== null) return report.cases;
  if (playbackReport === null || activeCaseIndex < 0) return [];
  return playbackReport.cases.slice(0, activeCaseIndex);
}

function sceneState(
  group: E2eGroup,
  report: E2eReportView | null,
  playbackReport: E2eReportView | null,
  activeCaseIndex: number,
): PlaybackState {
  if (report !== null) {
    const cases = report.cases.filter((item) => item.group === group);
    return cases.every((item) => item.status === "passed") ? "passed" : "failed";
  }
  if (playbackReport === null) return "queued";
  const active = playbackReport.cases[activeCaseIndex];
  if (active?.group === group) return "running";
  const groupCases = playbackReport.cases.filter((item) => item.group === group);
  const completed = playbackReport.cases.slice(0, activeCaseIndex).filter((item) => item.group === group);
  if (completed.length === 0) return "queued";
  if (completed.length < groupCases.length) return "queued";
  return completed.every((item) => item.status === "passed") ? "passed" : "failed";
}

function ScenarioFlow({
  report,
  playbackReport,
  activeCaseIndex,
  selected,
  onSelect,
}: {
  report: E2eReportView | null;
  playbackReport: E2eReportView | null;
  activeCaseIndex: number;
  selected: E2eGroup;
  onSelect: (group: E2eGroup) => void;
}) {
  const sourceReport = report ?? playbackReport;
  const activeCase = playbackReport?.cases[activeCaseIndex];
  const completed = visibleCases(report, playbackReport, activeCaseIndex);

  const nodes = useMemo<FlowNode[]>(() => {
    const sceneNodes: SceneNode[] = scenes.map((scene) => {
      const cases = sourceReport?.cases.filter((item) => item.group === scene.group) ?? [];
      const completedCases = completed.filter((item) => item.group === scene.group);
      return {
        id: scene.group,
        type: "scene",
        position: scene.position,
        data: {
          group: scene.group,
          index: scene.index,
          signal: scene.signal,
          copy: scene.copy,
          state: sceneState(scene.group, report, playbackReport, activeCaseIndex),
          selected: selected === scene.group,
          passed: completedCases.filter((item) => item.status === "passed").length,
          completed: completedCases.length,
          total: cases.length,
        },
      };
    });
    const coreState: PlaybackState = report?.status
      ?? (playbackReport === null ? "idle" : activeCaseIndex < 0 ? "queued" : "running");
    return [
      ...sceneNodes,
      {
        id: "case-runner",
        type: "core",
        position: { x: 390, y: 212 },
        data: {
          state: coreState,
          currentId: activeCase?.id ?? (report === null ? "等待运行" : "执行完成"),
          currentTitle: activeCase?.title ?? (report === null ? "连接真实 MCP 客户端" : `${report.passed} 条用例已验证`),
          progress: activeCase === undefined ? `${sourceReport?.total ?? "—"} 条用例 · 6 个场景` : `${String(activeCaseIndex + 1).padStart(2, "0")} / ${playbackReport?.total ?? "—"}`,
        },
      },
    ];
  }, [activeCase, activeCaseIndex, completed, playbackReport, report, selected, sourceReport]);

  const edges = useMemo<Edge[]>(() => {
    const sequence = ["case-runner", ...scenes.map((scene) => scene.group), "case-runner"];
    const activeGroupIndex = scenes.findIndex((scene) => scene.group === activeCase?.group);
    return sequence.slice(0, -1).map((source, index) => {
      const target = sequence[index + 1] ?? "case-runner";
      const active = activeGroupIndex >= 0 && (index === activeGroupIndex || index === activeGroupIndex + 1);
      const completedRun = report?.status === "passed";
      return {
        id: `flow-${source}-${target}`,
        source,
        target,
        type: "smoothstep",
        animated: active || completedRun,
        className: active ? "flow-edge-active" : completedRun ? "flow-edge-passed" : "flow-edge-idle",
        markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12 },
      };
    });
  }, [activeCase?.group, report?.status]);

  return <div className="scenario-canvas" data-testid="scenario-flow-canvas">
    <ReactFlow<FlowNode, Edge>
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
    <div className="scenario-coordinate">Streamable HTTP · JSON · 实时报告</div>
  </div>;
}

function caseState(
  item: E2eCaseView,
  index: number,
  report: E2eReportView | null,
  playbackReport: E2eReportView | null,
  activeCaseIndex: number,
): PlaybackState {
  if (report !== null) return item.status;
  if (playbackReport === null) return "queued";
  if (index < activeCaseIndex) return item.status;
  if (index === activeCaseIndex) return "running";
  return "queued";
}

function CasePulse({
  item,
  index,
  state,
}: {
  item: E2eCaseView;
  index: number;
  state: PlaybackState;
}) {
  return <article
    className={`case-pulse case-pulse-${state}`}
    data-testid={`case-pulse-${item.id}`}
    data-state={state}
    style={{ "--case-index": index } as CSSProperties}
  >
    <span>{String(index + 1).padStart(2, "0")}</span>
    <div><strong>{item.id}</strong><small>{item.group}</small></div>
    <i />
  </article>;
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
  const [playbackReport, setPlaybackReport] = useState<E2eReportView | null>(null);
  const [running, setRunning] = useState(false);
  const [activeCaseIndex, setActiveCaseIndex] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<E2eGroup>("Protocol");

  const loadLatest = async () => {
    const response = await fetch("/api/e2e/latest", { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    setReport(asE2eReport(await response.json()));
  };

  const runAll = async () => {
    setRunning(true);
    setReport(null);
    setPlaybackReport(null);
    setActiveCaseIndex(-1);
    setError(null);
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
      if (next === null) throw new Error("E2E 报告格式无效");
      setPlaybackReport(next);
      for (let index = 0; index < next.cases.length; index += 1) {
        const item = next.cases[index];
        if (item === undefined) continue;
        setActiveCaseIndex(index);
        setSelected(item.group);
        await wait(180);
      }
      await wait(180);
      setReport(next);
      setPlaybackReport(null);
      setActiveCaseIndex(-1);
      setSelected(next.cases.find((item) => item.status === "failed")?.group ?? "Protocol");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "E2E 验收失败");
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    void loadLatest().catch((cause) => setError(cause instanceof Error ? cause.message : "E2E 报告不可用"));
  }, []);

  const sourceReport = report ?? playbackReport;
  const selectedCases = report?.cases.filter((item) => item.group === selected) ?? [];
  const selectedMeta = scenes.find((scene) => scene.group === selected) ?? scenes[0]!;
  const elapsed = report === null
    ? 0
    : Math.max(0, new Date(report.finishedAt).getTime() - new Date(report.startedAt).getTime());
  const activeCase = playbackReport?.cases[activeCaseIndex];
  const totalCases = sourceReport?.total ?? 0;

  return <div className="e2e-experience">
    <section className="case-hero">
      <div className="case-hero-copy">
        <p className="flow-overline"><span /> 逐条回放 · 实时验收</p>
        <h2>{totalCases || "全部"} 个用例，<br /><em>逐条看清楚。</em></h2>
        <p>运行后，页面按服务端返回的顺序播放每个结果。没有预设的通过状态，也不会跳过失败项。</p>
        <div className="case-hero-actions">
          <button className="case-run-button" aria-label="运行全部 E2E" disabled={running} onClick={() => void runAll()}>
            <span className="case-run-icon">{running ? "···" : "▶"}</span>
            <span><small>{running ? "正在接收服务端结果" : "真实接口 · 完整链路"}</small>{running ? `正在运行 ${activeCaseIndex < 0 ? "连接" : `${activeCaseIndex + 1}/${totalCases || "—"}`}` : "运行全部用例"}</span>
          </button>
          <span className="case-live-note"><i /> 真实报告<br />逐条呈现</span>
        </div>
      </div>
      <div className="case-hero-visual" aria-label={`${totalCases || "全部"} 条用例动效矩阵`}>
        <div className="case-matrix-core">
          <span>实时</span>
          <strong>{activeCaseIndex < 0 ? totalCases || "—" : String(activeCaseIndex + 1).padStart(2, "0")}</strong>
          <small>E2E 用例</small>
        </div>
        <div className="case-matrix-orbit">
          {Array.from({ length: totalCases }, (_, index) => <i key={index} style={{ "--slot": index, "--case-total": totalCases } as CSSProperties}>{String(index + 1).padStart(2, "0")}</i>)}
        </div>
        <div className="case-radar case-radar-one" />
        <div className="case-radar case-radar-two" />
      </div>
    </section>

    {error !== null && <div className="notice flow-notice" role="alert">E2E 运行失败：{error}</div>}

    <section className="scenario-board">
      <header className="scenario-board-head">
        <div>
          <p className="flow-overline"><span /> 场景链路</p>
          <h3>全链路 E2E 验收</h3>
        </div>
        <div className="flow-legend">
          <span><i className="legend-running" />执行</span>
          <span><i className="legend-passed" />通过</span>
          <span><i className="legend-failed" />异常</span>
        </div>
      </header>
      <ScenarioFlow
        report={report}
        playbackReport={playbackReport}
        activeCaseIndex={activeCaseIndex}
        selected={selected}
        onSelect={setSelected}
      />
    </section>

    {sourceReport !== null && <section className="case-playback" data-testid="case-playback">
      <header>
        <div><p className="flow-overline"><span /> {sourceReport.total} 条用例回放</p><h3>逐条执行轨迹</h3></div>
        <div className="playback-now">
          <span>{activeCaseIndex < 0 ? "已完成" : "运行中"}</span>
          <strong>{activeCase?.id ?? `${sourceReport.passed}/${sourceReport.total}`}</strong>
        </div>
      </header>
      <div className="case-pulse-grid">
        {sourceReport.cases.map((item, index) => <CasePulse
          item={item}
          index={index}
          state={caseState(item, index, report, playbackReport, activeCaseIndex)}
          key={item.id}
        />)}
      </div>
    </section>}

    <nav className="scene-rail" aria-label="E2E 场景切换">
      {scenes.map((scene) => {
        const cases = sourceReport?.cases.filter((item) => item.group === scene.group) ?? [];
        const completed = report === null
          ? cases.filter((item) => {
            const caseIndex = playbackReport?.cases.findIndex((candidate) => candidate.id === item.id) ?? -1;
            return caseIndex >= 0 && caseIndex < activeCaseIndex;
          })
          : cases;
        const passed = completed.filter((item) => item.status === "passed").length;
        return <button className={selected === scene.group ? "active" : ""} key={scene.group} onClick={() => setSelected(scene.group)}>
          <span>{scene.index}</span>
          <strong>{scene.group}</strong>
          <small>{cases.length > 0 ? `${passed}/${cases.length}` : scene.signal}</small>
        </button>;
      })}
    </nav>

    {report === null ? <section className="scene-inspector scene-empty">
      <span className="scene-empty-mark">{running ? "▶" : totalCases || "—"}</span>
      <div>
        <p className="flow-overline"><span /> {running ? "实时回放" : "等待运行"}</p>
        <h3>{running ? activeCase === undefined ? "正在连接真实 MCP Client" : `正在呈现 ${activeCase.id}` : "还没有本轮执行记录"}</h3>
        <p>{running
          ? <>当前仅呈现服务端已经返回的真实用例结果；播放结束后才生成汇总结论。</>
          : <>点击“运行全部用例”，页面会调用真实的 <code>POST /api/e2e/run</code>。</>}</p>
      </div>
    </section> : <>
      <section className={`flow-verdict ${report.status}`} aria-label="E2E summary">
        <div className="flow-verdict-stamp"><span>{report.status === "passed" ? "通过" : "异常"}</span><strong>{report.passed}</strong><small>/ {report.total}</small></div>
        <div>
          <p className="flow-overline"><span /> 最近一次运行</p>
          <h2>{report.status === "passed" ? `${report.total} 个用例全部通过` : `${report.failed} 个用例失败`}</h2>
          <p>{report.runId} · MCP {report.protocolVersion} · {elapsed}ms</p>
        </div>
        <div className="flow-verdict-counters">
          <span><small>场景</small><strong>06</strong></span>
          <span><small>失败</small><strong>{String(report.failed).padStart(2, "0")}</strong></span>
        </div>
      </section>

      <section className="scene-inspector">
        <header>
          <div className="scene-index">{selectedMeta.index}</div>
          <div>
            <p className="flow-overline"><span /> {selectedMeta.signal}</p>
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
