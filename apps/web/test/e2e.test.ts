import { describe, expect, test } from "bun:test";
import { asE2eReport } from "../src/e2e.ts";

const caseFixture = {
  id: "tool.health",
  group: "Tools",
  title: "system.health",
  status: "passed",
  durationMs: 2,
  detail: "ok",
  evidence: ["ok=true"],
};

describe("E2E report projection", () => {
  test("accepts a complete live report", () => {
    expect(asE2eReport({
      report: {
        runId: "e2e_demo",
        status: "passed",
        startedAt: "2026-07-30T00:00:00.000Z",
        finishedAt: "2026-07-30T00:00:01.000Z",
        protocolVersion: "2026-07-28",
        total: 1,
        passed: 1,
        failed: 0,
        cases: [caseFixture],
      },
    })?.cases).toEqual([caseFixture]);
  });

  test("rejects partial or manufactured reports", () => {
    expect(asE2eReport({ report: { status: "passed", cases: [] } })).toBeNull();
    expect(asE2eReport({
      runId: "e2e_demo",
      status: "passed",
      startedAt: "now",
      finishedAt: "now",
      protocolVersion: "2026-07-28",
      total: 1,
      passed: 1,
      failed: 0,
      cases: [],
    })).toBeNull();
  });
});
