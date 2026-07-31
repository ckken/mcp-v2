import { expect, test, type Page } from "@playwright/test";

async function focusRoute(page: Page, name: string) {
  if ((page.viewportSize()?.width ?? 1280) < 768) {
    await page.getByRole("button", { name: "切换侧边栏" }).click();
  }
  await page.getByRole("button", { name, exact: true }).click();
}

async function findEdgesCrossingUnrelatedNodes(page: Page) {
  return page.evaluate(() => {
    const nodes = [...document.querySelectorAll<HTMLElement>(".react-flow__node")].map((element) => ({
      id: element.dataset.id,
      rect: element.getBoundingClientRect(),
    }));

    return [...document.querySelectorAll<SVGGElement>(".react-flow__edge")].flatMap((edge) => {
      const endpoints = edge.getAttribute("aria-label")?.match(/^Edge from (.+) to (.+)$/);
      const path = edge.querySelector<SVGPathElement>(".react-flow__edge-path");
      if (endpoints === undefined || endpoints === null || path === null) return [];

      const matrix = path.getScreenCTM();
      if (matrix === null) return [];
      const length = path.getTotalLength();
      const collisions = nodes.filter(({ id, rect }) => {
        if (id === endpoints[1] || id === endpoints[2]) return false;
        for (let offset = 0; offset <= length; offset += 2) {
          const point = path.getPointAtLength(offset).matrixTransform(matrix);
          if (
            point.x > rect.left + 1
            && point.x < rect.right - 1
            && point.y > rect.top + 1
            && point.y < rect.bottom - 1
          ) return true;
        }
        return false;
      });

      return collisions.map(({ id }) => `${edge.dataset.id} crosses ${id}`);
    });
  });
}

test("runs the selected dynamic route instead of a fixed six-scene chain", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("status", { name: "MCP 服务在线" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "MCP v2 动态路由" })).toBeVisible();
  await expect(page.getByTestId("master-canvas").getByText("server/discover", { exact: true })).toBeVisible();
  await expect(page.getByTestId("master-canvas").getByText("闭环实验条件路由", { exact: true })).toBeVisible();

  const runResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/scenarios/loop/run") && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "运行当前动态闭环" }).click();
  await expect(page.getByTestId("master-workflow").locator(".master-node-running").first()).toBeVisible();
  expect((await runResponse).ok()).toBe(true);
  await expect(page.getByText("闭环实验路线已闭环", { exact: true })).toBeVisible();
  await expect(page.getByRole("contentinfo", { name: "闭环实验服务端证据" })).toContainText("scope=loop-only");

  const statusResponse = await page.request.get("/api/status");
  await expect(statusResponse.json()).resolves.toMatchObject({
    protocolVersion: "2026-07-28",
    transport: "streamable-http",
    standaloneSseEndpoint: false,
    subscriptions: false,
  });
});

test("exposes live route conditions and changes Tool content before execution", async ({ page, context }) => {
  test.setTimeout(60_000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: "http://127.0.0.1:3000",
  });
  await page.goto("/");

  await expect(page.getByTestId("master-workflow")).toHaveCount(1);
  await expect(page.getByTestId("master-canvas")).toHaveCount(1);
  await expect(page.getByText("WHAT CHANGED IN V2", { exact: true })).toHaveCount(0);
  await expect(page.locator(".scenario-feature-story, .scenario-entry, .scenario-route-explorer, .scenario-evidence")).toHaveCount(0);

  const copyMcpButton = page.getByRole("button", { name: "复制 MCP 地址" });
  await copyMcpButton.click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe("https://mcp-v2.kenvoai.com/mcp");

  for (const [navigation, scene, label] of [
    ["00 · 闭环实验", "00", "闭环实验"],
    ["01 · 协议", "01", "协议"],
    ["02 · 工具", "02", "工具"],
    ["03 · 技能", "03", "技能"],
    ["04 · MCP 应用", "04", "MCP 应用"],
    ["05 · Codex 会话", "05", "Codex 会话"],
  ]) {
    await focusRoute(page, navigation);
    await expect(page.locator(".statusbar-scene")).toContainText(`ROUTE ${scene}`);
    await expect(page.getByTestId("master-canvas").getByText(`${label}条件路由`, { exact: true })).toBeVisible();
    await expect(page.getByRole("contentinfo", { name: `${label}服务端证据` })).toBeVisible();
    await expect.poll(() => findEdgesCrossingUnrelatedNodes(page)).toEqual([]);
  }

  await focusRoute(page, "02 · 工具");
  await page.getByRole("combobox", { name: "入口 Tool" }).selectOption("orders.search");
  await page.getByRole("combobox", { name: "应用任务闭环" }).selectOption("false");
  await expect(page.getByTestId("master-canvas").getByText("调用 orders.search", { exact: true })).toBeVisible();
  await expect(page.getByTestId("master-canvas").getByText("应用任务", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("当前动态路由条件")).toContainText("THEN");

  const runResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/scenarios/tools/run") && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "运行当前动态闭环" }).click();
  const executed = await (await runResponse).json() as {
    route?: string[];
    entry?: { selection?: string; parameters?: Record<string, unknown> };
  };
  expect(executed.entry?.selection).toBe("orders.search");
  expect(executed.entry?.parameters?.taskLifecycle).toBe(false);
  expect(executed.route).not.toContain("tools.tasks");
  await expect(page.getByText("工具路线已闭环", { exact: true })).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});

