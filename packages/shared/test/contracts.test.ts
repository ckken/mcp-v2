import { describe, expect, test } from "bun:test";
import {
  mcpAppBridgeMessageSchema, orderQuerySchema, serviceHealthFixture, serviceHealthSchema,
  skillFixture, skillManifestSchema, verificationRunFixture, verificationRunSchema,
} from "../src/index.ts";

describe("shared runtime contracts", () => {
  test("accepts the modern JSON-only health fixture", () => {
    expect(serviceHealthSchema.parse(serviceHealthFixture).protocol).toEqual({
      version: "2026-07-28", modernOnly: true, legacy: "reject", transport: "json-http", sse: false,
    });
  });

  test("rejects legacy and SSE protocol declarations", () => {
    expect(serviceHealthSchema.safeParse({
      ...serviceHealthFixture, protocol: { ...serviceHealthFixture.protocol, sse: true },
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
