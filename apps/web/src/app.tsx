import { useEffect, useMemo, useRef, useState } from "react";
import { E2eFlowLab } from "./e2e-flow";
import { asRuns, type VerificationRunView } from "./runs";

type Health = "online" | "unavailable" | "checking";
type Page = "Overview" | "E2E Lab" | "Protocol" | "Tools" | "Skills" | "MCP Apps" | "Codex Session";
type Run = VerificationRunView;

const pages: Page[] = ["Overview", "E2E Lab", "Protocol", "Tools", "Skills", "MCP Apps", "Codex Session"];
const protocolRows = [
  ["server/discover", "Modern capability discovery", "required"],
  ["request envelope", "Protocol version on every request", "required"],
  ["modern response", "2026-era results use application/json", "required"],
  ["legacy fallback", "2025-era stateless POST results use SSE framing", "enabled"],
  ["SSE endpoint", "No standalone legacy SSE endpoint", "disabled"],
];
const demoTools = ["system.health", "orders.search", "orders.dashboard", "skills.discover", "skills.run", "verification.start", "verification.status", "verification.finish"];
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
      setRunError(error instanceof Error ? error.message : "Verification failed");
      setRefreshing(false);
    }
  };

  useEffect(() => { void refresh(); }, []);
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
      {page === "E2E Lab" && <E2eFlowLab />}
      {page === "Protocol" && <Protocol />}
      {page === "Tools" && <Catalog title="Tool registry" items={demoTools} endpoint="/api/demo/tools" />}
      {page === "Skills" && <Catalog title="Skill registry" items={demoSkills} endpoint="/api/demo/skills" />}
      {page === "MCP Apps" && <McpApps />}
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

function McpApps() {
  const [app, setApp] = useState<{
    descriptor: { name: string; _meta?: { ui?: { resourceUri?: string } } };
    resource: { uri: string; mimeType?: string; text: string };
    toolResult: { structuredContent?: unknown };
  } | null>(null);
  const [message, setMessage] = useState("Resolving Tool → ui:// Resource…");
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
        setMessage("MCP Apps bridge initialized");
      } else if (rpc.method === "ui/notifications/initialized") {
        frameRef.current?.contentWindow?.postMessage({
          jsonrpc: "2.0",
          method: "ui/notifications/tool-result",
          params: app?.toolResult ?? {},
        }, "*");
        setMessage("Tool result delivered to ui:// resource");
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
          ? `Widget called orders.dashboard(view=${String(args.view ?? "overview")}, status=${String(args.status ?? "all")}) through host`
          : "Widget tool call failed");
      }
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [app]);

  return <section className="apps-grid"><div className="panel bridge"><p className="eyebrow">REAL MCP APPS CHAIN</p><h3>Tool-linked sandbox resource</h3><p className="muted">The host discovers tool metadata, reads the ui:// resource over MCP, then delivers the tool result over the JSON-RPC postMessage bridge.</p><div className="bridge-event"><span className="dot checking"/>{message}</div><code>{app?.descriptor._meta?.ui?.resourceUri ?? "ui:// resolving"}</code><code>{app?.resource.mimeType ?? "MIME resolving"}</code></div>{app && <iframe ref={frameRef} title="MCP App orders dashboard" sandbox="allow-scripts" srcDoc={app.resource.text} />}</section>;
}

function Session({ runs }: { runs: Run[] }) {
  const latest = runs[0];
  return <section className="panel"><div className="panel-head"><div><p className="eyebrow">AGENT TRACE</p><h3>Codex session</h3></div><span className="badge">{latest?.status ?? "read-only"}</span></div><div className="timeline"><div><b>01</b><span>Discover server capabilities</span></div><div><b>02</b><span>Run bounded verification through the real MCP client</span></div><div><b>03</b><span>{runs.length ? `${runs.length} backend run records received` : "Awaiting backend run records"}</span></div>{latest?.steps?.map((step, index) => <div key={step}><b>{String(index + 4).padStart(2, "0")}</b><span>{step}</span></div>)}</div><p className="muted protocol-note">{latest === undefined ? "Session records remain unavailable until the service exposes them; this screen never manufactures an execution trace." : `Latest run ${latest.id} is ${latest.status}.`}</p></section>;
}
