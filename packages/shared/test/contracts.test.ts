import { describe, expect, test } from "bun:test";
import {
  mcpAppBridgeMessageSchema, orderQuerySchema, serviceHealthFixture, serviceHealthSchema,
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
      prompts: false,
      skills: true,
      apps: true,
      tasks: false,
      auth: false,
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
});
