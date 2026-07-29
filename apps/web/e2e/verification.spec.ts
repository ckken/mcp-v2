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

test("renders the sandboxed MCP App bridge and remains usable at 390px", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "MCP Apps" }).click();
  await expect(page.getByText("Tool result delivered to ui:// resource")).toBeVisible();
  await expect(page.getByText("ui://mcp-v2/orders-dashboard.html")).toBeVisible();
  await expect(page.getByText("text/html;profile=mcp-app")).toBeVisible();

  const frame = page.frameLocator('iframe[title="MCP App orders dashboard"]');
  await expect(frame.getByText("3 demo orders returned by orders.dashboard")).toBeVisible();
  await frame.getByRole("button", { name: "Call orders.dashboard" }).click();
  await expect(page.getByText("Widget called orders.dashboard through host")).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});
