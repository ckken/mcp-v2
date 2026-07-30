import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  CircleDollarSign,
  LayoutDashboard,
  PackageCheck,
  RefreshCw,
  ShoppingBag,
} from "lucide-react";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";

type DashboardView = "overview" | "orders" | "status";
type OrderStatus = "all" | "paid" | "pending" | "fulfilled";

interface DashboardOrder {
  id: string;
  customer: string;
  status: Exclude<OrderStatus, "all">;
  total: number;
  currency: string;
}

interface DashboardData {
  headline: string;
  summary: string;
  parameters: {
    view: DashboardView;
    status: OrderStatus;
  };
  metrics: {
    orders: number;
    revenue: number;
    paid: number;
    fulfilled: number;
  };
  statusBreakdown: {
    status: Exclude<OrderStatus, "all">;
    count: number;
  }[];
  orders: DashboardOrder[];
}

type RpcResult = { structuredContent?: DashboardData };
type PendingRequest = {
  resolve: (result: RpcResult) => void;
  reject: (error: Error) => void;
  timeoutId: number;
};

const HOST_REQUEST_TIMEOUT_MS = 10_000;

const statusLabels: Record<OrderStatus, string> = {
  all: "All statuses",
  paid: "Paid",
  pending: "Pending",
  fulfilled: "Fulfilled",
};

const statusVariants = {
  paid: "success",
  pending: "warning",
  fulfilled: "secondary",
} as const;

function useMcpApp() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idRef = useRef(0);
  const pendingRef = useRef(new Map<number, PendingRequest>());

  const request = useCallback((method: string, params: unknown) => new Promise<RpcResult>((resolve, reject) => {
    const id = ++idRef.current;
    const timeoutId = window.setTimeout(() => {
      pendingRef.current.delete(id);
      reject(new Error(`MCP host did not answer ${method} within ${HOST_REQUEST_TIMEOUT_MS / 1000}s`));
    }, HOST_REQUEST_TIMEOUT_MS);
    pendingRef.current.set(id, { resolve, reject, timeoutId });
    window.parent.postMessage({ jsonrpc: "2.0", id, method, params }, "*");
  }), []);

  useEffect(() => {
    let mounted = true;
    const onMessage = (event: MessageEvent<unknown>) => {
      if (event.source !== window.parent || !event.data || typeof event.data !== "object") return;
      const message = event.data as {
        jsonrpc?: unknown;
        id?: unknown;
        method?: unknown;
        params?: { structuredContent?: DashboardData };
        result?: RpcResult;
        error?: { message?: string };
      };
      if (message.jsonrpc !== "2.0") return;
      if (typeof message.id === "number") {
        const pending = pendingRef.current.get(message.id);
        if (!pending) return;
        pendingRef.current.delete(message.id);
        window.clearTimeout(pending.timeoutId);
        if (message.error) pending.reject(new Error(message.error.message ?? "MCP host call failed"));
        else pending.resolve(message.result ?? {});
        return;
      }
      if (message.method === "ui/notifications/tool-result" && message.params?.structuredContent) {
        setData(message.params.structuredContent);
      }
    };

    window.addEventListener("message", onMessage);
    void request("ui/initialize", {
      appInfo: { name: "mcp-v2-orders-dashboard", version: "0.2.0" },
      appCapabilities: {},
      protocolVersion: "2026-01-26",
    }).then(() => {
      if (!mounted) return;
      setConnected(true);
      setError(null);
      window.parent.postMessage({ jsonrpc: "2.0", method: "ui/notifications/initialized", params: {} }, "*");
    }).catch((initializeError: unknown) => {
      if (mounted) setError(initializeError instanceof Error ? initializeError.message : "MCP host initialization failed");
    });

    return () => {
      mounted = false;
      window.removeEventListener("message", onMessage);
      for (const pending of pendingRef.current.values()) {
        window.clearTimeout(pending.timeoutId);
        pending.reject(new Error("MCP App unmounted"));
      }
      pendingRef.current.clear();
    };
  }, [request]);

  const update = useCallback(async (parameters: { view: DashboardView; status: OrderStatus }) => {
    setLoading(true);
    setError(null);
    try {
      const result = await request("tools/call", { name: "orders.dashboard", arguments: parameters });
      if (result.structuredContent) setData(result.structuredContent);
    } catch (toolError) {
      setError(toolError instanceof Error ? toolError.message : "MCP host tool call failed");
    } finally {
      setLoading(false);
    }
  }, [request]);

  return { data, connected, loading, error, update };
}

