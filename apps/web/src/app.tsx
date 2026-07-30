import { useEffect, useMemo, useRef, useState } from "react";
import { E2eFlowLab } from "./e2e-flow";
import { asRuns, type VerificationRunView } from "./runs";

type Health = "online" | "unavailable" | "checking";
type Page = "Overview" | "E2E Lab" | "Protocol" | "Tools" | "Skills" | "MCP Apps" | "Codex Session";
type Run = VerificationRunView;

const pages: Page[] = ["Overview", "E2E Lab", "Protocol", "Tools", "Skills", "MCP Apps", "Codex Session"];
const pageLabels: Record<Page, string> = {
  Overview: "总览",
  "E2E Lab": "全链路验收",
  Protocol: "协议",
  Tools: "工具",
  Skills: "技能",
  "MCP Apps": "MCP 应用",
  "Codex Session": "Codex 会话",
};
const protocolRows = [
  ["server/discover", "发现服务端能力", "必需"],
  ["request envelope", "每次请求都携带协议版本", "必需"],
  ["modern response", "2026 版本返回 application/json", "必需"],
  ["legacy fallback", "2025 版本的无状态 POST 使用 SSE 帧", "已启用"],
  ["SSE endpoint", "不提供独立的旧版 SSE 端点", "已关闭"],
  ["prompts/list + get", "2 个原生 Prompt，modern 与 legacy 可用", "已启用"],
  ["tasks.* tools", "应用级创建、轮询、列表、取消和结果", "已启用"],
  ["bearer auth", "配置 Token 后启用 scope 校验", "可配置"],
];
const demoTools = [
  "system.health",
  "orders.search",
  "orders.dashboard",
  "skills.discover",
  "skills.run",
  "verification.start",
  "verification.status",
  "verification.finish",
  "tasks.create",
  "tasks.status",
  "tasks.list",
  "tasks.cancel",
  "tasks.result",
];
const demoSkills = ["skills.discover", "skills.run"];

export function App() {
  const [page, setPage] = useState<Page>("Overview");
  const [health, setHealth] = useState<Health>("checking");
  const [runs, setRuns] = useState<Run[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const [statusResult, runsResult] = await Promise.allSettled([
        fetch("/api/status", { headers: { accept: "application/json" } }),
        fetch("/api/verification/runs", { headers: { accept: "application/json" } }),
      ]);
      setHealth(statusResult.status === "fulfilled" && statusResult.value.ok ? "online" : "unavailable");
      if (runsResult.status === "fulfilled" && runsResult.value.ok) setRuns(asRuns(await runsResult.value.json()));
      else setRuns([]);
    } catch {
      setHealth("unavailable");
      setRuns([]);
    } finally {
      setRefreshing(false);
    }
  };

  const runVerification = async () => {
    setRefreshing(true);
    setRunError(null);
    try {
      const response = await fetch("/api/verification/run", {
        method: "POST",
        headers: { accept: "application/json" },
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: unknown };
        throw new Error(typeof payload.error === "string" ? payload.error : `HTTP ${response.status}`);
      }
      await refresh();
      setPage("Codex Session");
    } catch (error) {
      setRunError(error instanceof Error ? error.message : "会话验证失败");
      setRefreshing(false);
    }
  };

  useEffect(() => { void refresh(); }, []);
  const passed = useMemo(() => runs.filter((run) => run.status === "passed").length, [runs]);
  const active = useMemo(() => runs.filter((run) => run.status === "running").length, [runs]);

  return <main className="shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">M</span><span>MCP v2 实验室</span></div>
      <nav aria-label="验证页面">{pages.map((item) => <button className={page === item ? "nav active" : "nav"} key={item} onClick={() => setPage(item)}>{pageLabels[item]}</button>)}</nav>
      <div className="side-foot"><span className={`dot ${health}`} /> {health === "online" ? "服务已连接" : health === "checking" ? "正在连接" : "服务不可用"}</div>
    </aside>
    <section className="content">
      <header className="topbar"><div><p className="eyebrow">MCP v2 可视化验证</p><h1>{pageLabels[page]}</h1></div><div className="actions"><button className="ghost" disabled={refreshing} onClick={() => void refresh()}>刷新数据</button><button className="refresh" disabled={refreshing} onClick={() => void runVerification()}>{refreshing ? "正在运行…" : "运行会话验证"}</button></div></header>
      {health === "unavailable" && <div className="notice" role="status">后端没有响应。依赖实时数据的检查不会显示为通过，请启动 MCP 服务后刷新。</div>}
      {runError !== null && <div className="notice" role="alert">会话验证失败：{runError}</div>}
      {page === "Overview" && <Overview health={health} runs={runs} passed={passed} active={active} />}
      {page === "E2E Lab" && <E2eFlowLab />}
      {page === "Protocol" && <Protocol />}
      {page === "Tools" && <Catalog title="工具清单" items={demoTools} endpoint="/api/demo/tools" />}
      {page === "Skills" && <Catalog title="技能清单" items={demoSkills} endpoint="/api/demo/skills" />}
      {page === "MCP Apps" && <McpApps />}
      {page === "Codex Session" && <Session runs={runs} />}
    </section>
  </main>;
}

