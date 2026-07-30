import { expect, test, type Page } from "@playwright/test";

async function openDashboardSection(page: Page, name: string) {
  if ((page.viewportSize()?.width ?? 1280) < 768) {
    await page.getByRole("button", { name: "切换侧边栏" }).click();
  }

  await page.getByRole("button", { name, exact: true }).click();
}

test("runs a real v2-first verification and renders its evidence", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("服务可以访问")).toBeVisible();

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

test("runs and renders the complete live E2E matrix", async ({ page }) => {
  await page.goto("/");
  await openDashboardSection(page, "全链路验收");
  await expect(page.getByRole("heading", { name: "全链路 E2E 验收" })).toBeVisible();
  await expect(page.getByLabel(/条用例动效矩阵/)).toBeVisible();
  await expect(page.getByTestId("scenario-flow-canvas")).toBeVisible();
  await expect(page.locator('img[src*="agent-skills-fox"]')).toHaveCount(0);
  const runE2e = page.getByRole("button", { name: "运行全部 E2E" });
  await runE2e.click();
  await expect(runE2e).toBeDisabled();
  await expect(page.getByTestId("case-playback")).toBeVisible();
  await expect(page.locator('.case-pulse[data-state="running"]')).toBeVisible();
  await expect(runE2e).toBeEnabled();

  const latestResponse = await page.request.get("/api/e2e/latest");
  const latestPayload = await latestResponse.json() as {
    report: {
      total: number;
      passed: number;
      failed: number;
      cases: Array<{ id: string; group: string; status: "passed" | "failed" }>;
    };
  };
  const latest = latestPayload.report;
  expect(latest.total).toBeGreaterThan(0);
  expect(latest.cases).toHaveLength(latest.total);
  await expect(page.getByRole("heading", {
    name: latest.failed === 0 ? `${latest.total} 个用例全部通过` : `${latest.failed} 个用例失败`,
  })).toBeVisible();
  await expect(page.getByLabel("E2E summary")).toContainText(String(latest.total));
  await expect(page.locator('.case-pulse[data-state="passed"]')).toHaveCount(latest.passed);
  await expect(page.locator('.case-pulse[data-state="failed"]')).toHaveCount(latest.failed);
  const sceneRail = page.getByRole("navigation", { name: "E2E 场景切换" });
  for (const group of ["Protocol", "Discovery", "Tools", "Skills", "Verification", "MCP Apps"]) {
    await expect(sceneRail.getByRole("button", { name: new RegExp(group) })).toBeVisible();
  }

  for (const group of ["Protocol", "Discovery", "Tools", "Skills", "Verification", "MCP Apps"]) {
    const ids = latest.cases.filter((item) => item.group === group).map((item) => item.id);
    expect(ids.length).toBeGreaterThan(0);
    await sceneRail.getByRole("button", { name: new RegExp(group) }).click();
    await expect(page.getByRole("heading", { name: group, exact: true })).toBeVisible();
    for (const id of ids) {
      const expected = latest.cases.find((item) => item.id === id)?.status;
      expect(expected).toBeDefined();
      await expect(page.getByTestId(`case-pulse-${id}`)).toHaveAttribute("data-state", expected!);
      await expect(page.getByTestId(`e2e-case-${id}`)).toHaveClass(new RegExp(expected!));
    }
  }

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});

test("renders every dynamic MCP App view and remains usable at 390px", async ({ page }) => {
  await page.goto("/");
  await openDashboardSection(page, "MCP 应用");
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