function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof ShoppingBag;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardDescription>{label}</CardDescription>
        <Icon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tracking-tight">{value}</div>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function Overview({ data }: { data: DashboardData }) {
  const maximum = Math.max(1, ...data.statusBreakdown.map((item) => item.count));
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={ShoppingBag} label="Orders" value={String(data.metrics.orders)} hint="Matching current parameters" />
        <MetricCard icon={CircleDollarSign} label="Revenue" value={`¥${data.metrics.revenue.toLocaleString()}`} hint="CNY demo order value" />
        <MetricCard icon={Activity} label="Paid" value={String(data.metrics.paid)} hint="Ready for downstream work" />
        <MetricCard icon={PackageCheck} label="Fulfilled" value={String(data.metrics.fulfilled)} hint="Completed demo orders" />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Status distribution</CardTitle>
          <CardDescription>Counts are recomputed from the Tool result.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {data.statusBreakdown.map((item) => (
            <div className="grid grid-cols-[82px_1fr_24px] items-center gap-3" key={item.status}>
              <span className="text-sm capitalize">{item.status}</span>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(item.count / maximum) * 100}%` }} />
              </div>
              <span className="text-right text-sm font-semibold">{item.count}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Orders({ data }: { data: DashboardData }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Order list</CardTitle>
        <CardDescription>{data.orders.length} rows returned for {statusLabels[data.parameters.status].toLowerCase()}.</CardDescription>
      </CardHeader>
      <CardContent>
        {data.orders.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">No demo orders match this parameter set.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.orders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-mono text-xs">{order.id}</TableCell>
                  <TableCell className="font-medium">{order.customer}</TableCell>
                  <TableCell><Badge variant={statusVariants[order.status]}>{order.status}</Badge></TableCell>
                  <TableCell className="text-right font-semibold">{order.currency} {order.total.toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function Status({ data }: { data: DashboardData }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {data.statusBreakdown.map((item) => (
        <Card key={item.status}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <Badge variant={statusVariants[item.status]}>{item.status}</Badge>
              <ArrowUpRight className="size-4 text-muted-foreground" />
            </div>
            <CardTitle className="pt-4 text-3xl">{item.count}</CardTitle>
            <CardDescription>orders in this lifecycle state</CardDescription>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}

export function App() {
  const { data, connected, loading, error, update } = useMcpApp();
  const view = data?.parameters.view ?? "overview";
  const status = data?.parameters.status ?? "all";

  return (
    <main className="min-h-screen bg-background p-4 text-foreground sm:p-6">
      <div className="mx-auto grid max-w-5xl gap-5">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Badge variant="outline"><LayoutDashboard className="mr-1 size-3" /> MCP App</Badge>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={`size-2 rounded-full ${connected ? "bg-emerald-500" : "bg-amber-500"}`} />
                {connected ? "Host connected" : "Connecting"}
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{data?.headline ?? "Orders dashboard"}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{data?.summary ?? "Waiting for the initial Tool result…"}</p>
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={status}
              onValueChange={(next) => void update({ view, status: next as OrderStatus })}
              disabled={!data || loading}
            >
              <SelectTrigger aria-label="Filter order status"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(statusLabels) as OrderStatus[]).map((value) => (
                  <SelectItem value={value} key={value}>{statusLabels[value]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              aria-label="Refresh dashboard"
              variant="outline"
              size="icon"
              disabled={!data || loading}
              onClick={() => void update({ view, status })}
            >
              <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </header>

        {error !== null && (
          <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            Host connection issue: {error}
          </div>
        )}

        {data ? (
          <Tabs
            value={view}
            onValueChange={(next) => void update({ view: next as DashboardView, status })}
          >
            <TabsList aria-label="Dashboard view">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="orders">Orders</TabsTrigger>
              <TabsTrigger value="status">Status</TabsTrigger>
            </TabsList>
            <TabsContent value="overview"><Overview data={data} /></TabsContent>
            <TabsContent value="orders"><Orders data={data} /></TabsContent>
            <TabsContent value="status"><Status data={data} /></TabsContent>
          </Tabs>
        ) : (
          <Card>
            <CardContent className="flex min-h-64 items-center justify-center text-sm text-muted-foreground">
              Waiting for <code className="mx-1 rounded bg-muted px-1.5 py-0.5">orders.dashboard</code> structured content
            </CardContent>
          </Card>
        )}

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t pt-4 text-xs text-muted-foreground">
          <span>Tool parameters: view={view}, status={status}</span>
          <span>shadcn/ui · React · Rsbuild · MCP Apps</span>
        </footer>
      </div>
    </main>
  );
}
