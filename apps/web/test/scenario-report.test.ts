import { describe, expect, test } from "bun:test";
import { asScenarioReport } from "../src/scenario-report.ts";

const stepFixture = {
  id: "loop.status",
  title: "读取服务状态",
  status: "passed",
  durationMs: 3,
  detail: "MCP 服务可达",
  evidence: ["ok=true"],
};

const entryFixture = {
  trigger: "ui",
  protocolMode: "auto",
  selection: "extensions",
  parameters: {},
  traceparent: "00-0123456789abcdef0123456789abcdef-0123456789abcdef-01",
  discovery: {
    protocolVersions: ["2026-07-28"],
    tools: ["system.health"],
    prompts: ["order-review"],
    resources: ["ui://mcp-v2/orders-dashboard.html"],
    extensions: ["com.kenvoai.mcp-v2.dynamic-entry"],
  },
  cache: {
    discover: { ttlMs: 30_000, cacheScope: "public" },
    tools: { ttlMs: 30_000, cacheScope: "public" },
  },
  gates: [{
    id: "entry.discovery",
    label: "Modern 动态发现",
    status: "passed",
    detail: "1 tool",
  }],
};

function reportFixture(overrides: Record<string, unknown> = {}) {
  return {
    runId: "scene_loop_demo",
    scenarioId: "loop",
    status: "passed",
    startedAt: "2026-07-30T00:00:00.000Z",
    finishedAt: "2026-07-30T00:00:01.000Z",
    entry: entryFixture,
    route: ["loop.status"],
    steps: [stepFixture],
    ...overrides,
  };
}

describe("scenario report projection", () => {
  test("accepts a complete server report without manufacturing evidence", () => {
    expect(asScenarioReport({
      report: reportFixture(),
    })).toMatchObject({
      runId: "scene_loop_demo",
      scenarioId: "loop",
      status: "passed",
      steps: [stepFixture],
    });
  });

  test("rejects unknown scenes, missing steps and malformed evidence", () => {
    expect(asScenarioReport(reportFixture({ scenarioId: "unknown" }))).toBeNull();
    expect(asScenarioReport(reportFixture({ route: [], steps: [] }))).toBeNull();
    expect(asScenarioReport(reportFixture({
      steps: [{ ...stepFixture, evidence: [true] }],
    }))).toBeNull();
  });

  test("accepts an honest skipped step after a failure", () => {
    expect(asScenarioReport(reportFixture({
      runId: "scene_loop_failed",
      status: "failed",
      route: ["loop.status", "loop.registry"],
      steps: [
        { ...stepFixture, status: "failed", detail: "status unavailable" },
        {
          ...stepFixture,
          id: "loop.registry",
          title: "核对场景注册",
          status: "skipped",
          durationMs: 0,
          detail: "前置步骤 loop.status 失败，本步骤未执行",
          evidence: ["blockedBy=loop.status"],
        },
      ],
    }))?.steps[1]?.status).toBe("skipped");
  });
});
