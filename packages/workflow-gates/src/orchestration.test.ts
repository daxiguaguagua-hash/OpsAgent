import assert from "node:assert/strict";
import test from "node:test";
import {
  buildExecutionBrief,
  finishTask,
  startTask,
  submitForReview,
} from "./orchestration.ts";
import {
  addTestEvidence,
  createTask,
  handoffTask,
  setTestImpact,
} from "./taskState.ts";
import type { ActiveTask, RolePolicy } from "./taskTypes.ts";

const policy: RolePolicy = {
  roles: {
    architect: { actor: "gpt5.5" },
    implementer: { actor: "claude-code-deepseek" },
    tester: { actor: "claude-code-deepseek-new-context" },
    "test-strategist": { actor: "codex" },
    reviewer: { actor: "gpt5.5" },
    approver: { actor: "human" },
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
    release: {
      owner: "architect",
      executor: "implementer",
      tester: "tester",
      testStrategist: "test-strategist",
      reviewer: "reviewer",
      humanApprovalRequired: true,
    },
  },
};

test("planned task recommends completing an incomplete contract", () => {
  const task = createTask(policy, "M1-01", "Build login");
  const brief = buildExecutionBrief(task, policy);

  assert.equal(brief.actor, "gpt5.5");
  assert.match(brief.action, /Complete the task contract/);
  assert.ok(brief.suggestedCommands.some((command) => command.includes("task:scope")));
});

test("startTask requires a complete contract and hands off to implementer", () => {
  const incomplete = createTask(policy, "M1-01", "Build login");
  assert.throws(() => startTask(incomplete), /contract is incomplete/);

  const started = startTask(completeContract(incomplete));
  assert.equal(started.status, "implementing");
  assert.equal(started.currentAssignee, "implementer");
});

test("testing brief identifies the fresh Claude Code actor and review command", () => {
  const task = startTask(completeContract(createTask(policy, "M1-01", "Build login")));
  const testing = handoffTask(task, "tester", "2026-06-06T00:00:00.000Z");
  const brief = buildExecutionBrief(testing, policy);

  assert.equal(brief.actor, "claude-code-deepseek-new-context");
  assert.equal(brief.fallbackActor, undefined);
  assert.equal(brief.nextRole, "reviewer");
  assert.ok(brief.suggestedCommands.includes("pnpm task:review"));
});

test("review and finish preserve workflow gates", () => {
  const started = startTask(completeContract(createTask(policy, "M1-01", "Build login")));
  const testing = handoffTask(started, "tester", "2026-06-06T00:00:00.000Z");
  assert.throws(() => submitForReview(testing), /Test evidence/);

  const reviewed = submitForReview(addTestEvidence(testing, "pnpm test: passed"));
  const completed = finishTask(reviewed, policy);
  assert.equal(completed.status, "completed");
});

test("human approval tasks must hand off to approver before finish", () => {
  const created = createTask(policy, "R1", "Release", "release");
  const started = startTask(completeContract(created));
  const testing = handoffTask(started, "tester", "2026-06-06T00:00:00.000Z");
  const reviewed = submitForReview(addTestEvidence(testing, "release checks passed"));

  assert.throws(() => finishTask(reviewed, policy), /approver/);
  const approved = handoffTask(reviewed, "approver", "2026-06-06T00:01:00.000Z");
  assert.equal(finishTask(approved, policy).status, "completed");
});

function completeContract(task: ActiveTask): ActiveTask {
  return setTestImpact({
    ...task,
    scope: ["apps/frontend/**", "apps/backend/**"],
    acceptanceCriteria: ["User can log in"],
    testPlan: ["valid and invalid credentials"],
    verificationCommands: ["pnpm test"],
  }, "add", "Login introduces new behavior");
}
