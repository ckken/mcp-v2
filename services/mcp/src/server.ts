import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  MODERN_PROTOCOL_VERSION,
  cancelDemoTask,
  createDemoTask,
  discoverSkills,
  finishVerification,
  getOrdersDashboard,
  listDemoTasks,
  listOrders,
  recordEvidence,
  resultDemoTask,
  runSkill,
  startVerification,
  statusDemoTask,
  statusVerification
} from "./domain.ts";
import { getOrdersAppHtml, MCP_APP_MIME_TYPE, ORDERS_APP_URI } from "./mcp-app.ts";

type ToolResult = {
  content: [{ type: "text"; text: string }];
  structuredContent: unknown;
  _meta?: Record<string, unknown>;
};

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
  idempotentHint: true,
} as const;

const STATEFUL_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false,
  idempotentHint: false,
} as const;

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
  const server = new McpServer(
    { name: "mcp-v2-demo", version: "0.1.0" },
    {
      capabilities: {
        tools: { listChanged: false },
        resources: { listChanged: false },
        prompts: { listChanged: false },
      },
    },
  );
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
        text: await getOrdersAppHtml(),
        _meta: {
          ui: {
            prefersBorder: true,
            csp: { connectDomains: [], resourceDomains: [] },
          },
        },
      }],
    }),
  );
  server.registerPrompt(
    "order-review",
    {
      title: "Review a demo order",
      description: "Build a bounded review prompt for one demo order",
      argsSchema: z.object({ orderId: z.string().min(1) }),
    },
    ({ orderId }) => {
      const order = listOrders(orderId).find((candidate) => candidate.id === orderId);
      if (order === undefined) throw new Error("Unknown demo order");
      return {
        description: `Review ${order.id} without exposing non-demo data`,
        messages: [{
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Review demo order ${order.id}: status=${order.status}, total=${order.currency} ${order.total}. Return a concise operational summary.`,
          },
        }],
      };
    },
  );
  server.registerPrompt(
    "verification-checklist",
    {
      title: "Verification checklist",
      description: "Build the bounded checklist used before human confirmation",
      argsSchema: z.object({}),
    },
    () => ({
      messages: [{
        role: "user" as const,
        content: {
          type: "text" as const,
          text: "Verify system.health, skills.discover, orders.search and skills.run, then request human confirmation.",
        },
      }],
    }),
  );
  server.registerTool("system.health", {
    description: "Return v2-first server health",
    inputSchema: z.object({ runId: z.string().optional() }),
    annotations: READ_ONLY_ANNOTATIONS,
  }, tool("system.health", () => ({
    ok: true,
    protocolVersion: MODERN_PROTOCOL_VERSION,
    transport: "streamable-http",
    legacy: "stateless",
    responseFraming: { modern: "application/json", legacy: "text/event-stream" },
    standaloneSseEndpoint: false,
    subscriptions: false,
  })));
  server.registerTool("orders.search", {
    description: "Search demo orders",
    inputSchema: z.object({ query: z.string().optional(), runId: z.string().optional() }),
    annotations: READ_ONLY_ANNOTATIONS,
  }, tool("orders.search", ({ query }) => ({ orders: listOrders(query) })));
  server.registerTool(
    "orders.dashboard",
    {
      title: "Render orders dashboard",
      description: "Render the interactive shadcn MCP App and switch its dashboard view with Tool parameters",
      inputSchema: z.object({
        view: z.enum(["overview", "orders", "status"]).default("overview").describe("Dashboard section to render"),
        status: z.enum(["all", "paid", "pending", "fulfilled"]).default("all").describe("Order status filter"),
        query: z.string().optional().describe("Optional demo order search term"),
      }),
      annotations: READ_ONLY_ANNOTATIONS,
      _meta: {
        ui: { resourceUri: ORDERS_APP_URI },
        "ui/resourceUri": ORDERS_APP_URI,
        "openai/outputTemplate": ORDERS_APP_URI,
      },
    },
    tool(
      "orders.dashboard",
      ({ view, status, query }) => getOrdersDashboard({
        view,
        status,
        ...(query === undefined ? {} : { query }),
      }),
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
      annotations: READ_ONLY_ANNOTATIONS,
    },
    tool("skills.discover", () => ({ skills: discoverSkills() })),
  );
  server.registerTool(
    "skills.run",
    {
      description: "Run a read-only demo application skill",
      inputSchema: z.object({ skillId: z.string(), orderId: z.string().optional(), runId: z.string().optional() }),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    tool("skills.run", ({ skillId, orderId }) => runSkill(skillId, orderId)),
  );
  server.registerTool(
    "tasks.create",
    {
      description: "Create an application-level order export task",
      inputSchema: z.object({
        orderId: z.string().optional(),
        completeImmediately: z.boolean().default(false),
      }),
      annotations: STATEFUL_ANNOTATIONS,
    },
    tool("tasks.create", ({ orderId, completeImmediately }) => createDemoTask({
      ...(orderId === undefined ? {} : { orderId }),
      completeImmediately,
    })),
  );
  server.registerTool(
    "tasks.status",
    {
      description: "Read an application-level task",
      inputSchema: z.object({ taskId: z.string() }),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    tool("tasks.status", ({ taskId }) => statusDemoTask(taskId)),
  );
  server.registerTool(
    "tasks.list",
    {
      description: "List application-level tasks",
      inputSchema: z.object({}),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    tool("tasks.list", () => ({ tasks: listDemoTasks() })),
  );
  server.registerTool(
    "tasks.cancel",
    {
      description: "Cancel a pending application-level task",
      inputSchema: z.object({ taskId: z.string() }),
      annotations: STATEFUL_ANNOTATIONS,
    },
    tool("tasks.cancel", ({ taskId }) => cancelDemoTask(taskId)),
  );
  server.registerTool(
    "tasks.result",
    {
      description: "Read a completed application-level task result",
      inputSchema: z.object({ taskId: z.string() }),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    tool("tasks.result", ({ taskId }) => resultDemoTask(taskId)),
  );
  server.registerTool("verification.start", {
    description: "Start a desensitized verification run",
    annotations: STATEFUL_ANNOTATIONS,
  }, tool("verification.start", () => startVerification()));
  server.registerTool("verification.status", {
    description: "Read a verification run",
    inputSchema: z.object({ runId: z.string() }),
    annotations: READ_ONLY_ANNOTATIONS,
  }, tool("verification.status", ({ runId }) => {
    const run = statusVerification(runId);
    if (run === undefined) throw new Error("Unknown verification run");
    return run;
  }));
  server.registerTool("verification.finish", {
    description: "Finish a verification run after human confirmation",
    inputSchema: z.object({ runId: z.string(), confirmed: z.boolean() }),
    annotations: STATEFUL_ANNOTATIONS,
  }, tool("verification.finish", ({ runId, confirmed }) => finishVerification(runId, confirmed)));
  return server;
}

export const mcpHandler = createMcpHandler(createDemoMcpServer, { legacy: "stateless", responseMode: "json" });
