import { useEffect, useMemo, useState } from "react";
import { asRuns, type VerificationRunView } from "./runs";

type Health = "online" | "unavailable" | "checking";
type Page = "Overview" | "Protocol" | "Tools" | "Skills" | "MCP Apps" | "Codex Session";
type Run = VerificationRunView;

const pages: Page[] = ["Overview", "Protocol", "Tools", "Skills", "MCP Apps", "Codex Session"];
const protocolRows = [
  ["server/discover", "Modern capability discovery", "required"],
  ["request envelope", "Protocol version on every request", "required"],
  ["legacy reject", "Legacy protocol requests fail explicitly", "required"],
  ["application/json", "Responses must not use text/event-stream", "required"],
];
const demoTools = ["system.health", "orders.search", "skills.discover", "skills.run", "verification.start", "verification.status", "verification.finish"];
const demoSkills = ["skills.discover", "skills.run"];

export function App() {
  const [page, setPage] = useState<Page>("Overview");
  const [health, setHealth] = useState<Health>("checking");
  const [runs, setRuns] = useState<Run[]>([]);
  const [message, setMessage] = useState("Waiting for MCP App bridge…");
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
      setRunError(error instanceof Error ? error.message : "Verification failed");
      setRefreshing(false);
    }
  };

  useEffect(() => { void refresh(); }, []);
  useEffect(() => {
    const listener = (event: MessageEvent<unknown>) => {
      if (!event.data || typeof event.data !== "object") return;
      const data = event.data as { type?: unknown; text?: unknown };
      if (data.type === "mcp-app/ready") setMessage(typeof data.text === "string" ? data.text : "Sandbox app connected");
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, []);

  const passed = useMemo(() => runs.filter((run) => run.status === "passed").length, [runs]);
  const active = useMemo(() => runs.filter((run) => run.status === "running").length, [runs]);

  return <main className="shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">M</span><span>MCP V2</span></div>
      <p className="eyebrow">VISUAL VERIFICATION</p>
      <nav aria-label="Verification sections">{pages.map((item) => <button className={page === item ? "nav active" : "nav"} key={item} onClick={() => setPage(item)}>{item}</button>)}</nav>
      <div className="side-foot"><span className={`dot ${health}`} /> {health === "online" ? "API connected" : health === "checking" ? "Checking API" : "API unavailable"}</div>
    </aside>
    <section className="content">
      <header className="topbar"><div><p className="eyebrow">CONTROL PLANE</p><h1>{page}</h1></div><div className="actions"><button className="ghost" disabled={refreshing} onClick={() => void refresh()}>Refresh data</button><button className="refresh" disabled={refreshing} onClick={() => void runVerification()}>{refreshing ? "Running…" : "Run verification"}</button></div></header>
      {health === "unavailable" && <div className="notice" role="status">Backend unavailable — data-dependent checks are not reported as successful. Start the MCP service, then refresh.</div>}
      {runError !== null && <div className="notice" role="alert">Verification failed: {runError}</div>}
      {page === "Overview" && <Overview health={health} runs={runs} passed={passed} active={active} />}
      {page === "Protocol" && <Protocol />}
      {page === "Tools" && <Catalog title="Tool registry" items={demoTools} endpoint="/api/demo/tools" />}
      {page === "Skills" && <Catalog title="Skill registry" items={demoSkills} endpoint="/api/demo/skills" />}
      {page === "MCP Apps" && <McpApps message={message} />}
      {page === "Codex Session" && <Session runs={runs} />}
    </section>
  </main>;
}

function Overview({ health, runs, passed, active }: { health: Health; runs: Run[]; passed: number; active: number }) {
  return <><section className="hero"><div><p className="eyebrow">SYSTEM CONFIDENCE</p><h2>See every MCP contract before it reaches an agent.</h2><p className="muted">Live status, verification runs, protocol semantics, and sandboxed MCP Apps in one operator view.</p></div><div className={`health-card ${health}`}><span className="dot"/><strong>{health === "online" ? "Service reachable" : health === "checking" ? "Contacting service" : "Service unavailable"}</strong><small>{health === "online" ? "/api/status responded" : "No successful API status response"}</small></div></section>
  <section className="metrics"><Metric label="Verification runs" value={String(runs.length)} /><Metric label="Passed" value={String(passed)} /><Metric label="Running" value={String(active)} /><Metric label="Transport" value={health === "online" ? "Live" : "—"} /></section>
  <section className="panel"><div className="panel-head"><div><p className="eyebrow">RECENT ACTIVITY</p><h3>Verification runs</h3></div><span className="subtle">{runs.length ? "Live API results" : "No runs available"}</span></div>{runs.length ? <div className="run-list">{runs.map((run) => <div className="run" key={run.id}><span className={`status ${run.status}`}/><div><strong>{run.name}</strong><small>{run.id}</small></div><span>{run.finishedAt ?? run.status}</span></div>)}</div> : <Empty text="Runs appear here when /api/verification/runs is available." />}</section></>;
}

function Metric({ label, value }: { label: string; value: string }) { return <article className="metric"><p>{label}</p><strong>{value}</strong></article>; }
function Empty({ text }: { text: string }) { return <div className="empty">{text}</div>; }

function Protocol() { return <section className="panel"><div className="panel-head"><div><p className="eyebrow">JSON-RPC LIFECYCLE</p><h3>Protocol checkpoints</h3></div><span className="badge">MCP</span></div><div className="table">{protocolRows.map(([event, evidence, state]) => <div className="row" key={event}><code>{event}</code><span>{evidence}</span><span className="badge">{state}</span></div>)}</div><p className="muted protocol-note">These checks describe expected evidence; their live result comes from the backend verification feed.</p></section>; }

function Catalog({ title, items, endpoint }: { title: string; items: string[]; endpoint: string }) {
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => { let current = true; void fetch(endpoint, { headers: { accept: "application/json" } }).then((response) => { if (current) setAvailable(response.ok); }).catch(() => { if (current) setAvailable(false); }); return () => { current = false; }; }, [endpoint]);
  return <section className="panel"><div className="panel-head"><div><p className="eyebrow">DISCOVERY</p><h3>{title}</h3></div><code>{endpoint}</code></div><div className="catalog">{items.map((item) => <article key={item}><span className="terminal">⌘</span><div><strong>{item}</strong><p>Awaiting server-provided detail</p></div><span className="badge">demo</span></article>)}</div><p className="muted protocol-note">{available === true ? "Demo endpoint responded; entries remain explicitly marked as demo." : available === false ? "Demo endpoint unavailable — no server result is being shown." : "Checking demo endpoint…"}</p></section>;
}

