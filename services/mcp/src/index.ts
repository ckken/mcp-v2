import {
  type AuthInfo,
  OAuthError,
  OAuthErrorCode,
  requireBearerAuth,
} from "@modelcontextprotocol/server";
import { mcpHandler } from "./server.ts";
import {
  type DashboardStatus,
  type DashboardView,
  LEGACY_PROTOCOL_VERSION,
  MODERN_PROTOCOL_VERSION,
  RUNTIME_CAPABILITIES,
  discoverSkills,
  listDemoTasks,
  listOrders,
  listVerificationRuns,
  statusVerification,
} from "./domain.ts";
import { runVerification } from "./verification-runner.ts";
import { callMcpAppTool, loadMcpApp } from "./mcp-app-host.ts";
import { getLatestE2eReport, runE2eSuite } from "./e2e-runner.ts";

const port = Number.parseInt(Bun.env.PORT ?? "3001", 10);
const MCP_AUTH_SCOPE = "mcp:access";

export interface AppAuthToken {
  readonly token: string;
  readonly clientId: string;
  readonly scopes: readonly string[];
}

export interface AppAuthConfig {
  readonly tokens: readonly AppAuthToken[];
  readonly requiredScopes?: readonly string[];
}

export interface AppOptions {
  readonly auth?: AppAuthConfig;
}

function runtimeAuthConfig(): AppAuthConfig | undefined {
  const token = Bun.env.MCP_AUTH_TOKEN;
  if (token === undefined || token === "") return undefined;
  return {
    tokens: [{ token, clientId: "mcp-v2-runtime", scopes: [MCP_AUTH_SCOPE] }],
    requiredScopes: [MCP_AUTH_SCOPE],
  };
}

function createAuthGate(config: AppAuthConfig) {
  return requireBearerAuth({
    requiredScopes: [...(config.requiredScopes ?? [MCP_AUTH_SCOPE])],
    verifier: {
      async verifyAccessToken(token): Promise<AuthInfo> {
        const match = config.tokens.find((candidate) => candidate.token === token);
        if (match === undefined) throw new OAuthError(OAuthErrorCode.InvalidToken, "Unknown access token");
        return {
          token,
          clientId: match.clientId,
          scopes: [...match.scopes],
          expiresAt: Math.floor(Date.now() / 1000) + 300,
        };
      },
    },
  });
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { "cache-control": "no-store" } });
}

export function createApp(options: AppOptions = {}) {
  const auth = options.auth;
  const authGate = auth === undefined ? undefined : createAuthGate(auth);
  const internalAuthToken = auth?.tokens.find((candidate) =>
    (auth.requiredScopes ?? [MCP_AUTH_SCOPE]).every((scope) => candidate.scopes.includes(scope))
  )?.token;

  return {
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);
      if (url.pathname === "/mcp") {
        if (authGate === undefined) return mcpHandler.fetch(request);
        const authResult = await authGate(request);
        if (authResult instanceof Response) return authResult;
        return mcpHandler.fetch(request, { authInfo: authResult });
      }
      if (request.method === "POST" && url.pathname === "/api/mcp-app/call") {
        try {
          const body = await request.json() as { name?: unknown; arguments?: unknown };
          if (typeof body.name !== "string") return json({ error: "Tool name is required" }, 400);
          const args = body.arguments && typeof body.arguments === "object" ? body.arguments as Record<string, unknown> : {};
          return json(await callMcpAppTool(new URL("/mcp", url), body.name, args, internalAuthToken));
        } catch (error) {
          return json({ error: error instanceof Error ? error.message : "MCP App tool call failed" }, 400);
        }
      }
      if (request.method === "POST" && url.pathname === "/api/verification/run") {
        try {
          return json(await runVerification(new URL("/mcp", url), "web-verification-center", internalAuthToken));
        } catch (error) {
          return json({ error: error instanceof Error ? error.message : "Verification failed" }, 500);
        }
      }
      if (request.method === "POST" && url.pathname === "/api/e2e/run") {
        try {
          return json(await runE2eSuite(new URL("/mcp", url), internalAuthToken));
        } catch (error) {
          return json({ error: error instanceof Error ? error.message : "E2E suite failed" }, 500);
        }
      }
      if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
      if (url.pathname === "/api/status") {
        return json({
          ok: true,
          protocolVersion: MODERN_PROTOCOL_VERSION,
          transport: "streamable-http",
          legacy: "stateless",
          legacyProtocolVersion: LEGACY_PROTOCOL_VERSION,
          responseFraming: {
            modern: "application/json",
            legacy: "text/event-stream",
          },
          standaloneSseEndpoint: false,
          subscriptions: false,
          authConfigured: auth !== undefined,
          authMode: auth === undefined ? "disabled" : "bearer",
          taskModel: "application-tools",
          capabilities: RUNTIME_CAPABILITIES,
        });
      }
      if (url.pathname === "/api/mcp-app") {
        try {
          const view = url.searchParams.get("view");
          const status = url.searchParams.get("status");
          const parameters: { view?: DashboardView; status?: DashboardStatus } = {};
          if (view === "overview" || view === "orders" || view === "status") parameters.view = view;
          if (status === "all" || status === "paid" || status === "pending" || status === "fulfilled") parameters.status = status;
          return json(await loadMcpApp(new URL("/mcp", url), parameters, internalAuthToken));
        } catch (error) {
          return json({ error: error instanceof Error ? error.message : "MCP App load failed" }, 500);
        }
      }
      if (url.pathname === "/api/orders") return json({ orders: listOrders(url.searchParams.get("query") ?? undefined) });
      if (url.pathname === "/api/skills") return json({ skills: discoverSkills() });
      if (url.pathname === "/api/e2e/latest") return json({ report: getLatestE2eReport() ?? null });
      if (url.pathname === "/api/demo/tools") {
        return json({
          tools: [
            "system.health",
            "orders.search",
            "orders.dashboard",
            "skills.discover",
            "skills.run",
            "verification.start",
            "verification.status",
            "verification.finish",
            "tasks.create",
            "tasks.status",
            "tasks.list",
            "tasks.cancel",
            "tasks.result",
          ],
        });
      }
      if (url.pathname === "/api/demo/prompts") {
        return json({ prompts: ["order-review", "verification-checklist"] });
      }
      if (url.pathname === "/api/demo/tasks") return json({ model: "application-tools", tasks: listDemoTasks() });
      if (url.pathname === "/api/demo/skills") return json({ skills: discoverSkills() });
      if (url.pathname === "/api/verification/runs") return json({ runs: listVerificationRuns() });
      if (url.pathname.startsWith("/api/verification/")) {
        const runId = url.pathname.slice("/api/verification/".length);
        const run = statusVerification(runId);
        return run === undefined ? json({ error: "Verification run not found" }, 404) : json(run);
      }
      return json({ error: "Not found" }, 404);
    }
  };
}

const runtimeAuth = runtimeAuthConfig();
export const app = createApp(runtimeAuth === undefined ? {} : { auth: runtimeAuth });

if (import.meta.main) Bun.serve({ hostname: "0.0.0.0", port, fetch: app.fetch });
