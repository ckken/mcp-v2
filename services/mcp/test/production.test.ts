import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createProductionFetch } from "../src/production.ts";

let webRoot = "";

beforeAll(async () => {
  webRoot = await mkdtemp(path.join(os.tmpdir(), "mcp-v2-production-"));
  await mkdir(path.join(webRoot, "static"));
  await writeFile(path.join(webRoot, "index.html"), "<!doctype html><title>MCP v2</title>");
  await writeFile(path.join(webRoot, "static", "app.js"), "console.log('mcp-v2')");
});

afterAll(async () => {
  await rm(webRoot, { recursive: true, force: true });
});

describe("production fetch", () => {
  const backendFetch = (request: Request) => Response.json({ delegated: new URL(request.url).pathname });

  test("delegates API and MCP requests to the runtime", async () => {
    const fetch = createProductionFetch({ webRoot, backendFetch });
    const apiResponse = await fetch(new Request("http://example.test/api/status"));
    expect(await apiResponse.json()).toEqual({ delegated: "/api/status" });
    const mcpResponse = await fetch(new Request("http://example.test/mcp", { method: "POST" }));
    expect(await mcpResponse.json()).toEqual({ delegated: "/mcp" });
  });

  test("serves the SPA and immutable built assets", async () => {
    const fetch = createProductionFetch({ webRoot, backendFetch });
    const index = await fetch(new Request("http://example.test/", { headers: { accept: "text/html" } }));
    expect(index.status).toBe(200);
    expect(index.headers.get("cache-control")).toBe("no-cache");
    expect(await index.text()).toContain("<title>MCP v2</title>");

    const asset = await fetch(new Request("http://example.test/static/app.js"));
    expect(asset.status).toBe(200);
    expect(asset.headers.get("cache-control")).toContain("immutable");
    expect(await asset.text()).toContain("mcp-v2");
  });

  test("falls back only for browser navigation", async () => {
    const fetch = createProductionFetch({ webRoot, backendFetch });
    expect((await fetch(new Request("http://example.test/scenes/loop", {
      headers: { accept: "text/html" },
    }))).status).toBe(200);
    expect((await fetch(new Request("http://example.test/missing.js"))).status).toBe(404);
    expect((await fetch(new Request("http://example.test/", { method: "PUT" }))).status).toBe(405);
  });
});