function McpApps({ message }: { message: string }) {
  const srcDoc = `<!doctype html><html><body style="margin:0;background:#10121b;color:#e7e9f5;font:14px system-ui;display:grid;place-items:center;height:100vh"><button id="send" style="background:#a5b4fc;border:0;border-radius:8px;padding:10px 14px;color:#11152a;font-weight:700">Send bridge event</button><script>parent.postMessage({type:'mcp-app/ready',text:'Sandbox app handshake received'},'*');document.getElementById('send').onclick=()=>parent.postMessage({type:'mcp-app/ready',text:'Sandbox app sent an event at '+new Date().toLocaleTimeString()},'*');<\/script></body></html>`;
  return <section className="apps-grid"><div className="panel bridge"><p className="eyebrow">POSTMESSAGE BRIDGE</p><h3>Sandboxed MCP App</h3><p className="muted">The embedded app has no same-origin access. It communicates only through a typed postMessage event.</p><div className="bridge-event"><span className="dot checking"/>{message}</div><code>mcp-app/ready</code></div><iframe title="Sandbox MCP App demo" sandbox="allow-scripts" srcDoc={srcDoc} /></section>;
}

function Session({ runs }: { runs: Run[] }) {
  const latest = runs[0];
  return <section className="panel"><div className="panel-head"><div><p className="eyebrow">AGENT TRACE</p><h3>Codex session</h3></div><span className="badge">{latest?.status ?? "read-only"}</span></div><div className="timeline"><div><b>01</b><span>Discover server capabilities</span></div><div><b>02</b><span>Run bounded verification through the real MCP client</span></div><div><b>03</b><span>{runs.length ? `${runs.length} backend run records received` : "Awaiting backend run records"}</span></div>{latest?.steps?.map((step, index) => <div key={step}><b>{String(index + 4).padStart(2, "0")}</b><span>{step}</span></div>)}</div><p className="muted protocol-note">{latest === undefined ? "Session records remain unavailable until the service exposes them; this screen never manufactures an execution trace." : `Latest run ${latest.id} is ${latest.status}.`}</p></section>;
}
