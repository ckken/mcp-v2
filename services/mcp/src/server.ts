import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  MODERN_PROTOCOL_VERSION,
  discoverSkills,
  finishVerification,
  listOrders,
  recordEvidence,
  runSkill,
  startVerification,
  statusVerification
} from "./domain.ts";

type ToolResult = { content: [{ type: "text"; text: string }]; structuredContent: unknown };

function result(value: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value) }], structuredContent: value };
}

function tool<T extends object>(name: string, handler: (args: T) => unknown) {
  return async (args: T): Promise<ToolResult> => {
    const startedAt = Date.now();
    const runId = "runId" in args && typeof args.runId === "string" ? args.runId : undefined;
    try {
      const value = handler(args);
      recordEvidence(runId, name, startedAt, "ok");
      return result(value);
    } catch (error) {
      recordEvidence(runId, name, startedAt, "error");
      throw error;
    }
  };
}

export function createDemoMcpServer() {
  const server = new McpServer({ name: "mcp-v2-demo", version: "0.1.0" });
  server.registerTool("system.health", { description: "Return modern-only server health", inputSchema: z.object({ runId: z.string().optional() }) }, tool("system.health", () => ({ ok: true, protocolVersion: MODERN_PROTOCOL_VERSION, transport: "json-http", sse: false })));
  server.registerTool("orders.search", { description: "Search demo orders", inputSchema: z.object({ query: z.string().optional(), runId: z.string().optional() }) }, tool("orders.search", ({ query }) => ({ orders: listOrders(query) })));
  server.registerTool("skills.discover", { description: "Discover demo application skills", inputSchema: z.object({ runId: z.string().optional() }) }, tool("skills.discover", () => ({ skills: discoverSkills() })));
  server.registerTool("skills.run", { description: "Run a demo application skill", inputSchema: z.object({ skillId: z.string(), orderId: z.string().optional(), runId: z.string().optional() }) }, tool("skills.run", ({ skillId, orderId }) => runSkill(skillId, orderId)));
  server.registerTool("verification.start", { description: "Start a desensitized verification run" }, tool("verification.start", () => startVerification()));
  server.registerTool("verification.status", { description: "Read a verification run", inputSchema: z.object({ runId: z.string() }) }, tool("verification.status", ({ runId }) => {
    const run = statusVerification(runId);
    if (run === undefined) throw new Error("Unknown verification run");
    return run;
  }));
  server.registerTool("verification.finish", { description: "Finish a verification run after human confirmation", inputSchema: z.object({ runId: z.string(), confirmed: z.boolean() }) }, tool("verification.finish", ({ runId, confirmed }) => finishVerification(runId, confirmed)));
  return server;
}

export const mcpHandler = createMcpHandler(createDemoMcpServer, { legacy: "reject", responseMode: "json" });
