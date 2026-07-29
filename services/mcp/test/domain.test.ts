import { expect, test } from "bun:test";
import {
  finishVerification,
  listOrders,
  recordEvidence,
  resetDemoStateForTest,
  runSkill,
  startVerification
} from "../src/domain.ts";

test("demo orders can be searched without exposing non-demo data", () => {
  expect(listOrders("northwind")).toEqual([expect.objectContaining({ id: "ord_demo_1002" })]);
  expect(listOrders("missing")).toEqual([]);
});

test("verification only passes after the expected tool chain and confirmation", () => {
  resetDemoStateForTest();
  const run = startVerification();
  for (const tool of ["system.health", "skills.discover", "orders.search", "skills.run"]) {
    recordEvidence(run.runId, tool, Date.now(), "ok");
  }
  const passed = finishVerification(run.runId, true);
  expect(passed.status).toBe("passed");
  expect(passed.confirmationReceived).toBe(true);
  expect(passed.evidence.every((entry) => !("token" in entry))).toBe(true);
});

test("unknown demo skill is rejected", () => {
  expect(() => runSkill("not-a-skill")).toThrow("Unknown demo skill");
});
