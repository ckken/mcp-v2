import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  ActivityIcon,
  BotIcon,
  BracesIcon,
  GitForkIcon,
  PanelsTopLeftIcon,
  ServerIcon,
  SparklesIcon,
  WorkflowIcon,
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
import { asRuns, type VerificationRunView } from "./runs";
import type { ScenarioId } from "./scenario-report";
import { ScenarioWorkflow } from "./scenario-workflow";
import { SCENARIOS } from "./scenarios";

type Health = "online" | "unavailable" | "checking";
type Page = ScenarioId;
type Run = VerificationRunView;

const pageIcons: Record<Page, LucideIcon> = {
  loop: WorkflowIcon,
  protocol: BracesIcon,
  tools: WrenchIcon,
  skills: SparklesIcon,
  "mcp-apps": PanelsTopLeftIcon,
  codex: BotIcon,
};
const pages = SCENARIOS.map((scenario) => ({ ...scenario, icon: pageIcons[scenario.id] }));

const protocolRows = [
  ["server/discover", "发现服务端能力", "必需"],
  ["request envelope", "每次请求都携带协议版本", "必需"],
  ["modern response", "2026 版本返回 application/json", "必需"],
  ["legacy fallback", "2025 版本无状态 POST 使用 SSE 帧", "已启用"],
  ["SSE endpoint", "不提供独立的旧版 SSE 端点", "已关闭"],
];
const demoTools = [
  "system.health", "orders.search", "orders.dashboard", "skills.discover", "skills.run",
  "verification.start", "verification.status", "verification.finish",
  "tasks.create", "tasks.status", "tasks.list", "tasks.cancel", "tasks.result",
];
const demoSkills = ["skills.discover", "skills.run"];

function pageMeta(page: Page) {
  return pages.find((item) => item.id === page) ?? pages[0]!;
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
  const [page, setPage] = useState<Page>("loop");
  const [health, setHealth] = useState<Health>("checking");
  const [runs, setRuns] = useState<Run[]>([]);

  const refresh = async () => {
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
    }
  };

  useEffect(() => { void refresh(); }, []);
  const currentPage = pageMeta(page);

  return (
    <TooltipProvider>
      <SidebarProvider style={{ "--sidebar-width": "15rem" } as CSSProperties}>
        <Sidebar collapsible="icon" variant="inset">
          <SidebarHeader>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton size="lg" tooltip="MCP v2 验证中心" onClick={() => setPage("loop")}>
                  <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                    <ActivityIcon />
                  </span>
                  <span className="grid min-w-0 flex-1 text-left">
                    <strong className="truncate text-sm">MCP v2 验证中心</strong>
                    <span className="truncate text-xs text-muted-foreground">六个独立闭环</span>
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
                  {pages.map(({ id, label, scene, icon: Icon }) => (
                    <SidebarMenuItem key={id}>
                      <DashboardPageButton
                        id={id}
                        label={`${scene} · ${label}`}
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
          <SidebarRail />
        </Sidebar>

        <SidebarInset>
          <header className="workspace-statusbar">
            <SidebarTrigger />
            <Separator orientation="vertical" className="h-4" />
            <div
              className="statusbar-service"
              role="status"
              aria-label={health === "online" ? "MCP 服务在线" : health === "checking" ? "正在连接 MCP" : "MCP 服务不可用"}
            >
              <span className={`status-dot ${health}`} />
              <span>{health === "online" ? "MCP 服务在线" : health === "checking" ? "正在连接 MCP" : "MCP 服务不可用"}</span>
            </div>
            <Badge variant="outline" className="hidden sm:inline-flex">2026-07-28</Badge>
            <div className="statusbar-scene">
              <span>SCENE {currentPage.scene}</span>
              <strong>{currentPage.label}</strong>
            </div>
            <Button asChild variant="outline" size="sm">
              <a
                href="https://github.com/ckken/mcp-v2"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="在 GitHub 查看 mcp-v2"
              >
                <GitForkIcon data-icon="inline-start" aria-hidden="true" />
                <span className="hidden sm:inline">GitHub</span>
              </a>
            </Button>
          </header>

          <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
            {health === "unavailable" && (
              <Alert variant="destructive">
                <ServerIcon />
                <AlertTitle>后端没有响应</AlertTitle>
                <AlertDescription>依赖实时数据的检查不会显示为通过，请启动 MCP 服务后刷新。</AlertDescription>
              </Alert>
            )}
            <SceneStage page={currentPage}>
              <ScenarioWorkflow
                key={page}
                definition={currentPage}
                {...(page === "codex" ? { onRefresh: refresh, onCompleted: refresh } : {})}
              />
              {page === "protocol" && <Protocol />}
              {page === "tools" && <Catalog title="工具清单" items={demoTools} endpoint="/api/demo/tools" icon={WrenchIcon} />}
              {page === "skills" && <Catalog title="技能清单" items={demoSkills} endpoint="/api/demo/skills" icon={SparklesIcon} />}
              {page === "mcp-apps" && <McpApps />}
              {page === "codex" && <Session runs={runs} />}
            </SceneStage>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}

function SceneStage({
  page,
  children,
}: {
  page: (typeof pages)[number];
  children: ReactNode;
}) {
  return (
    <section className="scene-stage" data-scene={page.scene}>
      <div className="scene-stage-content">{children}</div>
    </section>
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
