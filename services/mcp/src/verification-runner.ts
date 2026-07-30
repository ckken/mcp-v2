import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

export async function runVerification(mcpUrl: URL, clientName: string, authToken?: string) {
  const client = new Client(
    { name: clientName, version: "0.1.0" },
    { versionNegotiation: { mode: { pin: "2026-07-28" } } },
  );

  await client.connect(new StreamableHTTPClientTransport(mcpUrl, {
    ...(authToken === undefined ? {} : { authProvider: { token: async () => authToken } }),
  }));
  try {
    const started = await client.callTool({ name: "verification.start", arguments: {} });
    const { runId } = started.structuredContent as { runId: string };

    for (const [name, arguments_] of [
      ["system.health", { runId }],
      ["skills.discover", { runId }],
      ["orders.search", { runId, query: "demo" }],
      ["skills.run", { runId, skillId: "verification-checklist" }],
    ] as const) {
      await client.callTool({ name, arguments: arguments_ });
    }

    const finished = await client.callTool({
      name: "verification.finish",
      arguments: { runId, confirmed: true },
    });
    return finished.structuredContent;
  } finally {
    await client.close();
  }
}
