import { expect, test, type Page } from "@playwright/test";

async function openDashboardSection(page: Page, name: string) {
  if ((page.viewportSize()?.width ?? 1280) < 768) {
    await page.getByRole("button", { name: "切换侧边栏" }).click();
  }

  await page.getByRole("button", { name, exact: true }).click();
}

test("runs a real v2-first verification and renders its evidence", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("status", { name: "MCP 服务在线" })).toBeVisible();

  await page.getByRole("button", { name: "运行会话验证" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Codex 会话", exact: true })).toBeVisible();
  await expect(page.getByText("system.health")).toBeVisible();
  await expect(page.getByText("skills.discover")).toBeVisible();
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

  for (const [navigation, title, scene] of [
    ["01 · 协议", "协议", "SCENE 01"],
    ["02 · 工具", "工具", "SCENE 02"],
    ["03 · 技能", "技能", "SCENE 03"],
    ["04 · MCP 应用", "MCP 应用", "SCENE 04"],
    ["05 · Codex 会话", "Codex 会话", "SCENE 05"],
  ]) {
    await openDashboardSection(page, navigation);
    await expect(page.getByRole("heading", { level: 1, name: title, exact: true })).toBeVisible();
    await expect(page.locator(".scene-stage-index")).toHaveText(scene.slice(-2));
    await expect(page.locator(".scene-stage")).toHaveAttribute("data-scene", scene.slice(-2));
  }

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
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

  await frame.getByRole("combobox", { name: "Filter order status" }).click();
  await frame.getByRole("option", { name: "Paid", exact: true }).click();
  await expect(frame.getByText("1 demo orders · view=orders · status=paid")).toBeVisible();
  await expect(frame.getByText("ord_demo_1001")).toBeVisible();
  await expect(frame.getByText("ord_demo_1002")).toHaveCount(0);
  await expect(page.getByText("组件已通过宿主调用 orders.dashboard（view=orders，status=paid）")).toBeVisible();

  await frame.getByRole("tab", { name: "Status" }).click();
  await expect(frame.getByRole("heading", { name: "Fulfillment status" })).toBeVisible();
  await expect(page.getByText("组件已通过宿主调用 orders.dashboard（view=status，status=paid）")).toBeVisible();

  await frame.getByRole("combobox", { name: "Filter order status" }).click();
  await frame.getByRole("option", { name: "Fulfilled", exact: true }).click();
  await expect(frame.getByText("1 demo orders · view=status · status=fulfilled")).toBeVisible();
  await expect(page.getByText("组件已通过宿主调用 orders.dashboard（view=status，status=fulfilled）")).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});
