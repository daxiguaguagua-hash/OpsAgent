import { existsSync, readFileSync } from "node:fs";
import { block } from "./lib/io.ts";

const activeTaskPath = ".agent/active-task.json";
const rolePolicyPath = ".agent/role-policy.json";

const validStatuses = new Set([
  "planned",
  "implementing",
  "testing",
  "ready_for_review",
  "completed",
]);

interface RolePolicy {
  roles?: Record<string, unknown>;
  taskPolicies?: Record<string, {
    owner?: string;
    executor?: string;
    tester?: string;
    testStrategist?: string;
    reviewer?: string;
    humanApprovalRequired?: boolean;
  }>;
}

interface ActiveTask {
  id?: string;
  title?: string;
  taskType?: string;
  status?: string;
  owner?: string;
  executor?: string;
  tester?: string;
  testStrategist?: string;
  reviewer?: string;
  humanApprover?: string;
  scope?: string[];
  acceptanceCriteria?: string[];
  testImpact?: {
    action?: "add" | "update" | "none";
    rationale?: string;
    proposedBy?: string;
    reviewedBy?: string;
    consensus?: "approved" | "pending";
  };
  testPlan?: string[];
  verificationCommands?: string[];
  testEvidence?: string[];
}

export function validateActiveTask(): void {
  if (!existsSync(activeTaskPath)) {
    return;
  }

  const policy = readJson<RolePolicy>(rolePolicyPath);
  const task = readJson<ActiveTask>(activeTaskPath);
  const requiredTextFields: Array<keyof ActiveTask> = [
    "id",
    "title",
    "taskType",
    "status",
    "owner",
    "executor",
    "tester",
    "testStrategist",
    "reviewer",
    "humanApprover",
  ];

  for (const field of requiredTextFields) {
    if (typeof task[field] !== "string" || !task[field]?.trim()) {
      block(`OpsAgent role policy blocked: active task is missing '${field}'`);
    }
  }

  if (!validStatuses.has(task.status ?? "")) {
    block(`OpsAgent role policy blocked: invalid task status '${task.status}'`);
  }

  const taskPolicy = policy.taskPolicies?.[task.taskType ?? ""];
  if (!taskPolicy) {
    block(`OpsAgent role policy blocked: unknown taskType '${task.taskType}'`);
  }

  for (const roleField of ["owner", "executor", "tester", "testStrategist", "reviewer", "humanApprover"] as const) {
    const role = task[roleField];
    if (!role || !policy.roles?.[role]) {
      block(`OpsAgent role policy blocked: '${roleField}' references unknown role '${role}'`);
    }
  }

  for (const roleField of ["owner", "executor", "tester", "testStrategist", "reviewer"] as const) {
    const expectedRole = taskPolicy[roleField];
    if (expectedRole && task[roleField] !== expectedRole) {
      block(
        `OpsAgent role policy blocked: taskType '${task.taskType}' requires ${roleField}='${expectedRole}'`,
      );
    }
  }

  if (taskPolicy.humanApprovalRequired && task.humanApprover !== "approver") {
    block(`OpsAgent role policy blocked: taskType '${task.taskType}' requires human approver`);
  }

  requireNonEmptyList(task.scope, "scope");
  requireNonEmptyList(task.acceptanceCriteria, "acceptanceCriteria");
  validateTestImpact(task);
  requireNonEmptyList(task.testPlan, "testPlan");
  requireNonEmptyList(task.verificationCommands, "verificationCommands");

  if (
    (task.status === "ready_for_review" || task.status === "completed")
    && (!task.testEvidence || task.testEvidence.length === 0)
  ) {
    block("OpsAgent role policy blocked: testEvidence is required before review or completion");
  }
}

function validateTestImpact(task: ActiveTask): void {
  const impact = task.testImpact;
  if (!impact) {
    block("OpsAgent role policy blocked: every task must declare testImpact");
  }

  if (!impact.action || !["add", "update", "none"].includes(impact.action)) {
    block("OpsAgent role policy blocked: testImpact.action must be add, update, or none");
  }

  if (!impact.rationale?.trim()) {
    block("OpsAgent role policy blocked: testImpact.rationale is required");
  }

  if (impact.reviewedBy !== task.testStrategist) {
    block("OpsAgent role policy blocked: test impact must be reviewed by the task testStrategist");
  }

  if (impact.consensus !== "approved") {
    block("OpsAgent role policy blocked: test impact requires Codex consensus before review");
  }

  if (impact.action === "update" && impact.proposedBy === "implementer" && impact.reviewedBy !== "test-strategist") {
    block("OpsAgent role policy blocked: implementer cannot change tests without test-strategist approval");
  }
}

function requireNonEmptyList(value: string[] | undefined, field: string): void {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => !item.trim())) {
    block(`OpsAgent role policy blocked: '${field}' must contain at least one item`);
  }
}

function readJson<T>(path: string): T {
  if (!existsSync(path)) {
    block(`OpsAgent role policy blocked: missing required file '${path}'`);
  }

  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    block(`OpsAgent role policy blocked: invalid JSON in '${path}'`);
  }
}
