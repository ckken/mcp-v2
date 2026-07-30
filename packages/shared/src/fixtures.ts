import type { CapabilityMatrix, ServiceHealth } from "./capabilities.ts";
import type { Order } from "./orders.ts";
import type { SkillManifest } from "./skills.ts";
import type { VerificationRun } from "./verification.ts";

export const fixtureTimestamp = "2026-07-29T00:00:00.000Z";

export const capabilityFixture: CapabilityMatrix = {
  tools: true, resources: true, prompts: true, skills: true,
  apps: true, tasks: true, auth: true, verification: true,
};

export const serviceHealthFixture: ServiceHealth = {
  status: "healthy",
  protocol: {
    version: "2026-07-28",
    modernOnly: false,
    legacy: "stateless",
    legacyVersion: "2025-06-18",
    transport: "streamable-http",
    responseFraming: { modern: "application/json", legacy: "text/event-stream" },
    standaloneSseEndpoint: false,
    subscriptions: false,
  },
  capabilities: capabilityFixture,
  checkedAt: fixtureTimestamp,
};

export const orderFixture: Order = {
  id: "order-demo-001", status: "confirmed", currency: "USD",
  lines: [{ sku: "demo-widget", name: "Demo widget", quantity: 2, unitPrice: 19.5 }],
  total: 39, createdAt: fixtureTimestamp, updatedAt: fixtureTimestamp,
};

export const skillFixture: SkillManifest = {
  id: "order-review", title: "Order review", description: "Review a demo order.",
  components: ["resource", "tool", "workflow"], inputRequired: true,
  inputs: [{ name: "orderId", description: "Order to review.", required: true }],
};

export const verificationRunFixture: VerificationRun = {
  runId: "f39a7b25-129d-4bc9-99a8-fd4f767d9495", status: "running",
  createdAt: fixtureTimestamp, updatedAt: fixtureTimestamp,
  steps: ["health_check", "skill_discovery", "order_query", "skill_execution", "human_confirmation"].map((name) => ({
    name: name as VerificationRun["steps"][number]["name"], status: "pending" as const,
    startedAt: null, finishedAt: null,
  })),
};
