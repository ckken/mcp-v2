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
import { MCP_APP_MIME_TYPE, ORDERS_APP_URI, ordersAppHtml } from "./mcp-app.ts";

type ToolResult = {
  content: [{ type: "text"; text: string }];
  structuredContent: unknown;
  _meta?: Record<string, unknown>;
};

function result(value: unknown, meta?: Record<string, unknown>): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(value) }],
    structuredContent: value,
    ...(meta === undefined ? {} : { _meta: meta }),
  };
}

function tool<T extends object>(name: string, handler: (args: T) => unknown, resultMeta?: Record<string, unknown>) {
  return async (args: T): Promise<ToolResult> => {
    const startedAt = Date.now();
    const runId = "runId" in args && typeof args.runId === "string" ? args.runId : undefined;
    try {
      const value = handler(args);
      recordEvidence(runId, name, startedAt, "ok");
      return result(value, resultMeta);
    } catch (error) {
      recordEvidence(runId, name, startedAt, "error");
      throw error;
    }
  };
}

export function createDemoMcpServer() {
  const server = new McpServer({ name: "mcp-v2-demo", version: "0.1.0" });
  server.registerResource(
    "orders-dashboard-app",
    ORDERS_APP_URI,
    {
      title: "Orders dashboard MCP App",
      description: "Interactive order verification UI",
      mimeType: MCP_APP_MIME_TYPE,
    },
    async (uri) => ({
      contents: [{
        uri: uri.href,
        mimeType: MCP_APP_MIME_TYPE,
        text: ordersAppHtml,
        _meta: {
          ui: {
            prefersBorder: true,
            csp: { connectDomains: [], resourceDomains: [] },
          },
        },
      }],
    }),
  );
  server.registerTool("system.health", { description: "Return v2-first server health", inputSchema: z.object({ runId: z.string().optional() }) }, tool("system.health", () => ({ ok: true, protocolVersion: MODERN_PROTOCOL_VERSION, transport: "json-http", legacy: "stateless", sse: false })));
  server.registerTool("orders.search", { description: "Search demo orders", inputSchema: z.object({ query: z.string().optional(), runId: z.string().optional() }) }, tool("orders.search", ({ query }) => ({ orders: listOrders(query) })));
  server.registerTool(
    "orders.dashboard",
    {
      title: "Render orders dashboard",
      description: "Render the interactive MCP App for demo orders",
      inputSchema: z.object({ query: z.string().optional() }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
      _meta: {
        ui: { resourceUri: ORDERS_APP_URI },
        "ui/resourceUri": ORDERS_APP_URI,
        "openai/outputTemplate": ORDERS_APP_URI,
      },
    },
    tool(
      "orders.dashboard",
      ({ query }) => {
        const orders = listOrders(query);
        return {
          headline: "Orders dashboard",
          summary: `${orders.length} demo orders returned by orders.dashboard`,
          orders,
        };
      },
      {
        ui: { resourceUri: ORDERS_APP_URI },
        "ui/resourceUri": ORDERS_APP_URI,
        "openai/outputTemplate": ORDERS_APP_URI,
      },
    ),
  );
  server.registerTool(
    "skills.discover",
    {
      description: "Discover demo application skills",
      inputSchema: z.object({ runId: z.string().optional() }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
    },
    tool("skills.discover", () => ({ skills: discoverSkills() })),
  );
  server.registerTool(
    "skills.run",
    {
      description: "Run a read-only demo application skill",
      inputSchema: z.object({ skillId: z.string(), orderId: z.string().optional(), runId: z.string().optional() }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
    },
    tool("skills.run", ({ skillId, orderId }) => runSkill(skillId, orderId)),
  );
  server.registerTool("verification.start", { description: "Start a desensitized verification run" }, tool("verification.start", () => startVerification()));
  server.registerTool("verification.status", { description: "Read a verification run", inputSchema: z.object({ runId: z.string() }) }, tool("verification.status", ({ runId }) => {
    const run = statusVerification(runId);
    if (run === undefined) throw new Error("Unknown verification run");
    return run;
  }));
  server.registerTool("verification.finish", { description: "Finish a verification run after human confirmation", inputSchema: z.object({ runId: z.string(), confirmed: z.boolean() }) }, tool("verification.finish", ({ runId, confirmed }) => finishVerification(runId, confirmed)));
  return server;
}

export const mcpHandler = createMcpHandler(createDemoMcpServer, { legacy: "stateless", responseMode: "json" });
