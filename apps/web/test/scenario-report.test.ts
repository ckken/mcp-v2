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

describe("scenario report projection", () => {
  test("accepts a complete server report without manufacturing evidence", () => {
    expect(asScenarioReport({
      report: {
        runId: "scene_loop_demo",
        scenarioId: "loop",
        status: "passed",
        startedAt: "2026-07-30T00:00:00.000Z",
        finishedAt: "2026-07-30T00:00:01.000Z",
        steps: [stepFixture],
      },
    })).toMatchObject({
      runId: "scene_loop_demo",
      scenarioId: "loop",
      status: "passed",
      steps: [stepFixture],
    });
  });

  test("rejects unknown scenes, missing steps and malformed evidence", () => {
    expect(asScenarioReport({
      ...stepFixture,
      runId: "scene_unknown",
      scenarioId: "unknown",
      startedAt: "now",
      finishedAt: "now",
      steps: [stepFixture],
    })).toBeNull();
    expect(asScenarioReport({
      runId: "scene_loop_demo",
      scenarioId: "loop",
      status: "passed",
      startedAt: "now",
      finishedAt: "now",
      steps: [],
    })).toBeNull();
    expect(asScenarioReport({
      runId: "scene_loop_demo",
      scenarioId: "loop",
      status: "passed",
      startedAt: "now",
      finishedAt: "now",
      steps: [{ ...stepFixture, evidence: [true] }],
    })).toBeNull();
  });

  test("accepts an honest skipped step after a failure", () => {
    expect(asScenarioReport({
      runId: "scene_loop_failed",
      scenarioId: "loop",
      status: "failed",
      startedAt: "now",
      finishedAt: "now",
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
    })?.steps[1]?.status).toBe("skipped");
  });
});