test("keeps the old comparison selected and prevents a fake complete run", async ({ page }) => {
  await page.goto("/");
  const before = await page.request.get("/api/scenarios/loop/latest").then((response) => response.json()) as {
    report?: { runId?: string };
  };

  const switcher = page.getByRole("group", { name: "切换 React Flow 版本路径" });
  const oldButton = switcher.getByRole("button", { name: "老版本", exact: true });
  await oldButton.click();
  await expect(oldButton).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("master-canvas")).toHaveAttribute("data-view", "old");
  await expect(page.getByTestId("master-canvas").locator(".master-node-old")).toHaveCount(4);
  await expect(page.getByRole("button", { name: "老版本仅作概念对照" })).toBeDisabled();
  await expect(page.getByText("概念对照不发送请求；真实 Legacy 请在协议路线选择", { exact: true })).toBeVisible();

  const after = await page.request.get("/api/scenarios/loop/latest").then((response) => response.json()) as {
    report?: { runId?: string };
  };
  expect(after.report?.runId).toBe(before.report?.runId);
  await expect(page.getByTestId("master-canvas")).toHaveAttribute("data-view", "old");
});

test("renders protocol branches from the selected mode condition", async ({ page }) => {
  await page.goto("/");
  await focusRoute(page, "01 · 协议");

  const canvas = page.getByTestId("master-canvas");
  const mode = page.getByRole("combobox", { name: "协议入口" });
  await expect(mode).toHaveValue("auto");
  await expect(canvas.getByText("Modern 自包含请求", { exact: true })).toBeVisible();
  await expect(canvas.getByText("Legacy 兼容连接", { exact: true })).toBeVisible();
  await expect(canvas.getByText("mode ≠ legacy", { exact: true })).toBeVisible();
  await expect(canvas.getByText("mode ≠ modern", { exact: true })).toBeVisible();
  await expect.poll(() => findEdgesCrossingUnrelatedNodes(page)).toEqual([]);

  await mode.selectOption("modern");
  await expect(canvas.getByText("Modern 自包含请求", { exact: true })).toBeVisible();
  await expect(canvas.getByText("Legacy 兼容连接", { exact: true })).toHaveCount(0);
  await expect.poll(() => findEdgesCrossingUnrelatedNodes(page)).toEqual([]);
  const modernResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/scenarios/protocol/run") && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "运行当前动态闭环" }).click();
  const modern = await (await modernResponse).json() as { route?: string[] };
  expect(modern.route).toContain("protocol.modern");
  expect(modern.route).not.toContain("protocol.legacy");
  await expect(page.getByText("协议路线已闭环", { exact: true })).toBeVisible();

  await mode.selectOption("legacy");
  await expect(canvas.getByText("Modern 自包含请求", { exact: true })).toHaveCount(0);
  await expect(canvas.getByText("Legacy 兼容连接", { exact: true })).toBeVisible();
  await expect.poll(() => findEdgesCrossingUnrelatedNodes(page)).toEqual([]);
});

test("keeps dynamic conditions and the matched route readable at 390px", async ({ page }) => {
  await page.goto("/");
  await focusRoute(page, "04 · MCP 应用");
  await expect(page.getByRole("combobox", { name: "应用视图" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "状态过滤" })).toBeVisible();
  await page.getByRole("combobox", { name: "应用视图" }).selectOption("status");
  await page.getByRole("combobox", { name: "状态过滤" }).selectOption("fulfilled");
  await expect(page.getByTestId("master-canvas").getByText("MCP 应用条件路由", { exact: true })).toBeVisible();
  await expect(page.getByTestId("master-canvas").getByText("status / fulfilled", { exact: true })).toBeVisible();
  await expect(page.getByRole("contentinfo", { name: "MCP 应用服务端证据" })).toContainText("view=status");

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});
