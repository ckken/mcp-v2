import { describe, expect, test } from "bun:test";
import { asRuns } from "../src/runs.ts";

describe("verification run projection", () => {
  test("accepts the server run shape and keeps real steps", () => {
    expect(asRuns({
      runs: [{
        runId: "run_demo",
        status: "passed",
        steps: ["system.health", "skills.discover"],
      }],
    })).toEqual([{
      id: "run_demo",
      name: "Verification run",
      status: "passed",
      steps: ["system.health", "skills.discover"],
    }]);
  });

  test("does not manufacture a successful run from malformed data", () => {
    expect(asRuns({ runs: [{ runId: "run_demo", status: "green" }] })).toEqual([]);
    expect(asRuns(undefined)).toEqual([]);
  });
});
