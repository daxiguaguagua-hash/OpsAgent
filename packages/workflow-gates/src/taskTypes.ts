export type TaskStatus =
  | "planned"
  | "implementing"
  | "testing"
  | "ready_for_review"
  | "completed";

export type TestImpactAction = "add" | "update" | "none";

export interface TestImpact {
  action: TestImpactAction;
  rationale: string;
  proposedBy: string;
  reviewedBy: string;
  consensus: "approved" | "pending";
}

export interface HandoffRecord {
  from: string;
  to: string;
  at: string;
}

export interface ActiveTask {
  id: string;
  title: string;
  taskType: string;
  status: TaskStatus;
  owner: string;
  executor: string;
  tester: string;
  testStrategist: string;
  reviewer: string;
  humanApprover: string;
  currentAssignee: string;
  scope: string[];
  acceptanceCriteria: string[];
  testImpact: TestImpact;
  testPlan: string[];
  verificationCommands: string[];
  testEvidence: string[];
  handoffHistory: HandoffRecord[];
}

export interface TaskPolicy {
  owner?: string;
  executor?: string;
  tester?: string;
  testStrategist?: string;
  reviewer?: string;
  humanApprovalRequired?: boolean;
}

export interface RolePolicy {
  roles?: Record<string, unknown>;
  taskPolicies?: Record<string, TaskPolicy>;
}

