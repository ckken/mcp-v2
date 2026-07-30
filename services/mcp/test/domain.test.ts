import { expect, test } from "bun:test";
import {
  cancelDemoTask,
  createDemoTask,
  finishVerification,
  getOrdersDashboard,
  listDemoTasks,
  listOrders,
  recordEvidence,
  resetDemoStateForTest,
  resultDemoTask,
  runSkill,
  startVerification,
  statusDemoTask,
} from "../src/domain.ts";

test("demo orders can be searched without exposing non-demo data", () => {
  expect(listOrders("northwind")).toEqual([expect.objectContaining({ id: "ord_demo_1002" })]);
  expect(listOrders("missing")).toEqual([]);
});

test("dashboard parameters switch the returned view and order set", () => {
  expect(getOrdersDashboard({ view: "orders", status: "paid" })).toMatchObject({
    headline: "Order explorer",
    parameters: { view: "orders", status: "paid" },
    metrics: { orders: 1, revenue: 12800, paid: 1, fulfilled: 0 },
    orders: [{ id: "ord_demo_1001", status: "paid" }],
  });
  expect(getOrdersDashboard({ view: "status", status: "fulfilled" })).toMatchObject({
    headline: "Fulfillment status",
    parameters: { view: "status", status: "fulfilled" },
    metrics: { orders: 1, fulfilled: 1 },
  });
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

test("application tasks support polling, results and cancellation", () => {
  resetDemoStateForTest();
  const pending = createDemoTask({ orderId: "ord_demo_1001" });
  expect(statusDemoTask(pending.taskId).status).toBe("pending");
  expect(cancelDemoTask(pending.taskId).status).toBe("cancelled");
  expect(() => resultDemoTask(pending.taskId)).toThrow("status=cancelled");

  const completed = createDemoTask({ orderId: "ord_demo_1002", completeImmediately: true });
  expect(resultDemoTask(completed.taskId)).toMatchObject({
    status: "completed",
    result: { format: "json", orders: [{ id: "ord_demo_1002" }] },
  });
  expect(listDemoTasks()).toHaveLength(2);
});
