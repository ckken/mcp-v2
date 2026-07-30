import {
  TRACEPARENT_META_KEY,
  acceptedContent,
  createMcpHandler,
  createRequestStateCodec,
  fromJsonSchema,
  inputRequired,
  McpServer,
  type ServerContext,
} from "@modelcontextprotocol/server";
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

const TRACE_EVIDENCE_META_KEY = "com.kenvoai/traceparent";

const demoOrderSchema = z.object({
  id: z.string(),
  customer: z.string(),
  status: z.enum(["paid", "pending", "fulfilled"]),
  total: z.number().int().nonnegative(),
  currency: z.literal("CNY"),
});

const demoTaskSchema = z.object({
  taskId: z.string(),
  type: z.literal("order-export"),
  status: z.enum(["pending", "completed", "cancelled"]),
  orderId: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  result: z.object({
    format: z.literal("json"),
    orders: z.array(demoOrderSchema),
  }).optional(),
});

const verificationRunSchema = z.object({
  runId: z.string(),
  status: z.enum(["started", "passed", "failed"]),
  startedAt: z.string(),
  finishedAt: z.string().optional(),
  confirmationReceived: z.boolean(),
  steps: z.array(z.string()),
  evidence: z.array(z.object({
    tool: z.string(),
    requestId: z.string(),
    durationMs: z.number().nonnegative(),
    status: z.enum(["ok", "error"]),
  })),
});

type VerificationRequestState = {
  kind: "verification-confirmation";
  runId: string;
};

function requestStateSecret(): string | Uint8Array {
  const configured = process.env.MCP_REQUEST_STATE_SECRET;
  if (configured !== undefined && new TextEncoder().encode(configured).byteLength >= 32) {
    return configured;
  }
  return crypto.getRandomValues(new Uint8Array(32));
}

const verificationRequestState = createRequestStateCodec<VerificationRequestState>({
  key: requestStateSecret(),
  ttlSeconds: 300,
  bind: (context) => `${context.mcpReq.method}\0${context.http?.authInfo?.clientId ?? ""}`,
});

function result(value: unknown, meta?: Record<string, unknown>): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(value) }],
    structuredContent: value,
    ...(meta === undefined ? {} : { _meta: meta }),
  };
}

