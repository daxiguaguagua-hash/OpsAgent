import { handoffTask, transitionTask } from "./taskState.ts";
import type {
  ActiveTask,
  ExecutionBrief,
  RolePolicy,
  TaskPolicy,
} from "./taskTypes.ts";

export function startTask(task: ActiveTask): ActiveTask {
  assertTaskContractReady(task);
  return handoffTask(task, task.executor);
}

export function submitForReview(task: ActiveTask): ActiveTask {
  if (task.currentAssignee !== task.tester) {
    throw new Error("Only the tester stage can submit a task for review");
  }
  return handoffTask(task, task.reviewer);
}

export function finishTask(task: ActiveTask, policy: RolePolicy): ActiveTask {
  const taskPolicy = getTaskPolicy(task, policy);
  const expectedRole = taskPolicy.humanApprovalRequired
    ? task.humanApprover
    : task.reviewer;

  if (task.currentAssignee !== expectedRole) {
    throw new Error(`Task completion requires currentAssignee='${expectedRole}'`);
  }
  return transitionTask(task, "completed");
}

export function buildExecutionBrief(
  task: ActiveTask,
  policy: RolePolicy,
): ExecutionBrief {
  const taskPolicy = getTaskPolicy(task, policy);
  const currentActor = getActor(policy, task.currentAssignee);
  const base = {
    taskId: task.id,
    status: task.status,
    currentRole: task.currentAssignee,
    actor: currentActor.actor,
    fallbackActor: currentActor.fallbackActor,
  };

  if (task.status === "planned") {
    const missing = findContractProblems(task);
    if (missing.length > 0) {
      return {
        ...base,
        action: `Complete the task contract: ${missing.join(", ")}`,
        suggestedCommands: contractCommands(missing),
        prompt: architectPrompt(task, missing),
      };
    }

    const nextActor = getActor(policy, task.executor);
    return {
      ...base,
      nextRole: task.executor,
      nextActor: nextActor.actor,
      action: "Start implementation and hand the approved task contract to the implementer.",
      suggestedCommands: ["pnpm task:start"],
      prompt: implementerPrompt(task),
    };
  }

  if (task.status === "implementing") {
    const nextActor = getActor(policy, task.tester);
    return {
      ...base,
      nextRole: task.tester,
      nextActor: nextActor.actor,
      action: "Complete implementation, report changed files, then hand off to independent testing.",
      suggestedCommands: ["pnpm task:handoff -- tester"],
      prompt: implementerPrompt(task),
    };
  }

  if (task.status === "testing") {
    const nextActor = getActor(policy, task.reviewer);
    return {
      ...base,
      nextRole: task.reviewer,
      nextActor: nextActor.actor,
      action: "Run the test plan, record evidence, and submit the task for review.",
      suggestedCommands: [
        ...task.verificationCommands,
        'pnpm task:evidence -- "<verification result>"',
        "pnpm task:review",
      ],
      prompt: testerPrompt(task),
    };
  }

  if (task.status === "ready_for_review") {
    const requiresHuman = Boolean(taskPolicy.humanApprovalRequired);
    const nextRole = requiresHuman ? task.humanApprover : undefined;
    const nextActor = nextRole ? getActor(policy, nextRole).actor : undefined;
    return {
      ...base,
      nextRole,
      nextActor,
      action: requiresHuman
        ? "Review the implementation and hand it to the human approver."
        : "Review the implementation and finish the task when all findings are resolved.",
      suggestedCommands: requiresHuman
        ? ["pnpm task:handoff -- approver", "pnpm task:finish"]
        : ["pnpm task:finish"],
      prompt: reviewerPrompt(task, requiresHuman),
    };
  }

  return {
    ...base,
    action: "Archive the completed task.",
    suggestedCommands: ["pnpm task:close"],
    prompt: `Task ${task.id} is complete. Archive its audit record.`,
  };
}

export function formatExecutionBrief(brief: ExecutionBrief): string {
  const lines = [
    `Task: ${brief.taskId}`,
    `Status: ${brief.status}`,
    `Current role: ${brief.currentRole}`,
    `Actor: ${brief.actor}`,
  ];

  if (brief.fallbackActor) {
    lines.push(`Fallback actor: ${brief.fallbackActor}`);
  }
  if (brief.nextRole) {
    lines.push(`Next role: ${brief.nextRole}`);
  }
  if (brief.nextActor) {
    lines.push(`Next actor: ${brief.nextActor}`);
  }

  lines.push(
    `Action: ${brief.action}`,
    "Commands:",
    ...brief.suggestedCommands.map((command) => `  ${command}`),
    "Prompt:",
    brief.prompt,
  );
  return lines.join("\n");
}

