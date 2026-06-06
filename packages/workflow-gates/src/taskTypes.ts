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

export interface RoleDefinition {
  actor?: string;
  fallbackActor?: string;
  responsibilities?: string[];
}

export interface RolePolicy {
  roles?: Record<string, RoleDefinition>;
  taskPolicies?: Record<string, TaskPolicy>;
}

export interface ExecutionBrief {
  taskId: string;
  status: TaskStatus;
  currentRole: string;
  actor: string;
  fallbackActor?: string;
  nextRole?: string;
  nextActor?: string;
  action: string;
  suggestedCommands: string[];
  prompt: string;
}

export type ActorAdapter = "claude-code" | "manual";

export interface ActorProfile {
  adapter: ActorAdapter;
  executable?: string;
  mode: string;
  allowedTools?: string[];
  disallowedTools?: string[];
  permissionMode?: string;
  settingSources?: string[];
  freshSession?: boolean;
  externalProvider?: string;
  requiresExternalDataApproval?: boolean;
  timeoutMs?: number;
}

export interface ActorRegistry {
  version: string;
  actors: Record<string, ActorProfile>;
}

export interface ExecutionRequest {
  taskId: string;
  role: string;
  actor: string;
  adapter: ActorAdapter;
  mode: string;
  prompt: string;
  cwd: string;
  executable?: string;
  allowedTools: string[];
  disallowedTools: string[];
  permissionMode?: string;
  settingSources: string[];
  freshSession: boolean;
  externalProvider?: string;
  requiresExternalDataApproval: boolean;
  timeoutMs: number;
}

export interface ExecutionResult {
  taskId: string;
  role: string;
  actor: string;
  success: boolean;
  output: string;
  sessionId?: string;
  durationMs?: number;
  costUsd?: number;
  completedAt: string;
}
