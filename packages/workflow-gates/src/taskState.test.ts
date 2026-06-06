import assert from "node:assert/strict";
import test from "node:test";
import {
  addTestEvidence,
  approveTestImpact,
  createTask,
  handoffTask,
  setTestImpact,
  transitionTask,
} from "./taskState.ts";
import type { RolePolicy } from "./taskTypes.ts";

const policy: RolePolicy = {
  roles: {
    architect: {},
    implementer: {},
    tester: {},
    "test-strategist": {},
    reviewer: {},
    approver: {},
  },
  taskPolicies: {
    implementation: {
      owner: "architect",
      executor: "implementer",
      tester: "tester",
      testStrategist: "test-strategist",
      reviewer: "reviewer",
      humanApprovalRequired: false,
    },
    testing: {
      owner: "tester",
      executor: "tester",
      tester: "tester",
      testStrategist: "test-strategist",
      reviewer: "reviewer",
      humanApprovalRequired: false,
    },
  },
};

test("createTask applies the implementation role policy", () => {
  const task = createTask(policy, "M1-01", "Build health API");

  assert.equal(task.currentAssignee, "architect");
  assert.equal(task.executor, "implementer");
  assert.equal(task.tester, "tester");
  assert.equal(task.testStrategist, "test-strategist");
  assert.equal(task.testImpact.consensus, "pending");
});

test("handoff follows implementer and tester workflow", () => {
  const created = createTask(policy, "M1-01", "Build health API");
  const implementing = handoffTask(created, "implementer", "2026-06-06T00:00:00.000Z");
  const testing = handoffTask(implementing, "tester", "2026-06-06T00:01:00.000Z");

  assert.equal(implementing.status, "implementing");
  assert.equal(testing.status, "testing");
  assert.equal(testing.handoffHistory.length, 2);
});

test("testing tasks can start directly with the tester role", () => {
  const created = createTask(policy, "M0-17", "Milestone acceptance", "testing");
  const testing = handoffTask(created, "tester", "2026-06-06T00:00:00.000Z");

  assert.equal(testing.status, "testing");
  assert.equal(testing.currentAssignee, "tester");
  assert.equal(testing.handoffHistory.length, 1);
});

test("ready_for_review requires approved test impact and evidence", () => {
  const created = createTask(policy, "M1-01", "Build health API");
  const implementing = transitionTask(created, "implementing");
  const testing = transitionTask(implementing, "testing");

  assert.throws(() => transitionTask(testing, "ready_for_review"), /Test impact/);

  const approved = setTestImpact(testing, "add", "New behavior needs tests");
  assert.throws(() => transitionTask(approved, "ready_for_review"), /Test evidence/);

  const evidenced = addTestEvidence(approved, "pnpm test: passed");
  assert.throws(() => transitionTask(evidenced, "ready_for_review"), /TODO placeholders/);

  const defined = {
    ...evidenced,
    scope: ["packages/workflow-gates/**"],
    acceptanceCriteria: ["CLI transitions are validated"],
    testPlan: ["valid and invalid transitions"],
    verificationCommands: ["pnpm test"],
  };
  assert.equal(transitionTask(defined, "ready_for_review").status, "ready_for_review");
});

test("invalid status transitions are blocked", () => {
  const created = createTask(policy, "M1-01", "Build health API");

  assert.throws(() => transitionTask(created, "completed"), /Invalid status transition/);
});

test("implementer test changes remain pending until test strategist approval", () => {
  const created = createTask(policy, "M1-01", "Build health API");
  const proposed = setTestImpact(created, "update", "Requirement changed", "implementer");

  assert.equal(proposed.testImpact.consensus, "pending");
  assert.equal(approveTestImpact(proposed).testImpact.consensus, "approved");
});