function Overview({ health, runs, passed, active }: { health: Health; runs: Run[]; passed: number; active: number }) {
  return <><section className="hero"><div><p className="eyebrow">实时状态</p><h2>先看清每一条链路，<br />再交给 Agent。</h2><p className="muted">协议、工具、技能、MCP 应用和 Codex 会话都在这里验证。结果来自当前服务，不用静态样例冒充通过。</p></div><div className={`health-card ${health}`}><span className="dot"/><strong>{health === "online" ? "服务可以访问" : health === "checking" ? "正在联系服务" : "服务暂时不可用"}</strong><small>{health === "online" ? "/api/status 已响应" : "还没有收到成功响应"}</small></div></section>
  <section className="metrics"><Metric label="验证记录" value={String(runs.length)} /><Metric label="已通过" value={String(passed)} /><Metric label="运行中" value={String(active)} /><Metric label="传输状态" value={health === "online" ? "在线" : "—"} /></section>
  <section className="panel"><div className="panel-head"><div><p className="eyebrow">最近执行</p><h3>会话验证记录</h3></div><span className="subtle">{runs.length ? "实时 API 结果" : "暂无记录"}</span></div>{runs.length ? <div className="run-list">{runs.map((run) => <div className="run" key={run.id}><span className={`status ${run.status}`}/><div><strong>{run.name}</strong><small>{run.id}</small></div><span>{run.finishedAt ?? run.status}</span></div>)}</div> : <Empty text="服务返回 /api/verification/runs 后，执行记录会显示在这里。" />}</section></>;
}

function Metric({ label, value }: { label: string; value: string }) { return <article className="metric"><p>{label}</p><strong>{value}</strong></article>; }
function Empty({ text }: { text: string }) { return <div className="empty">{text}</div>; }

function Protocol() { return <section className="panel"><div className="panel-head"><div><p className="eyebrow">JSON-RPC 生命周期</p><h3>协议检查点</h3></div><span className="badge">MCP</span></div><div className="table">{protocolRows.map(([event, evidence, state]) => <div className="row" key={event}><code>{event}</code><span>{evidence}</span><span className="badge">{state}</span></div>)}</div><p className="muted protocol-note">这里列出预期证据，实际结果以服务端验证记录为准。</p></section>; }

function Catalog({ title, items, endpoint }: { title: string; items: string[]; endpoint: string }) {
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => { let current = true; void fetch(endpoint, { headers: { accept: "application/json" } }).then((response) => { if (current) setAvailable(response.ok); }).catch(() => { if (current) setAvailable(false); }); return () => { current = false; }; }, [endpoint]);
  return <section className="panel"><div className="panel-head"><div><p className="eyebrow">能力发现</p><h3>{title}</h3></div><code>{endpoint}</code></div><div className="catalog">{items.map((item) => <article key={item}><span className="terminal">⌘</span><div><strong>{item}</strong><p>等待服务端返回详细定义</p></div><span className="badge">实验</span></article>)}</div><p className="muted protocol-note">{available === true ? "实验端点已响应，条目仍明确标记为实验数据。" : available === false ? "实验端点不可用，页面没有伪造服务端结果。" : "正在检查实验端点…"}</p></section>;
}

