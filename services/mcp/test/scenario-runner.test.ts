import { describe, expect, test } from "bun:test";
import { createScenarioRunner } from "../src/scenario-runner.ts";

describe("scenario runner failure reports", () => {
  test("keeps a five-step closed loop and marks blocked work as skipped", async () => {
    const runner = createScenarioRunner();
    const report = await runner.runScenario("loop", new URL("http://127.0.0.1:1/mcp"));

    expect(report.status).toBe("failed");
    expect(report.entry.gates.find((gate) => gate.id === "entry.discovery")?.status).toBe("failed");
    expect(report.steps).toHaveLength(5);
    expect(report.route).toEqual(report.steps.map((step) => step.id));
    expect(report.steps[0]?.status).toBe("failed");
    expect(report.steps.slice(1).every((step) => step.status === "skipped")).toBe(true);
    expect(runner.getScenarioReport("loop")?.runId).toBe(report.runId);
  });

  test("does not coalesce concurrent runs with different dynamic entries", async () => {
    const runner = createScenarioRunner();
    const [modern, legacy] = await Promise.all([
      runner.runScenario("protocol", new URL("http://127.0.0.1:1/mcp"), undefined, {
        trigger: "api",
        protocolMode: "modern",
        parameters: {},
      }),
      runner.runScenario("protocol", new URL("http://127.0.0.1:1/mcp"), undefined, {
        trigger: "api",
        protocolMode: "legacy",
        parameters: {},
      }),
    ]);

    expect(modern.runId).not.toBe(legacy.runId);
    expect(modern.entry.protocolMode).toBe("modern");
    expect(legacy.entry.protocolMode).toBe("legacy");
  });
});
