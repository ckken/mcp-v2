import { describe, expect, test } from "bun:test";
import {
  mcpAppBridgeMessageSchema, orderQuerySchema, serviceHealthFixture, serviceHealthSchema,
  scenarioEntryDefinitionSchema, scenarioEntryRequestSchema, scenarioReportSchema,
  skillFixture, skillManifestSchema, verificationRunFixture, verificationRunSchema,
} from "../src/index.ts";

describe("shared runtime contracts", () => {
  test("accepts the era-specific v2 compatibility fixture", () => {
    const health = serviceHealthSchema.parse(serviceHealthFixture);
    expect(health.protocol).toEqual({
      version: "2026-07-28",
      modernOnly: false,
      legacy: "stateless",
      legacyVersion: "2025-06-18",
      transport: "streamable-http",
      responseFraming: { modern: "application/json", legacy: "text/event-stream" },
      standaloneSseEndpoint: false,
      subscriptions: false,
    });
    expect(health.capabilities).toEqual({
      tools: true,
      resources: true,
      prompts: true,
      skills: true,
      apps: true,
      tasks: true,
      auth: true,
      verification: true,
    });
  });

  test("rejects an unimplemented standalone SSE endpoint", () => {
    expect(serviceHealthSchema.safeParse({
      ...serviceHealthFixture, protocol: { ...serviceHealthFixture.protocol, standaloneSseEndpoint: true },
    }).success).toBeFalse();
  });

  test("requires evidence for passed verification steps", () => {
    const run = structuredClone(verificationRunFixture);
    run.steps[0] = { ...run.steps[0]!, status: "passed" };
    expect(verificationRunSchema.safeParse(run).success).toBeFalse();
  });

  test("enforces skill input semantics", () => {
    expect(skillManifestSchema.parse(skillFixture).id).toBe("order-review");
    expect(skillManifestSchema.safeParse({ ...skillFixture, inputRequired: false }).success).toBeFalse();
  });

  test("accepts bridge calls and rejects unexpected bridge fields", () => {
    const message = { type: "mcp-app/tool-call", requestId: "f39a7b25-129d-4bc9-99a8-fd4f767d9495", tool: "orders.get", arguments: { orderId: "order-demo-001" } };
    expect(mcpAppBridgeMessageSchema.safeParse(message).success).toBeTrue();
    expect(mcpAppBridgeMessageSchema.safeParse({ ...message, token: "must-not-cross-bridge" }).success).toBeFalse();
  });

  test("requires an order query filter", () => {
    expect(orderQuerySchema.safeParse({}).success).toBeFalse();
    expect(orderQuerySchema.safeParse({ orderId: "order-demo-001" }).success).toBeTrue();
  });

  test("bounds dynamic scenario entries and their live discovery source", () => {
    expect(scenarioEntryRequestSchema.parse({
      trigger: "ui",
      protocolMode: "modern",
      selection: "orders.search",
      parameters: { query: "northwind", taskLifecycle: false },
    })).toMatchObject({ protocolMode: "modern", selection: "orders.search" });
    expect(scenarioEntryRequestSchema.safeParse({
      parameters: Object.fromEntries(Array.from({ length: 17 }, (_, index) => [`field${index}`, index])),
    }).success).toBeFalse();
    expect(scenarioEntryDefinitionSchema.safeParse({
      scenarioId: "tools",
      fields: [],
      supportedTriggers: ["ui"],
      discovery: {
        protocolVersions: ["2026-07-28"],
        tools: ["system.health"],
        prompts: [],
        resources: [],
        extensions: ["com.kenvoai.mcp-v2.dynamic-entry"],
      },
      cache: {
        discover: { ttlMs: 30_000, cacheScope: "public" },
        tools: { ttlMs: 30_000, cacheScope: "public" },
      },
    }).success).toBeTrue();
  });

  test("requires scenario reports to expose entry gates and the actual route", () => {
    const report = {
      runId: "scene_tools_demo",
      scenarioId: "tools",
      status: "passed",
      startedAt: "2026-07-30T00:00:00.000Z",
      finishedAt: "2026-07-30T00:00:01.000Z",
      entry: {
        trigger: "ui",
        protocolMode: "auto",
        selection: "system.health",
        parameters: {},
        traceparent: "00-0123456789abcdef0123456789abcdef-0123456789abcdef-01",
        discovery: {
          protocolVersions: ["2026-07-28"],
          tools: ["system.health"],
          prompts: [],
          resources: [],
          extensions: ["com.kenvoai.mcp-v2.dynamic-entry"],
        },
        cache: {
          discover: { ttlMs: 30_000, cacheScope: "public" },
          tools: { ttlMs: 30_000, cacheScope: "public" },
        },
        gates: [{ id: "entry.discovery", label: "发现", status: "passed", detail: "ok" }],
      },
      route: ["tools.discover"],
      steps: [{
        id: "tools.discover",
        title: "发现",
        status: "passed",
        durationMs: 1,
        detail: "ok",
        evidence: ["tools=13"],
      }],
    };
    expect(scenarioReportSchema.safeParse(report).success).toBeTrue();
    expect(scenarioReportSchema.safeParse({ ...report, route: [] }).success).toBeFalse();
    expect(scenarioReportSchema.safeParse({ ...report, route: ["tools.other"] }).success).toBeFalse();
  });
});