function McpApps() {
  const [app, setApp] = useState<{
    descriptor: { name: string; _meta?: { ui?: { resourceUri?: string } } };
    resource: { uri: string; mimeType?: string; text: string };
    toolResult: { structuredContent?: unknown };
  } | null>(null);
  const [message, setMessage] = useState("正在解析工具与 ui:// 资源…");
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    void fetch("/api/mcp-app", { headers: { accept: "application/json" } })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((payload) => setApp(payload))
      .catch((error) => setMessage(error instanceof Error ? error.message : "MCP App unavailable"));
  }, []);

  useEffect(() => {
    const listener = async (event: MessageEvent<unknown>) => {
      if (event.source !== frameRef.current?.contentWindow || !event.data || typeof event.data !== "object") return;
      const rpc = event.data as { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown };
      if (rpc.jsonrpc !== "2.0" || typeof rpc.method !== "string") return;
      if (rpc.method === "ui/initialize") {
        frameRef.current?.contentWindow?.postMessage({
          jsonrpc: "2.0",
          id: rpc.id,
          result: { protocolVersion: "2026-01-26", hostInfo: { name: "mcp-v2-visual-host", version: "0.1.0" }, hostCapabilities: {} },
        }, "*");
        setMessage("MCP Apps 通信桥已初始化");
      } else if (rpc.method === "ui/notifications/initialized") {
        frameRef.current?.contentWindow?.postMessage({
          jsonrpc: "2.0",
          method: "ui/notifications/tool-result",
          params: app?.toolResult ?? {},
        }, "*");
        setMessage("工具结果已送达 ui:// 资源");
      } else if (rpc.method === "tools/call" && typeof rpc.id === "number") {
        const params = rpc.params as { name?: unknown; arguments?: unknown } | undefined;
        const response = await fetch("/api/mcp-app/call", {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ name: params?.name, arguments: params?.arguments ?? {} }),
        });
        const result = await response.json();
        frameRef.current?.contentWindow?.postMessage(response.ok
          ? { jsonrpc: "2.0", id: rpc.id, result }
          : { jsonrpc: "2.0", id: rpc.id, error: { code: -32000, message: result.error ?? "Tool call failed" } }, "*");
        const args = params?.arguments && typeof params.arguments === "object"
          ? params.arguments as { view?: unknown; status?: unknown }
          : {};
        setMessage(response.ok
          ? `组件已通过宿主调用 orders.dashboard（view=${String(args.view ?? "overview")}，status=${String(args.status ?? "all")}）`
          : "组件调用工具失败");
      }
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [app]);

  return <section className="apps-grid"><div className="panel bridge"><p className="eyebrow">真实 MCP Apps 链路</p><h3>工具关联的沙箱资源</h3><p className="muted">宿主先发现工具元数据，再通过 MCP 读取 ui:// 资源，最后经 JSON-RPC postMessage 把工具结果交给界面。</p><div className="bridge-event"><span className="dot checking"/>{message}</div><code>{app?.descriptor._meta?.ui?.resourceUri ?? "正在解析 ui://"}</code><code>{app?.resource.mimeType ?? "正在解析 MIME"}</code></div>{app && <iframe ref={frameRef} title="MCP App 订单看板" sandbox="allow-scripts" srcDoc={app.resource.text} />}</section>;
}

function Session({ runs }: { runs: Run[] }) {
  const latest = runs[0];
  return <section className="panel"><div className="panel-head"><div><p className="eyebrow">Agent 执行轨迹</p><h3>Codex 会话</h3></div><span className="badge">{latest?.status ?? "只读"}</span></div><div className="timeline"><div><b>01</b><span>发现服务端能力</span></div><div><b>02</b><span>通过真实 MCP 客户端运行限定范围的验证</span></div><div><b>03</b><span>{runs.length ? `已收到 ${runs.length} 条后端执行记录` : "等待后端执行记录"}</span></div>{latest?.steps?.map((step, index) => <div key={step}><b>{String(index + 4).padStart(2, "0")}</b><span>{step}</span></div>)}</div><p className="muted protocol-note">{latest === undefined ? "服务公开会话记录后才会显示在这里，页面不会编造执行轨迹。" : `最近一次执行 ${latest.id}，状态为 ${latest.status}。`}</p></section>;
}
