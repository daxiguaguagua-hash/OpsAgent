import { readActiveGoal } from "./lib/repo.ts";
import { validateActiveTask } from "./rolePolicy.ts";
import { checkM0Stop } from "./rules/m0.ts";

validateActiveTask();

const activeGoal = readActiveGoal();

if (!activeGoal) {
  console.log("OpsAgent Stop hook: no .claude/active-goal found; strict gate skipped.");
  process.exit(0);
}

if (activeGoal === "M0") {
  checkM0Stop();
  process.exit(0);
}

console.log(`OpsAgent Stop hook: active goal '${activeGoal}' has no strict checker yet; skipped.`);
