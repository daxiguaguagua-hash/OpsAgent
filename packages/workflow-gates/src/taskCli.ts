import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import {
  addTestEvidence,
  approveTestImpact,
  createTask,
  handoffTask,
  setTestImpact,
  transitionTask,
} from "./taskState.ts";
import type {
  ActiveTask,
  RolePolicy,
  TaskStatus,
  TestImpactAction,
} from "./taskTypes.ts";
import { validateActiveTask } from "./rolePolicy.ts";

const activeTaskPath = ".agent/active-task.json";
const rolePolicyPath = ".agent/role-policy.json";
const rawArgs = process.argv.slice(2);
const separatorIndex = rawArgs.indexOf("--");
if (separatorIndex >= 0) {
  rawArgs.splice(separatorIndex, 1);
}
const [command, ...args] = rawArgs;

try {
  switch (command) {
    case "create":
      handleCreate(args);
      break;
    case "show":
      printTask(readTask());
      break;
    case "status":
      updateTask((task) => transitionTask(task, requiredArg(args[0], "status") as TaskStatus));
      break;
    case "handoff":
      updateTask((task) => handoffTask(task, requiredArg(args[0], "role")));
      break;
    case "scope":
      updateTask((task) => ({ ...task, scope: requiredList(args, "scope") }));
      break;
    case "criteria":
      updateTask((task) => ({ ...task, acceptanceCriteria: requiredList(args, "criteria") }));
      break;
    case "test-plan":
      updateTask((task) => ({ ...task, testPlan: requiredList(args, "test plan") }));
      break;
    case "verify-command":
      updateTask((task) => ({ ...task, verificationCommands: requiredList(args, "verification command") }));
      break;
    case "test-impact":
      updateTask((task) =>
        setTestImpact(
          task,
          requiredArg(args[0], "action") as TestImpactAction,
          requiredArg(args[1], "rationale"),
          args[2] ?? "test-strategist",
        ),
      );
      break;
    case "test-approve":
      updateTask((task) => approveTestImpact(task));
      break;
    case "evidence":
      updateTask((task) => addTestEvidence(task, requiredArg(args.join(" "), "evidence")));
      break;
    case "validate":
      validateActiveTask();
      console.log("Active task is valid.");
      break;
    case "close":
      closeTask();
      break;
    default:
      printUsage();
      process.exitCode = command ? 2 : 0;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
}

function handleCreate(args: string[]): void {
  if (existsSync(activeTaskPath)) {
    throw new Error("An active task already exists. Complete or remove it before creating another.");
  }

  const id = requiredArg(args[0], "id");
  const title = requiredArg(args[1], "title");
  const taskType = args[2] ?? "implementation";
  const task = createTask(readJson<RolePolicy>(rolePolicyPath), id, title, taskType);
  writeTask(task);
  printTask(task);
}

function updateTask(update: (task: ActiveTask) => ActiveTask): void {
  const task = update(readTask());
  writeTask(task);
  printTask(task);
}

function readTask(): ActiveTask {
  if (!existsSync(activeTaskPath)) {
    throw new Error("No active task found. Run task:create first.");
  }
  return readJson<ActiveTask>(activeTaskPath);
}

function writeTask(task: ActiveTask): void {
  writeFileSync(activeTaskPath, `${JSON.stringify(task, null, 2)}\n`);
}

function closeTask(): void {
  const task = readTask();
  if (task.status !== "completed") {
    throw new Error("Only a completed task can be closed.");
  }

  mkdirSync(".agent/history", { recursive: true });
  const safeId = task.id.replace(/[^a-zA-Z0-9._-]/g, "_");
  const archivePath = `.agent/history/${safeId}.json`;
  writeFileSync(archivePath, `${JSON.stringify(task, null, 2)}\n`);
  unlinkSync(activeTaskPath);
  console.log(`Task archived: ${archivePath}`);
}

function printTask(task: ActiveTask): void {
  console.log(JSON.stringify(task, null, 2));
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function requiredArg(value: string | undefined, name: string): string {
  if (!value?.trim()) {
    throw new Error(`Missing required argument: ${name}`);
  }
  return value;
}

function requiredList(values: string[], name: string): string[] {
  if (values.length === 0 || values.some((value) => !value.trim())) {
    throw new Error(`Missing required argument: ${name}`);
  }
  return values;
}

function printUsage(): void {
  console.log(`OpsAgent task CLI

Commands:
  create <id> <title> [taskType]
  show
  status <planned|implementing|testing|ready_for_review|completed>
  handoff <role>
  scope <pattern...>
  criteria <criterion...>
  test-plan <case...>
  verify-command <command...>
  test-impact <add|update|none> <rationale> [proposedBy]
  test-approve
  evidence <text>
  validate
  close`);
}
