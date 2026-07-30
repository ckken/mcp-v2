import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  ActivityIcon,
  BotIcon,
  BracesIcon,
  CheckIcon,
  CopyIcon,
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
import { TooltipProvider } from "@/components/ui/tooltip";
import type { ScenarioId } from "./scenario-report";
import { SCENARIOS } from "./scenarios";
import { UnifiedWorkflow } from "./unified-workflow";

type Health = "online" | "unavailable" | "checking";
type CopyStatus = "idle" | "copied" | "failed";

const MCP_ENDPOINT = "https://mcp-v2.kenvoai.com/mcp";

const pageIcons: Record<ScenarioId, LucideIcon> = {
  loop: WorkflowIcon,
  protocol: BracesIcon,
  tools: WrenchIcon,
  skills: SparklesIcon,
  "mcp-apps": PanelsTopLeftIcon,
  codex: BotIcon,
};

const pages = SCENARIOS.map((scenario) => ({ ...scenario, icon: pageIcons[scenario.id] }));

async function copyText(value: string) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Clipboard copy failed");
}

function FlowStageButton({
  id,
  label,
  icon: Icon,
  active,
  onSelect,
}: {
  id: ScenarioId;
  label: string;
  icon: LucideIcon;
  active: boolean;
  onSelect: (page: ScenarioId) => void;
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
  const [focusedScenario, setFocusedScenario] = useState<ScenarioId>("loop");
  const [health, setHealth] = useState<Health>("checking");
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");
  const copyFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshHealth = async () => {
    try {
      const response = await fetch("/api/status", { headers: { accept: "application/json" } });
      setHealth(response.ok ? "online" : "unavailable");
    } catch {
      setHealth("unavailable");
    }
  };

  useEffect(() => { void refreshHealth(); }, []);
  useEffect(() => () => {
    if (copyFeedbackTimer.current) clearTimeout(copyFeedbackTimer.current);
  }, []);

  const copyMcpEndpoint = async () => {
    try {
      await copyText(MCP_ENDPOINT);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
    if (copyFeedbackTimer.current) clearTimeout(copyFeedbackTimer.current);
    copyFeedbackTimer.current = setTimeout(() => setCopyStatus("idle"), 2_000);
  };

  const focused = pages.find((item) => item.id === focusedScenario) ?? pages[0]!;

  return (
    <TooltipProvider>
      <SidebarProvider style={{ "--sidebar-width": "15rem" } as CSSProperties}>
        <Sidebar collapsible="icon" variant="inset">
          <SidebarHeader>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton size="lg" tooltip="MCP v2 主流程" onClick={() => setFocusedScenario("loop")}>
                  <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                    <ActivityIcon />
                  </span>
                  <span className="grid min-w-0 flex-1 text-left">
                    <strong className="truncate text-sm">MCP v2 主流程</strong>
                    <span className="truncate text-xs text-muted-foreground">一个真实证据闭环</span>
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>定位流程节点</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {pages.map(({ id, label, scene, icon: Icon }) => (
                    <SidebarMenuItem key={id}>
                      <FlowStageButton
                        id={id}
                        label={`${scene} · ${label}`}
                        icon={Icon}
                        active={focusedScenario === id}
                        onSelect={setFocusedScenario}
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
              <span>FLOW NODE {focused.scene}</span>
              <strong>{focused.label}</strong>
            </div>
            <Button
              variant="outline"
              size="sm"
              type="button"
              title={MCP_ENDPOINT}
              aria-label={copyStatus === "copied"
                ? "MCP 地址已复制"
                : copyStatus === "failed"
                  ? "复制 MCP 地址失败，点击重试"
                  : "复制 MCP 地址"}
              onClick={() => { void copyMcpEndpoint(); }}
            >
              {copyStatus === "copied"
                ? <CheckIcon data-icon="inline-start" aria-hidden="true" />
                : <CopyIcon data-icon="inline-start" aria-hidden="true" />}
              <span className="hidden sm:inline" aria-live="polite">
                {copyStatus === "copied" ? "已复制" : copyStatus === "failed" ? "重试复制" : "复制 MCP"}
              </span>
            </Button>
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

          <main className="flex flex-1 flex-col p-4 md:p-6">
            {health === "unavailable" && (
              <Alert variant="destructive" className="mb-4">
                <ServerIcon />
                <AlertTitle>后端没有响应</AlertTitle>
                <AlertDescription>主流程不会伪造通过状态，请启动 MCP 服务后刷新。</AlertDescription>
              </Alert>
            )}
            <UnifiedWorkflow
              focusedScenario={focusedScenario}
              onFocus={setFocusedScenario}
              onCompleted={refreshHealth}
            />
          </main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
