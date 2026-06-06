import assert from "node:assert/strict";
import test from "node:test";
import {
  assertExecutionApproved,
  buildClaudeCodeArgs,
  createExecutionRequest,
  executeActor,
} from "./actorRuntime.ts";
import type { ActorRegistry, ExecutionBrief } from "./taskTypes.ts";

const registry: ActorRegistry = {
  version: "0.1.0",
  actors: {
    "claude-code-deepseek": {
      adapter: "claude-code",
      executable: "claude",
      mode: "implementation",
      allowedTools: ["Read", "Edit", "Bash"],
      permissionMode: "dontAsk",
      settingSources: ["user", "project"],
      freshSession: true,
      externalProvider: "deepseek",
      requiresExternalDataApproval: true,
      timeoutMs: 10_000,
    },
    "claude-code-deepseek-new-context": {
      adapter: "claude-code",
      executable: "claude",
      mode: "testing",
      allowedTools: ["Read", "Bash"],
      disallowedTools: ["Edit", "Write"],
      permissionMode: "dontAsk",
      settingSources: ["user", "project"],
      freshSession: true,
      externalProvider: "deepseek",
      requiresExternalDataApproval: true,
      timeoutMs: 10_000,
    },
    human: {
      adapter: "manual",
      mode: "approval",
    },
  },
};

test("createExecutionRequest binds prompt, role, actor, and runtime profile", () => {
  const request = createExecutionRequest(brief("tester", "claude-code-deepseek-new-context"), registry, "/repo");

  assert.equal(request.role, "tester");
  assert.equal(request.actor, "claude-code-deepseek-new-context");
  assert.equal(request.mode, "testing");
  assert.deepEqual(request.disallowedTools, ["Edit", "Write"]);
  assert.equal(request.externalProvider, "deepseek");
  assert.equal(request.requiresExternalDataApproval, true);
  assert.equal(request.prompt, "Run independent tests");
});

test("tester Claude Code args create a fresh restricted session", () => {
  const request = createExecutionRequest(brief("tester", "claude-code-deepseek-new-context"), registry, "/repo");
  const args = buildClaudeCodeArgs(request);

  assert.ok(args.includes("--no-session-persistence"));
  assert.ok(args.includes("Read,Bash"));
  assert.ok(args.includes("Edit,Write"));
  assert.equal(args.at(-1), "Run independent tests");
});

test("external providers require explicit data approval", () => {
  const request = createExecutionRequest(brief("tester", "claude-code-deepseek-new-context"), registry, "/repo");

  assert.throws(
    () => assertExecutionApproved(request, false),
    /approve-external-data/,
  );
  assert.doesNotThrow(() => assertExecutionApproved(request, true));
});

test("executeActor parses structured Claude Code output without network", async () => {
  const request = createExecutionRequest(brief("implementer", "claude-code-deepseek"), registry, "/repo");
  const result = await executeActor(request, async () => ({
    exitCode: 0,
    stdout: JSON.stringify({
      is_error: false,
      result: "Implementation complete",
      session_id: "session-1",
      duration_ms: 1200,
      total_cost_usd: 0.01,
    }),
    stderr: "",
  }));

  assert.equal(result.success, true);
  assert.equal(result.output, "Implementation complete");
  assert.equal(result.sessionId, "session-1");
});

test("manual actors cannot be executed by the runtime", async () => {
  const request = createExecutionRequest(brief("approver", "human"), registry, "/repo");

  await assert.rejects(() => executeActor(request), /manual execution/);
});

function brief(currentRole: string, actor: string): ExecutionBrief {
  return {
    taskId: "M1-01",
    status: currentRole === "tester" ? "testing" : "implementing",
    currentRole,
    actor,
    action: "Execute current stage",
    suggestedCommands: [],
    prompt: currentRole === "tester"
      ? "Run independent tests"
      : "Implement approved scope",
  };
}
