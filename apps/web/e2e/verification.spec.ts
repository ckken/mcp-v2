import { expect, test } from "@playwright/test";

test("runs a real modern-only verification and renders its evidence", async ({ page }) => {
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
    legacy: "reject",
    sse: false,
  });
});

test("renders the sandboxed MCP App bridge and remains usable at 390px", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "MCP Apps" }).click();
  await expect(page.getByText("Sandbox app handshake received")).toBeVisible();

  const frame = page.frameLocator('iframe[title="Sandbox MCP App demo"]');
  await frame.getByRole("button", { name: "Send bridge event" }).click();
  await expect(page.getByText(/Sandbox app sent an event/)).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});