function assertTaskContractReady(task: ActiveTask): void {
  const problems = findContractProblems(task);
  if (problems.length > 0) {
    throw new Error(`Task contract is incomplete: ${problems.join(", ")}`);
  }
}

function findContractProblems(task: ActiveTask): string[] {
  const problems: string[] = [];
  for (const [field, values] of [
    ["scope", task.scope],
    ["acceptanceCriteria", task.acceptanceCriteria],
    ["testPlan", task.testPlan],
    ["verificationCommands", task.verificationCommands],
  ] as const) {
    if (values.length === 0 || values.some((value) => value.startsWith("TODO:"))) {
      problems.push(field);
    }
  }
  if (task.testImpact.consensus !== "approved") {
    problems.push("testImpact");
  }
  return problems;
}

function contractCommands(problems: string[]): string[] {
  const commands: Record<string, string> = {
    scope: 'pnpm task:scope -- "<allowed path>"',
    acceptanceCriteria: 'pnpm task:criteria -- "<acceptance criterion>"',
    testPlan: 'pnpm task:test-plan -- "<test case>"',
    verificationCommands: 'pnpm task:verify-command -- "pnpm test" "pnpm check-types" "pnpm build"',
    testImpact: 'pnpm task:test-impact -- <add|update|none> "<reason>" test-strategist',
  };
  return problems.map((problem) => {
    const command = commands[problem];
    if (!command) {
      throw new Error(`No contract command configured for '${problem}'`);
    }
    return command;
  });
}

function getTaskPolicy(task: ActiveTask, policy: RolePolicy): TaskPolicy {
  const taskPolicy = policy.taskPolicies?.[task.taskType];
  if (!taskPolicy) {
    throw new Error(`Unknown task type: ${task.taskType}`);
  }
  return taskPolicy;
}

function getActor(
  policy: RolePolicy,
  role: string,
): { actor: string; fallbackActor?: string } {
  const definition = policy.roles?.[role];
  if (!definition?.actor) {
    throw new Error(`Role '${role}' has no configured actor`);
  }
  return {
    actor: definition.actor,
    fallbackActor: definition.fallbackActor,
  };
}

function architectPrompt(task: ActiveTask, missing: string[]): string {
  return [
    `You are the architect for task ${task.id}: ${task.title}.`,
    `Complete these contract fields before implementation: ${missing.join(", ")}.`,
    "Define scope, acceptance criteria, test impact, test plan, and verification commands.",
    "Do not implement business code during this stage.",
  ].join("\n");
}

function implementerPrompt(task: ActiveTask): string {
  return [
    `You are the implementer for task ${task.id}: ${task.title}.`,
    `Allowed scope: ${task.scope.join(", ")}.`,
    `Acceptance criteria: ${task.acceptanceCriteria.join("; ")}.`,
    "Implement only the approved scope.",
    "Do not weaken or change tests without test-strategist consensus.",
    "Report changed files, design decisions, and remaining risks before handoff.",
  ].join("\n");
}

function testerPrompt(task: ActiveTask): string {
  return [
    `You are the independent tester for task ${task.id}: ${task.title}.`,
    `Test plan: ${task.testPlan.join("; ")}.`,
    `Verification commands: ${task.verificationCommands.join("; ")}.`,
    "Validate behavior from the acceptance criteria rather than trusting implementation notes.",
    "Do not modify project files during the independent testing stage.",
    "Record evidence for every verification command.",
    "On failure, report the business defect and hand the task back to the implementer.",
  ].join("\n");
}

function reviewerPrompt(task: ActiveTask, requiresHuman: boolean): string {
  return [
    `You are the reviewer for task ${task.id}: ${task.title}.`,
    "Review correctness, architecture, security, scope compliance, and test evidence.",
    "Return unresolved findings to the implementer.",
    requiresHuman
      ? "When review passes, hand the task to the human approver."
      : "When review passes, finish and archive the task.",
  ].join("\n");
}
