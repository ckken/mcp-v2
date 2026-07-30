import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  ActivityIcon,
  BotIcon,
  BracesIcon,
  CircleCheckIcon,
  FlaskConicalIcon,
  LayoutDashboardIcon,
  PanelsTopLeftIcon,
  PlayIcon,
  RadioIcon,
  RefreshCwIcon,
  ServerIcon,
  SparklesIcon,
  WrenchIcon,
  type LucideIcon,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TooltipProvider } from "@/components/ui/tooltip";
import { E2eFlowLab } from "./e2e-flow";
import { asRuns, type VerificationRunView } from "./runs";

type Health = "online" | "unavailable" | "checking";
type Page = "Overview" | "E2E Lab" | "Protocol" | "Tools" | "Skills" | "MCP Apps" | "Codex Session";
type Run = VerificationRunView;

const pages: Array<{ id: Page; label: string; icon: LucideIcon }> = [
  { id: "Overview", label: "总览", icon: LayoutDashboardIcon },
  { id: "E2E Lab", label: "全链路验收", icon: FlaskConicalIcon },
  { id: "Protocol", label: "协议", icon: BracesIcon },
  { id: "Tools", label: "工具", icon: WrenchIcon },
  { id: "Skills", label: "技能", icon: SparklesIcon },
  { id: "MCP Apps", label: "MCP 应用", icon: PanelsTopLeftIcon },
  { id: "Codex Session", label: "Codex 会话", icon: BotIcon },
];

const protocolRows = [
  ["server/discover", "发现服务端能力", "必需"],
  ["request envelope", "每次请求都携带协议版本", "必需"],
  ["modern response", "2026 版本返回 application/json", "必需"],
  ["legacy fallback", "2025 版本无状态 POST 使用 SSE 帧", "已启用"],
  ["SSE endpoint", "不提供独立的旧版 SSE 端点", "已关闭"],
];
const demoTools = ["system.health", "orders.search", "orders.dashboard", "skills.discover", "skills.run", "verification.start", "verification.status", "verification.finish"];
const demoSkills = ["skills.discover", "skills.run"];

function pageLabel(page: Page) {
  return pages.find((item) => item.id === page)?.label ?? page;
}