function tool<T extends object>(name: string, handler: (args: T) => unknown, resultMeta?: Record<string, unknown>) {
  return async (args: T, context: ServerContext): Promise<ToolResult> => {
    const startedAt = Date.now();
    const runId = typeof args === "object"
      && args !== null
      && "runId" in args
      && typeof args.runId === "string"
      ? args.runId
      : undefined;
    const traceparent = context.mcpReq._meta?.[TRACEPARENT_META_KEY];
    const meta = {
      ...resultMeta,
      ...(typeof traceparent === "string" ? { [TRACE_EVIDENCE_META_KEY]: traceparent } : {}),
    };
    try {
      const value = handler(args);
      recordEvidence(runId, name, startedAt, "ok");
      return result(value, Object.keys(meta).length === 0 ? undefined : meta);
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
        extensions: {
          "com.kenvoai.mcp-v2.dynamic-entry": {
            version: "1.0.0",
            features: ["server-discovery", "trace-context", "input-required"],
          },
        },
      },
      cacheHints: {
        "server/discover": { ttlMs: 30_000, cacheScope: "public" },
        "tools/list": { ttlMs: 30_000, cacheScope: "public" },
        "prompts/list": { ttlMs: 30_000, cacheScope: "public" },
        "resources/list": { ttlMs: 30_000, cacheScope: "public" },
        "resources/read": { ttlMs: 60_000, cacheScope: "public" },
      },
      inputRequired: {
        maxRounds: 2,
        roundTimeoutMs: 120_000,
      },
      requestState: {
        verify: verificationRequestState.verify,
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
      cacheHint: { ttlMs: 60_000, cacheScope: "public" },
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
    outputSchema: z.object({
      ok: z.literal(true),
      protocolVersion: z.string(),
      transport: z.literal("streamable-http"),
      legacy: z.literal("stateless"),
      responseFraming: z.object({ modern: z.string(), legacy: z.string() }),
      standaloneSseEndpoint: z.boolean(),
      subscriptions: z.boolean(),
    }),
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
    inputSchema: fromJsonSchema<{ query?: string; runId?: string }>({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        query: { $ref: "#/$defs/searchTerm" },
        runId: { type: "string" },
      },
      $defs: {
        searchTerm: { type: "string", minLength: 1, maxLength: 120 },
      },
      allOf: [{
        if: { required: ["query"] },
        then: { properties: { query: { minLength: 1 } } },
      }],
      additionalProperties: false,
    }),
    outputSchema: z.object({ orders: z.array(demoOrderSchema) }),
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
      outputSchema: z.object({
        headline: z.string(),
        summary: z.string(),
        parameters: z.object({
          view: z.enum(["overview", "orders", "status"]),
          status: z.enum(["all", "paid", "pending", "fulfilled"]),
        }),
        metrics: z.object({
          orders: z.number().int().nonnegative(),
          revenue: z.number().int().nonnegative(),
          paid: z.number().int().nonnegative(),
          fulfilled: z.number().int().nonnegative(),
        }),
        statusBreakdown: z.array(z.object({
          status: z.enum(["paid", "pending", "fulfilled"]),
          count: z.number().int().nonnegative(),
        })),
        orders: z.array(demoOrderSchema),
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
      outputSchema: z.object({
        skills: z.array(z.object({
          id: z.string(),
          title: z.string(),
          description: z.string(),
          inputRequired: z.boolean(),
        })),
      }),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    tool("skills.discover", () => ({ skills: discoverSkills() })),
  );
  server.registerTool(
    "skills.run",
    {
      description: "Run a read-only demo application skill",
      inputSchema: z.object({ skillId: z.string(), orderId: z.string().optional(), runId: z.string().optional() }),
      outputSchema: z.object({
        skillId: z.string(),
        output: z.union([
          z.object({ summary: z.string() }),
          z.object({ checklist: z.array(z.string()) }),
        ]),
        inputRequired: z.boolean(),
      }),
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
      outputSchema: demoTaskSchema,
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
      outputSchema: demoTaskSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    tool("tasks.status", ({ taskId }) => statusDemoTask(taskId)),
  );
  server.registerTool(
    "tasks.list",
    {
      description: "List application-level tasks",
      inputSchema: z.object({}),
      outputSchema: z.object({ tasks: z.array(demoTaskSchema) }),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    tool("tasks.list", () => ({ tasks: listDemoTasks() })),
  );
  server.registerTool(
    "tasks.cancel",
    {
      description: "Cancel a pending application-level task",
      inputSchema: z.object({ taskId: z.string() }),
      outputSchema: demoTaskSchema,
      annotations: STATEFUL_ANNOTATIONS,
    },
    tool("tasks.cancel", ({ taskId }) => cancelDemoTask(taskId)),
  );
  server.registerTool(
    "tasks.result",
    {
      description: "Read a completed application-level task result",
      inputSchema: z.object({ taskId: z.string() }),
      outputSchema: z.object({
        taskId: z.string(),
        status: z.literal("completed"),
        result: z.object({
          format: z.literal("json"),
          orders: z.array(demoOrderSchema),
        }),
      }),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    tool("tasks.result", ({ taskId }) => resultDemoTask(taskId)),
  );
  server.registerTool("verification.start", {
    description: "Start a desensitized verification run",
    inputSchema: z.object({}),
    outputSchema: verificationRunSchema,
    annotations: STATEFUL_ANNOTATIONS,
  }, tool("verification.start", () => startVerification()));
  server.registerTool("verification.status", {
    description: "Read a verification run",
    inputSchema: z.object({ runId: z.string() }),
    outputSchema: verificationRunSchema,
    annotations: READ_ONLY_ANNOTATIONS,
  }, tool("verification.status", ({ runId }) => {
    const run = statusVerification(runId);
    if (run === undefined) throw new Error("Unknown verification run");
    return run;
  }));
  server.registerTool("verification.finish", {
    description: "Finish a verification run after human confirmation",
    inputSchema: z.object({ runId: z.string(), confirmed: z.boolean().optional() }),
    outputSchema: verificationRunSchema,
    annotations: STATEFUL_ANNOTATIONS,
  }, async ({ runId, confirmed }, context) => {
    const accepted = acceptedContent(
      context.mcpReq.inputResponses,
      "confirmation",
      z.object({ confirmed: z.boolean() }),
    );
    const state = context.mcpReq.requestState<VerificationRequestState>();
    if (state !== undefined && (state.kind !== "verification-confirmation" || state.runId !== runId)) {
      throw new Error("Verification request state does not match the active run");
    }
    const resolvedConfirmation = confirmed ?? accepted?.confirmed;
    if (resolvedConfirmation === undefined) {
      return inputRequired({
        inputRequests: {
          confirmation: inputRequired.elicit({
            message: `Confirm completion of desensitized verification run ${runId}`,
            requestedSchema: z.object({ confirmed: z.boolean() }),
          }),
        },
        requestState: await verificationRequestState.mint({
          kind: "verification-confirmation",
          runId,
        }, context),
      });
    }
    return result(finishVerification(runId, resolvedConfirmation));
  });
  return server;
}

export const mcpHandler = createMcpHandler(createDemoMcpServer, { legacy: "stateless", responseMode: "json" });
