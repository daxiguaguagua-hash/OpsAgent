import type { ActiveTask, RolePolicy, TaskStatus, TestImpactAction } from "./taskTypes.ts";

const transitions: Record<TaskStatus, TaskStatus[]> = {
  planned: ["implementing"],
  implementing: ["testing"],
  testing: ["implementing", "ready_for_review"],
  ready_for_review: ["implementing", "testing", "completed"],
  completed: [],
};

const handoffStatus: Record<string, TaskStatus | undefined> = {
  architect: "planned",
  implementer: "implementing",
  tester: "testing",
  reviewer: "ready_for_review",
  approver: "ready_for_review",
};

export function createTask(
  policy: RolePolicy,
  id: string,
  title: string,
  taskType = "implementation",
): ActiveTask {
  const taskPolicy = policy.taskPolicies?.[taskType];
  if (!taskPolicy) {
    throw new Error(`Unknown task type: ${taskType}`);
  }

  const owner = requiredRole(taskPolicy.owner, "owner");
  const executor = requiredRole(taskPolicy.executor, "executor");
  const tester = requiredRole(taskPolicy.tester, "tester");
  const testStrategist = requiredRole(taskPolicy.testStrategist, "testStrategist");
  const reviewer = requiredRole(taskPolicy.reviewer, "reviewer");

  return {
    id,
    title,
    taskType,
    status: "planned",
    owner,
    executor,
    tester,
    testStrategist,
    reviewer,
    humanApprover: "approver",
    currentAssignee: owner,
    scope: ["TODO: define scope"],
    acceptanceCriteria: ["TODO: define acceptance criteria"],
    testImpact: {
      action: "none",
      rationale: "Pending Codex test impact analysis",
      proposedBy: testStrategist,
      reviewedBy: testStrategist,
      consensus: "pending",
    },
    testPlan: ["TODO: define test plan"],
    verificationCommands: ["pnpm check-types"],
    testEvidence: [],
    handoffHistory: [],
  };
}

export function transitionTask(task: ActiveTask, nextStatus: TaskStatus): ActiveTask {
  if (!transitions[task.status].includes(nextStatus)) {
    throw new Error(`Invalid status transition: ${task.status} -> ${nextStatus}`);
  }

  if (nextStatus === "ready_for_review") {
    assertReadyForReview(task);
  }

  return { ...task, status: nextStatus };
}

export function handoffTask(task: ActiveTask, nextRole: string, at = new Date().toISOString()): ActiveTask {
  const knownRoles = [
    task.owner,
    task.executor,
    task.tester,
    task.testStrategist,
    task.reviewer,
    task.humanApprover,
  ];
  if (!knownRoles.includes(nextRole)) {
    throw new Error(`Unknown task role: ${nextRole}`);
  }

  const desiredStatus = handoffStatus[nextRole];
  let nextTask = task;
  if (desiredStatus && desiredStatus !== task.status) {
    nextTask = task.status === "planned" && desiredStatus === "testing"
      ? transitionTask(transitionTask(task, "implementing"), "testing")
      : transitionTask(task, desiredStatus);
  }

  return {
    ...nextTask,
    currentAssignee: nextRole,
    handoffHistory: [
      ...task.handoffHistory,
      { from: task.currentAssignee, to: nextRole, at },
    ],
  };
}

export function setTestImpact(
  task: ActiveTask,
  action: TestImpactAction,
  rationale: string,
  proposedBy = "test-strategist",
): ActiveTask {
  return {
    ...task,
    testImpact: {
      action,
      rationale,
      proposedBy,
      reviewedBy: task.testStrategist,
      consensus: proposedBy === task.testStrategist ? "approved" : "pending",
    },
  };
}

export function approveTestImpact(task: ActiveTask): ActiveTask {
  return {
    ...task,
    testImpact: {
      ...task.testImpact,
      reviewedBy: task.testStrategist,
      consensus: "approved",
    },
  };
}

export function addTestEvidence(task: ActiveTask, evidence: string): ActiveTask {
  return {
    ...task,
    testEvidence: [...task.testEvidence, evidence],
  };
}

function assertReadyForReview(task: ActiveTask): void {
  if (task.testImpact.consensus !== "approved") {
    throw new Error("Test impact must be approved before review");
  }
  if (task.testEvidence.length === 0) {
    throw new Error("Test evidence is required before review");
  }
  for (const [field, values] of [
    ["scope", task.scope],
    ["acceptanceCriteria", task.acceptanceCriteria],
    ["testPlan", task.testPlan],
    ["verificationCommands", task.verificationCommands],
  ] as const) {
    if (values.some((value) => value.startsWith("TODO:"))) {
      throw new Error(`${field} still contains TODO placeholders`);
    }
  }
}

function requiredRole(value: string | undefined, field: string): string {
  if (!value) {
    throw new Error(`Task policy is missing role: ${field}`);
  }
  return value;
}
