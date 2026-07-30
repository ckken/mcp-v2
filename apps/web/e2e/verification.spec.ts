import { expect, test, type Page } from "@playwright/test";

async function focusFlowNode(page: Page, name: string) {
  if ((page.viewportSize()?.width ?? 1280) < 768) {
    await page.getByRole("button", { name: "切换侧边栏" }).click();
  }
  await page.getByRole("button", { name, exact: true }).click();
}

test("runs one real v2 master loop and renders six server verdicts", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("status", { name: "MCP 服务在线" })).toBeVisible();

  await page.getByRole("button", { name: "运行完整 v2 闭环" }).click();
  await expect(page.getByTestId("master-workflow").locator(".master-edge-running")).toBeVisible();
  await expect(page.getByText("六条服务端路线已闭环", { exact: true })).toBeVisible();
  await expect(page.getByTestId("master-canvas").locator(".master-node-passed")).toHaveCount(6);
  await expect(page.getByText("结论来自六份服务端报告", { exact: true })).toBeVisible();

  for (const id of ["loop", "protocol", "tools", "skills", "mcp-apps", "codex"]) {
    const response = await page.request.get(`/api/scenarios/${id}/latest`);
    expect(response.ok()).toBe(true);
    await expect(response.json()).resolves.toMatchObject({
      report: {
        scenarioId: id,
        status: "passed",
        runId: expect.any(String),
      },
    });
  }

  const statusResponse = await page.request.get("/api/status");
  expect(statusResponse.headers()["content-type"]).toContain("application/json");
  expect(statusResponse.headers()["content-type"]).not.toContain("text/event-stream");
  await expect(statusResponse.json()).resolves.toMatchObject({
    protocolVersion: "2026-07-28",
    legacy: "stateless",
    legacyProtocolVersion: "2025-06-18",
    transport: "streamable-http",
    responseFraming: {
      modern: "application/json",
      legacy: "text/event-stream",
    },
    standaloneSseEndpoint: false,
    subscriptions: false,
    capabilities: {
      tools: true,
      resources: true,
      prompts: expect.any(Boolean),
      skills: true,
      apps: true,
      tasks: expect.any(Boolean),
      auth: expect.any(Boolean),
      verification: true,
    },
  });
});

test("uses one Flow canvas instead of repeated feature and evidence cards", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: "http://127.0.0.1:3000",
  });
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: "MCP v2 主流程" })).toBeVisible();
  await expect(page.getByTestId("master-workflow")).toHaveCount(1);
  await expect(page.getByTestId("master-canvas")).toHaveCount(1);
  await expect(page.getByTestId("master-canvas").locator(".master-node")).toHaveCount(6);
  await expect(page.getByText("WHAT CHANGED IN V2", { exact: true })).toHaveCount(0);
  await expect(page.getByText("v2 新特征", { exact: true })).toHaveCount(0);
  await expect(page.getByText("选择特征，定位到实际路线节点；结论只取自服务端证据。", { exact: true })).toHaveCount(0);
  await expect(page.locator(".scenario-feature-story, .scenario-entry, .scenario-route-explorer, .scenario-evidence")).toHaveCount(0);

  const copyMcpButton = page.getByRole("button", { name: "复制 MCP 地址" });
  await expect(copyMcpButton).toHaveAttribute("title", "https://mcp-v2.kenvoai.com/mcp");
  await copyMcpButton.click();
  await expect(page.getByRole("button", { name: "MCP 地址已复制" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe("https://mcp-v2.kenvoai.com/mcp");
  await expect(page.getByRole("link", { name: "在 GitHub 查看 mcp-v2" }))
    .toHaveAttribute("href", "https://github.com/ckken/mcp-v2");

  for (const [navigation, scene, label] of [
    ["00 · 闭环实验", "00", "闭环实验"],
    ["01 · 协议", "01", "协议"],
    ["02 · 工具", "02", "工具"],
    ["03 · 技能", "03", "技能"],
    ["04 · MCP 应用", "04", "MCP 应用"],
    ["05 · Codex 会话", "05", "Codex 会话"],
  ]) {
    await focusFlowNode(page, navigation);
    await expect(page.locator(".statusbar-scene")).toContainText(`FLOW NODE ${scene}`);
    await expect(page.locator(".master-node.is-selected")).toContainText(label);
    await expect(page.getByRole("contentinfo", { name: `${label}服务端证据` })).toBeVisible();
  }

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});

test("switches the React Flow structure without treating the old concept as a request", async ({ page }) => {
  await page.goto("/");
  const before = await page.request.get("/api/scenarios/loop/latest").then((response) => response.json()) as {
    report?: { runId?: string };
  };

  const switcher = page.getByRole("group", { name: "切换 React Flow 版本路径" });
  const oldButton = switcher.getByRole("button", { name: "老版本", exact: true });
  const v2Button = switcher.getByRole("button", { name: "v2 实时闭环", exact: true });
  await expect(v2Button).toHaveAttribute("aria-pressed", "true");
  await oldButton.click();
  await expect(page.getByTestId("master-canvas")).toHaveAttribute("data-view", "old");
  await expect(page.getByTestId("master-canvas").locator(".master-node-old")).toHaveCount(4);
  await expect(page.getByTestId("master-canvas").getByText("写死能力入口")).toBeVisible();
  await expect(page.getByTestId("master-canvas").locator(".master-edge-old")).toHaveCount(3);
  await expect(page.getByText("概念对照，不发送请求", { exact: true })).toBeVisible();

  const after = await page.request.get("/api/scenarios/loop/latest").then((response) => response.json()) as {
    report?: { runId?: string };
  };
  expect(after.report?.runId).toBe(before.report?.runId);

  await page.getByRole("button", { name: "运行完整 v2 闭环" }).click();
  await expect(v2Button).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("master-canvas")).toHaveAttribute("data-view", "v2");
  await expect(page.getByTestId("master-workflow").locator(".master-edge-running")).toBeVisible();
  await expect(page.getByText("六条服务端路线已闭环", { exact: true })).toBeVisible();
});

test("keeps dynamic Tool routing real behind the consolidated Flow", async ({ page }) => {
  await page.goto("/");
  const entryResponse = await page.request.get("/api/scenarios/tools/entry");
  expect(entryResponse.ok()).toBe(true);
  const entry = await entryResponse.json() as {
    fields?: Array<{ key?: string; options?: Array<{ value?: unknown }> }>;
  };
  expect(entry.fields?.find((field) => field.key === "tool")?.options?.some(
    (option) => option.value === "orders.search",
  )).toBe(true);

  const runResponse = await page.request.post("/api/scenarios/tools/run", {
    data: {
      trigger: "ui",
      protocolMode: "auto",
      selection: "orders.search",
      parameters: { taskLifecycle: false },
    },
  });
  expect(runResponse.ok()).toBe(true);
  const executed = await runResponse.json() as {
    route?: string[];
    entry?: { selection?: string; parameters?: Record<string, unknown> };
  };
  expect(executed.entry?.selection).toBe("orders.search");
  expect(executed.entry?.parameters?.taskLifecycle).toBe(false);
  expect(executed.route).not.toContain("tools.tasks");
});

test("keeps the single master Flow readable at 390px", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("master-canvas").locator(".master-node")).toHaveCount(6);
  await expect(page.getByTestId("master-canvas").locator(".master-node").first()).toBeVisible();
  await focusFlowNode(page, "04 · MCP 应用");
  await expect(page.locator(".master-node.is-selected")).toContainText("MCP 应用");
  await expect(page.getByRole("contentinfo", { name: "MCP 应用服务端证据" })).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});
