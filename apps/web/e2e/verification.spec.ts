import { expect, test } from "@playwright/test";

test("runs a real v2-first verification and renders its evidence", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Service reachable")).toBeVisible();

  await page.getByRole("button", { name: "Run verification" }).click();
  await expect(page.getByRole("heading", { name: "Codex Session", exact: true })).toBeVisible();
  await expect(page.getByText("system.health")).toBeVisible();
  await expect(page.getByText("skills.discover")).toBeVisible();
  await expect(page.getByText(/Latest run .* is passed/)).toBeVisible();

  const statusResponse = await page.request.get("/api/status");
  expect(statusResponse.headers()["content-type"]).toContain("application/json");
  expect(statusResponse.headers()["content-type"]).not.toContain("text/event-stream");
  await expect(statusResponse.json()).resolves.toMatchObject({
    protocolVersion: "2026-07-28",
    legacy: "stateless",
    sse: false,
  });
});

test("runs and renders the complete 20-case E2E matrix", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "E2E Lab" }).click();
  await expect(page.getByRole("heading", { name: "全链路 E2E 验收" })).toBeVisible();
  await expect(page.getByAltText("Kenvo Agent Skills 狐狸 IP")).toBeVisible();
  await expect(page.getByTestId("fox-trail-canvas")).toBeVisible();
  const runE2e = page.getByRole("button", { name: "运行全部 E2E" });
  await runE2e.click();
  await expect(runE2e).toBeDisabled();
  await expect(page.getByRole("heading", { name: "狐狸正在穿越六个场景" })).toBeVisible();
  await expect(runE2e).toBeEnabled();

  await expect(page.getByRole("heading", { name: "20 个用例全部通过" })).toBeVisible();
  await expect(page.getByLabel("E2E summary")).toContainText("20");
  const sceneRail = page.getByRole("navigation", { name: "E2E 场景切换" });
  for (const group of ["Protocol", "Discovery", "Tools", "Skills", "Verification", "MCP Apps"]) {
    await expect(sceneRail.getByRole("button", { name: new RegExp(group) })).toBeVisible();
  }

  const scenes: Array<[string, string[]]> = [
    ["Protocol", ["protocol.modern", "protocol.legacy"]],
    ["Discovery", ["discovery.tools"]],
    ["Tools", ["tool.dashboard-status"]],
    ["Skills", ["skills.order-summary", "skills.checklist", "skills.unknown"]],
    ["Verification", ["verification.success", "verification.rejected"]],
    ["MCP Apps", ["mcp-app.resource"]],
  ];
  for (const [group, ids] of scenes) {
    await sceneRail.getByRole("button", { name: new RegExp(group) }).click();
    await expect(page.getByRole("heading", { name: group, exact: true })).toBeVisible();
    for (const id of ids) await expect(page.getByTestId(`e2e-case-${id}`)).toHaveClass(/passed/);
  }

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});

test("renders every dynamic MCP App view and remains usable at 390px", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "MCP Apps" }).click();
  await expect(page.getByText("Tool result delivered to ui:// resource")).toBeVisible();
  await expect(page.getByText("ui://mcp-v2/orders-dashboard.html")).toBeVisible();
  await expect(page.getByText("text/html;profile=mcp-app")).toBeVisible();

  const frameElement = page.locator('iframe[title="MCP App orders dashboard"]');
  await frameElement.scrollIntoViewIfNeeded();
  const frame = page.frameLocator('iframe[title="MCP App orders dashboard"]');
  await expect(frame.getByText("3 demo orders · view=overview · status=all")).toBeVisible();
  await frame.getByRole("tab", { name: "Orders" }).click();
  await expect(frame.getByRole("heading", { name: "Order explorer" })).toBeVisible();
  await expect(page.getByText("Widget called orders.dashboard(view=orders, status=all) through host")).toBeVisible();

  await frame.getByRole("combobox", { name: "Filter order status" }).click();
  await frame.getByRole("option", { name: "Paid", exact: true }).click();
  await expect(frame.getByText("1 demo orders · view=orders · status=paid")).toBeVisible();
  await expect(frame.getByText("ord_demo_1001")).toBeVisible();
  await expect(frame.getByText("ord_demo_1002")).toHaveCount(0);
  await expect(page.getByText("Widget called orders.dashboard(view=orders, status=paid) through host")).toBeVisible();

  await frame.getByRole("tab", { name: "Status" }).click();
  await expect(frame.getByRole("heading", { name: "Fulfillment status" })).toBeVisible();
  await expect(page.getByText("Widget called orders.dashboard(view=status, status=paid) through host")).toBeVisible();

  await frame.getByRole("combobox", { name: "Filter order status" }).click();
  await frame.getByRole("option", { name: "Fulfilled", exact: true }).click();
  await expect(frame.getByText("1 demo orders · view=status · status=fulfilled")).toBeVisible();
  await expect(page.getByText("Widget called orders.dashboard(view=status, status=fulfilled) through host")).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});
