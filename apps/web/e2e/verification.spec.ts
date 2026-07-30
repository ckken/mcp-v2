import { expect, test, type FrameLocator, type Locator, type Page } from "@playwright/test";

async function openDashboardSection(page: Page, name: string) {
  if ((page.viewportSize()?.width ?? 1280) < 768) {
    await page.getByRole("button", { name: "切换侧边栏" }).click();
  }

  await page.getByRole("button", { name, exact: true }).click();
}

async function selectDashboardStatus(frameElement: Locator, frame: FrameLocator, name: "Paid" | "Fulfilled") {
  await frameElement.evaluate((element) => {
    const top = element.getBoundingClientRect().top + window.scrollY - 60;
    window.scrollTo({ top, behavior: "instant" });
  });
  await expect.poll(async () => (await frameElement.boundingBox())?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(140);
  await frame.getByRole("combobox", { name: "Filter order status" }).click();
  await frame.getByRole("option", { name, exact: true }).click();
}

test("runs a real v2-first verification and renders its evidence", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("status", { name: "MCP 服务在线" })).toBeVisible();

  await openDashboardSection(page, "05 · Codex 会话");
  await page.getByRole("button", { name: "运行会话验证" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Codex 会话", exact: true })).toBeVisible();
  await expect(page.getByTestId("scenario-workflow-codex").locator(".scenario-edge-running")).toBeVisible();
  await expect(page.getByTestId("scenario-workflow-codex").getByText("闭环已通过", { exact: true })).toBeVisible();
  await expect(page.getByTestId("scenario-workflow-codex").getByText("system.health")).toBeVisible();
  await expect(page.getByTestId("scenario-workflow-codex").getByText("skills.discover")).toBeVisible();
  await expect(page.getByText(/最近一次执行 .*状态为 passed/)).toBeVisible();

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

test("renders every navigation entry as an independent scene", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("总览", { exact: true })).toHaveCount(0);
  await expect(page.getByText("全链路验收", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("MCP 服务在线");
  await expect(page.getByRole("button", { name: "刷新数据" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "运行会话验证" })).toHaveCount(0);

  for (const [navigation, title, scene, id] of [
    ["00 · 闭环实验", "闭环实验", "SCENE 00", "loop"],
    ["01 · 协议", "协议", "SCENE 01", "protocol"],
    ["02 · 工具", "工具", "SCENE 02", "tools"],
    ["03 · 技能", "技能", "SCENE 03", "skills"],
    ["04 · MCP 应用", "MCP 应用", "SCENE 04", "mcp-apps"],
    ["05 · Codex 会话", "Codex 会话", "SCENE 05", "codex"],
  ]) {
    await openDashboardSection(page, navigation);
    await expect(page.getByRole("heading", { level: 1, name: title, exact: true })).toBeVisible();
    await expect(page.locator(".scene-stage-index")).toHaveText(scene.slice(-2));
    await expect(page.locator(".scene-stage")).toHaveAttribute("data-scene", scene.slice(-2));
    await expect(page.getByTestId(`scenario-workflow-${id}`)).toBeVisible();
    await expect(page.getByTestId(`scenario-canvas-${id}`)).toBeVisible();
  }

  await expect(page.getByRole("button", { name: "刷新数据" })).toBeVisible();
  await expect(page.getByRole("button", { name: "运行会话验证" })).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});

test("keeps every animated workflow in its own closed loop", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "运行闭环自检" }).click();
  await expect(page.getByTestId("scenario-workflow-loop").locator(".scenario-edge-running")).toBeVisible();
  await expect(page.getByTestId("scenario-workflow-loop").getByText("闭环已通过", { exact: true })).toBeVisible();
  const firstLoop = await page.request.get("/api/scenarios/loop/latest").then((response) => response.json()) as {
    report?: { runId?: string };
  };
  expect(firstLoop.report?.runId).toBeTruthy();

  await openDashboardSection(page, "01 · 协议");
  await page.getByRole("button", { name: "运行协议场景" }).click();
  await expect(page.getByTestId("scenario-workflow-protocol").getByText("闭环已通过", { exact: true })).toBeVisible();

  const [loopAfterProtocol, protocolAfterRun] = await Promise.all([
    page.request.get("/api/scenarios/loop/latest").then((response) => response.json()) as Promise<{ report?: { runId?: string } }>,
    page.request.get("/api/scenarios/protocol/latest").then((response) => response.json()) as Promise<{ report?: { runId?: string } }>,
  ]);
  expect(loopAfterProtocol.report?.runId).toBe(firstLoop.report?.runId);
  expect(protocolAfterRun.report?.runId).toBeTruthy();
  expect(protocolAfterRun.report?.runId).not.toBe(firstLoop.report?.runId);
});

test("renders every dynamic MCP App view and remains usable at 390px", async ({ page }) => {
  await page.goto("/");
  await openDashboardSection(page, "04 · MCP 应用");
  await expect(page.getByText("工具结果已送达 ui:// 资源")).toBeVisible();
  await expect(page.getByText("ui://mcp-v2/orders-dashboard.html")).toBeVisible();
  await expect(page.getByText("text/html;profile=mcp-app")).toBeVisible();

  const frameElement = page.locator('iframe[title="MCP App 订单看板"]');
  await frameElement.scrollIntoViewIfNeeded();
  const frame = page.frameLocator('iframe[title="MCP App 订单看板"]');
  await expect(frame.getByText("3 demo orders · view=overview · status=all")).toBeVisible();
  await frame.getByRole("tab", { name: "Orders" }).click();
  await expect(frame.getByRole("heading", { name: "Order explorer" })).toBeVisible();
  await expect(page.getByText("组件已通过宿主调用 orders.dashboard（view=orders，status=all）")).toBeVisible();

  await selectDashboardStatus(frameElement, frame, "Paid");
  await expect(frame.getByText("1 demo orders · view=orders · status=paid")).toBeVisible();
  await expect(frame.getByText("ord_demo_1001")).toBeVisible();
  await expect(frame.getByText("ord_demo_1002")).toHaveCount(0);
  await expect(page.getByText("组件已通过宿主调用 orders.dashboard（view=orders，status=paid）")).toBeVisible();

  await frame.getByRole("tab", { name: "Status" }).click();
  await expect(frame.getByRole("heading", { name: "Fulfillment status" })).toBeVisible();
  await expect(page.getByText("组件已通过宿主调用 orders.dashboard（view=status，status=paid）")).toBeVisible();

  await selectDashboardStatus(frameElement, frame, "Fulfilled");
  await expect(frame.getByText("1 demo orders · view=status · status=fulfilled")).toBeVisible();
  await expect(page.getByText("组件已通过宿主调用 orders.dashboard（view=status，status=fulfilled）")).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});