function DashboardPageButton({
  id,
  label,
  icon: Icon,
  active,
  onSelect,
}: {
  id: Page;
  label: string;
  icon: LucideIcon;
  active: boolean;
  onSelect: (page: Page) => void;
}) {
  const { isMobile, setOpenMobile } = useSidebar();

  return (
    <SidebarMenuButton
      isActive={active}
      tooltip={label}
      onClick={() => {
        onSelect(id);
        if (isMobile) setOpenMobile(false);
      }}
    >
      <Icon />
      <span>{label}</span>
    </SidebarMenuButton>
  );
}

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

  return (
    <TooltipProvider>
      <SidebarProvider style={{ "--sidebar-width": "15rem" } as CSSProperties}>
        <Sidebar collapsible="icon" variant="inset">
          <SidebarHeader>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton size="lg" tooltip="MCP v2 验证中心" onClick={() => setPage("Overview")}>
                  <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                    <ActivityIcon />
                  </span>
                  <span className="grid min-w-0 flex-1 text-left">
                    <strong className="truncate text-sm">MCP v2 验证中心</strong>
                    <span className="truncate text-xs text-muted-foreground">全功能实验链路</span>
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>验证页面</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {pages.map(({ id, label, icon: Icon }) => (
                    <SidebarMenuItem key={id}>
                      <DashboardPageButton
                        id={id}
                        label={label}
                        icon={Icon}
                        active={page === id}
                        onSelect={setPage}
                      />
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <div className="flex items-center gap-2 rounded-lg border bg-background p-2 text-xs group-data-[collapsible=icon]:justify-center">
              <span className={`status-dot ${health}`} />
              <span className="truncate group-data-[collapsible=icon]:hidden">
                {health === "online" ? "服务已连接" : health === "checking" ? "正在连接" : "服务不可用"}
              </span>
            </div>
          </SidebarFooter>
          <SidebarRail />
        </Sidebar>

        <SidebarInset>
          <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
            <SidebarTrigger />
            <Separator orientation="vertical" className="h-4" />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">MCP v2 可视化验证</p>
              <h1 className="truncate text-base font-medium">{pageLabel(page)}</h1>
            </div>
            <div className="flex items-center gap-2">
              <Button aria-label="刷新数据" variant="outline" size="sm" disabled={refreshing} onClick={() => void refresh()}>
                <RefreshCwIcon data-icon="inline-start" />
                <span className="hidden sm:inline">刷新数据</span>
              </Button>
              <Button aria-label="运行会话验证" size="sm" disabled={refreshing} onClick={() => void runVerification()}>
                <PlayIcon data-icon="inline-start" />
                <span className="hidden sm:inline">{refreshing ? "正在运行…" : "运行会话验证"}</span>
              </Button>
            </div>
          </header>

          <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
            {health === "unavailable" && (
              <Alert variant="destructive">
                <ServerIcon />
                <AlertTitle>后端没有响应</AlertTitle>
                <AlertDescription>依赖实时数据的检查不会显示为通过，请启动 MCP 服务后刷新。</AlertDescription>
              </Alert>
            )}
            {runError !== null && (
              <Alert variant="destructive">
                <AlertTitle>会话验证失败</AlertTitle>
                <AlertDescription>{runError}</AlertDescription>
              </Alert>
            )}
            {page === "Overview" && <Overview health={health} runs={runs} passed={passed} active={active} />}
            {page === "E2E Lab" && <E2eFlowLab />}
            {page === "Protocol" && <Protocol />}
            {page === "Tools" && <Catalog title="工具清单" items={demoTools} endpoint="/api/demo/tools" icon={WrenchIcon} />}
            {page === "Skills" && <Catalog title="技能清单" items={demoSkills} endpoint="/api/demo/skills" icon={SparklesIcon} />}
            {page === "MCP Apps" && <McpApps />}
            {page === "Codex Session" && <Session runs={runs} />}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}

function Overview({ health, runs, passed, active }: { health: Health; runs: Run[]; passed: number; active: number }) {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="验证记录" value={String(runs.length)} detail="服务端累计执行" icon={ActivityIcon} />
        <Metric label="已通过" value={String(passed)} detail="完成真实证据检查" icon={CircleCheckIcon} />
        <Metric label="运行中" value={String(active)} detail="当前活动会话" icon={RadioIcon} />
        <Metric label="传输状态" value={health === "online" ? "在线" : "—"} detail="Streamable HTTP" icon={ServerIcon} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(280px,.7fr)]">
        <Card>
          <CardHeader className="border-b">
            <CardTitle>最近验证记录</CardTitle>
            <CardDescription>只显示最近 8 次服务端执行，完整轨迹可在 Codex 会话中查看。</CardDescription>
            <CardAction><Badge variant="outline">实时 API</Badge></CardAction>
          </CardHeader>
          <CardContent>
            {runs.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>状态</TableHead>
                    <TableHead>名称</TableHead>
                    <TableHead className="hidden md:table-cell">运行 ID</TableHead>
                    <TableHead className="text-right">完成时间</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.slice(0, 8).map((run) => (
                    <TableRow key={run.id}>
                      <TableCell><RunBadge status={run.status} /></TableCell>
                      <TableCell className="font-medium">{run.name}</TableCell>
                      <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">{run.id}</TableCell>
                      <TableCell className="text-right font-mono text-xs text-muted-foreground">{run.finishedAt ?? "执行中"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : <Empty text="服务返回执行记录后会显示在这里。" />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>服务状态</CardTitle>
            <CardDescription>页面只呈现当前服务返回的数据。</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center gap-3 rounded-lg border p-3">
              <span className={`status-dot ${health}`} />
              <div>
                <p className="font-medium">{health === "online" ? "服务可以访问" : health === "checking" ? "正在联系服务" : "服务暂时不可用"}</p>
                <p className="font-mono text-xs text-muted-foreground">{health === "online" ? "/api/status 已响应" : "还没有收到成功响应"}</p>
              </div>
            </div>
            <div className="grid gap-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">协议版本</span><code>2026-07-28</code></div>
              <div className="flex justify-between"><span className="text-muted-foreground">传输方式</span><span>Streamable HTTP</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">独立 SSE</span><Badge variant="secondary">关闭</Badge></div>
            </div>
          </CardContent>
          <CardFooter className="text-xs text-muted-foreground">结果来自当前进程，不使用静态通过状态。</CardFooter>
        </Card>
      </div>
    </>
  );
}

function Metric({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: LucideIcon }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums">{value}</CardTitle>
        <CardAction><Icon className="text-muted-foreground" /></CardAction>
      </CardHeader>
      <CardFooter className="text-xs text-muted-foreground">{detail}</CardFooter>
    </Card>
  );
}

function RunBadge({ status }: { status: Run["status"] }) {
  return <Badge variant={status === "passed" ? "secondary" : status === "failed" ? "destructive" : "outline"}>{status === "passed" ? "通过" : status === "failed" ? "失败" : "运行中"}</Badge>;
}

function Empty({ text }: { text: string }) {
  return <div className="flex min-h-32 items-center justify-center rounded-lg border border-dashed p-6 text-sm text-muted-foreground">{text}</div>;
}

function Protocol() {
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>协议检查点</CardTitle>
        <CardDescription>预期证据与兼容状态，实际结论以服务端验证记录为准。</CardDescription>
        <CardAction><Badge>MCP 2026</Badge></CardAction>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>事件</TableHead><TableHead>检查内容</TableHead><TableHead className="text-right">状态</TableHead></TableRow></TableHeader>
          <TableBody>
            {protocolRows.map(([event, evidence, state]) => (
              <TableRow key={event}>
                <TableCell><code>{event}</code></TableCell>
                <TableCell>{evidence}</TableCell>
                <TableCell className="text-right"><Badge variant="outline">{state}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function Catalog({ title, items, endpoint, icon: Icon }: { title: string; items: string[]; endpoint: string; icon: LucideIcon }) {
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    let current = true;
    void fetch(endpoint, { headers: { accept: "application/json" } })
      .then((response) => { if (current) setAvailable(response.ok); })
      .catch(() => { if (current) setAvailable(false); });
    return () => { current = false; };
  }, [endpoint]);

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{available === true ? "实验端点已响应，条目仍标记为实验数据。" : available === false ? "实验端点不可用，页面没有伪造结果。" : "正在检查实验端点…"}</CardDescription>
        <CardAction><Badge variant="outline">{endpoint}</Badge></CardAction>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <Card size="sm" key={item}>
            <CardHeader>
              <span className="flex size-8 items-center justify-center rounded-lg bg-muted"><Icon /></span>
              <CardTitle className="font-mono">{item}</CardTitle>
              <CardDescription>等待服务端返回详细定义</CardDescription>
              <CardAction><Badge variant="secondary">实验</Badge></CardAction>
            </CardHeader>
          </Card>
        ))}
      </CardContent>
    </Card>
  );
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
      .catch((error) => setMessage(error instanceof Error ? error.message : "MCP App 不可用"));
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
          : { jsonrpc: "2.0", id: rpc.id, error: { code: -32000, message: result.error ?? "工具调用失败" } }, "*");
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

  return (
    <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle>真实 MCP Apps 链路</CardTitle>
          <CardDescription>宿主发现工具元数据，读取 ui:// 资源，再通过 JSON-RPC postMessage 传递工具结果。</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center gap-2 rounded-lg border p-3 text-sm">
            <span className="status-dot checking" />
            <span>{message}</span>
          </div>
          <code className="break-all rounded-md bg-muted p-2 text-xs">{app?.descriptor._meta?.ui?.resourceUri ?? "正在解析 ui://"}</code>
          <code className="break-all rounded-md bg-muted p-2 text-xs">{app?.resource.mimeType ?? "正在解析 MIME"}</code>
        </CardContent>
      </Card>
      {app ? (
        <iframe ref={frameRef} className="min-h-[720px] w-full rounded-xl border bg-card" title="MCP App 订单看板" sandbox="allow-scripts" srcDoc={app.resource.text} />
      ) : (
        <Card><CardContent><Empty text="正在加载 MCP App 资源。" /></CardContent></Card>
      )}
    </div>
  );
}

function Session({ runs }: { runs: Run[] }) {
  const latest = runs[0];
  const baseSteps = ["发现服务端能力", "通过真实 MCP 客户端运行限定范围的验证", runs.length ? `已收到 ${runs.length} 条后端执行记录` : "等待后端执行记录"];
  const steps = [...baseSteps, ...(latest?.steps ?? [])];
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Codex 会话</CardTitle>
        <CardDescription>记录真实客户端调用和服务端返回，不生成模拟执行轨迹。</CardDescription>
        <CardAction><RunBadge status={latest?.status ?? "running"} /></CardAction>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead className="w-16">步骤</TableHead><TableHead>执行内容</TableHead><TableHead className="text-right">证据</TableHead></TableRow></TableHeader>
          <TableBody>
            {steps.map((step, index) => (
              <TableRow key={`${index}-${step}`}>
                <TableCell className="font-mono text-muted-foreground">{String(index + 1).padStart(2, "0")}</TableCell>
                <TableCell className="font-medium">{step}</TableCell>
                <TableCell className="text-right"><Badge variant="outline">{index < 3 ? "会话" : "MCP"}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
      <CardFooter className="text-xs text-muted-foreground">
        {latest === undefined ? "服务公开会话记录后才会显示在这里。" : `最近一次执行 ${latest.id}，状态为 ${latest.status}。`}
      </CardFooter>
    </Card>
  );
}
