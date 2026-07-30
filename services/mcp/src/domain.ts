export const MODERN_PROTOCOL_VERSION = "2026-07-28";
export const LEGACY_PROTOCOL_VERSION = "2025-06-18";

export const RUNTIME_CAPABILITIES = {
  tools: true,
  resources: true,
  prompts: false,
  skills: true,
  apps: true,
  tasks: false,
  auth: false,
  verification: true,
} as const;

export type EvidenceStatus = "started" | "passed" | "failed";

export interface RunEvidence {
  readonly runId: string;
  readonly status: EvidenceStatus;
  readonly startedAt: string;
  readonly finishedAt?: string;
  readonly confirmationReceived: boolean;
  readonly steps: readonly string[];
  readonly evidence: readonly {
    readonly tool: string;
    readonly requestId: string;
    readonly durationMs: number;
    readonly status: "ok" | "error";
  }[];
}

const orders = [
  { id: "ord_demo_1001", customer: "Demo Studio", status: "paid", total: 12800, currency: "CNY" },
  { id: "ord_demo_1002", customer: "Northwind Lab", status: "pending", total: 5400, currency: "CNY" },
  { id: "ord_demo_1003", customer: "Acme Workshop", status: "fulfilled", total: 8900, currency: "CNY" }
] as const;

const skills = [
  { id: "order-summary", title: "订单摘要", description: "读取订单并生成脱敏摘要", inputRequired: false },
  { id: "verification-checklist", title: "验证清单", description: "返回人工确认前的验证步骤", inputRequired: true }
] as const;

const runs = new Map<string, RunEvidence>();

export type DashboardView = "overview" | "orders" | "status";
export type DashboardStatus = "all" | "paid" | "pending" | "fulfilled";

function now(): string {
  return new Date().toISOString();
}

function makeRunId(): string {
  return `run_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

export function listOrders(query?: string) {
  const term = query?.trim().toLowerCase();
  return term === undefined || term === ""
    ? orders
    : orders.filter((order) => `${order.id} ${order.customer} ${order.status}`.toLowerCase().includes(term));
}

export function getOrdersDashboard({
  view = "overview",
  status = "all",
  query,
}: {
  view?: DashboardView;
  status?: DashboardStatus;
  query?: string;
} = {}) {
  const matchingQuery = listOrders(query);
  const filteredOrders = status === "all"
    ? matchingQuery
    : matchingQuery.filter((order) => order.status === status);
  let revenue = 0;
  for (const order of filteredOrders) revenue += order.total;
  const metrics = {
    orders: filteredOrders.length,
    revenue,
    paid: filteredOrders.filter((order) => order.status === "paid").length,
    fulfilled: filteredOrders.filter((order) => order.status === "fulfilled").length,
  };
  const statusBreakdown = (["paid", "pending", "fulfilled"] as const).map((orderStatus) => ({
    status: orderStatus,
    count: matchingQuery.filter((order) => order.status === orderStatus).length,
  }));
  return {
    headline: view === "orders" ? "Order explorer" : view === "status" ? "Fulfillment status" : "Orders dashboard",
    summary: `${filteredOrders.length} demo orders · view=${view} · status=${status}`,
    parameters: { view, status },
    metrics,
    statusBreakdown,
    orders: filteredOrders,
  };
}

export function discoverSkills() {
  return skills;
}

export function runSkill(skillId: string, orderId?: string) {
  const skill = skills.find((candidate) => candidate.id === skillId);
  if (skill === undefined) throw new Error("Unknown demo skill");
  const order = orderId === undefined ? undefined : orders.find((candidate) => candidate.id === orderId);
  if (orderId !== undefined && order === undefined) throw new Error("Unknown demo order");
  return {
    skillId: skill.id,
    output: skill.id === "order-summary"
      ? { summary: order === undefined ? `${orders.length} demo orders available` : `${order.id}: ${order.status}` }
      : { checklist: ["system.health", "skills.discover", "orders.search", "manual confirmation"] },
    inputRequired: skill.inputRequired
  };
}

export function startVerification(): RunEvidence {
  const run: RunEvidence = {
    runId: makeRunId(),
    status: "started",
    startedAt: now(),
    confirmationReceived: false,
    steps: [],
    evidence: []
  };
  runs.set(run.runId, run);
  return run;
}

export function statusVerification(runId: string): RunEvidence | undefined {
  return runs.get(runId);
}

export function listVerificationRuns(): readonly RunEvidence[] {
  return [...runs.values()].sort((left, right) => right.startedAt.localeCompare(left.startedAt));
}

export function recordEvidence(runId: string | undefined, tool: string, startedAt: number, status: "ok" | "error") {
  if (runId === undefined) return;
  const run = runs.get(runId);
  if (run === undefined || run.status !== "started") return;
  const entry = { tool, requestId: crypto.randomUUID().slice(0, 12), durationMs: Date.now() - startedAt, status } as const;
  runs.set(runId, { ...run, steps: [...new Set([...run.steps, tool])], evidence: [...run.evidence, entry] });
}

export function finishVerification(runId: string, confirmed: boolean): RunEvidence {
  const run = runs.get(runId);
  if (run === undefined) throw new Error("Unknown verification run");
  const required = ["system.health", "skills.discover", "orders.search", "skills.run"];
  const complete = confirmed && required.every((step) => run.steps.includes(step));
  const finished: RunEvidence = {
    ...run,
    confirmationReceived: confirmed,
    status: complete ? "passed" : "failed",
    finishedAt: now()
  };
  runs.set(runId, finished);
  return finished;
}

export function resetDemoStateForTest() {
  runs.clear();
}
