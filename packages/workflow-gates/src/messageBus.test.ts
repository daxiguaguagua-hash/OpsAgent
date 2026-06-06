import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { MessageBus } from "./messageBus.ts";

test("send stores inbox and outbox copies", () => {
  const root = mkdtempSync(join(tmpdir(), "opsagent-message-"));
  const bus = new MessageBus(root);
  const message = bus.send({
    taskId: "M1-01",
    from: "codex",
    to: "claude-code-deepseek",
    type: "task_assignment",
    subject: "Implement login",
    content: "Follow the active task contract.",
  }, "2026-06-06T00:00:00.000Z");

  assert.equal(bus.listInbox("claude-code-deepseek").length, 1);
  assert.equal(bus.listOutbox("codex").length, 1);
  assert.equal(bus.get("claude-code-deepseek", message.id).status, "pending");
});

test("read and resolve synchronize sender records", () => {
  const root = mkdtempSync(join(tmpdir(), "opsagent-message-"));
  const bus = new MessageBus(root);
  const message = bus.send({
    taskId: "M1-01",
    from: "claude-code-deepseek",
    to: "codex",
    type: "clarification",
    subject: "Session duration",
    content: "Should sessions expire after 30 minutes?",
  });

  bus.markRead("codex", message.id, "2026-06-06T00:01:00.000Z");
  assert.equal(bus.listOutbox("claude-code-deepseek")[0]?.status, "read");

  bus.resolve("codex", message.id, "2026-06-06T00:02:00.000Z");
  assert.equal(bus.get("codex", message.id).status, "resolved");
  assert.equal(bus.listInbox("codex").length, 0);
});

test("reply routes a linked decision to the original sender", () => {
  const root = mkdtempSync(join(tmpdir(), "opsagent-message-"));
  const bus = new MessageBus(root);
  const request = bus.send({
    taskId: "M1-01",
    from: "claude-code-deepseek",
    to: "codex",
    type: "test_change_request",
    subject: "Update auth assertions",
    content: "The response contract changed.",
  });
  const reply = bus.reply(
    "codex",
    request.id,
    "codex",
    "decision",
    "Rejected. Fix the implementation instead.",
  );

  assert.equal(reply.to, "claude-code-deepseek");
  assert.equal(reply.replyTo, request.id);
});

test("execution result becomes a Codex inbox message", () => {
  const root = mkdtempSync(join(tmpdir(), "opsagent-message-"));
  const bus = new MessageBus(root);
  const message = bus.createExecutionResultMessage({
    taskId: "M1-01",
    role: "implementer",
    actor: "claude-code-deepseek",
    success: true,
    output: "Implementation complete",
    sessionId: "session-1",
    completedAt: "2026-06-06T00:00:00.000Z",
  });

  assert.equal(message.to, "codex");
  assert.equal(message.type, "execution_result");
  assert.equal(bus.listInbox("codex")[0]?.content, "Implementation complete");
});

test("pending messages are formatted for the actor prompt", () => {
  const root = mkdtempSync(join(tmpdir(), "opsagent-message-"));
  const bus = new MessageBus(root);
  const message = bus.send({
    taskId: "M1-01",
    from: "codex",
    to: "claude-code-deepseek",
    type: "decision",
    subject: "Test change rejected",
    content: "Keep the existing test contract.",
  });

  const prompt = bus.formatInboxForPrompt("claude-code-deepseek", "M1-01");
  assert.match(prompt, /Test change rejected/);
  assert.match(prompt, new RegExp(message.id));

  const inboxPath = join(root, "inbox", "claude-code-deepseek", `${message.id}.json`);
  assert.equal(JSON.parse(readFileSync(inboxPath, "utf8")).status, "pending");
});

test("pending messages become read only after explicit consumption", () => {
  const root = mkdtempSync(join(tmpdir(), "opsagent-message-"));
  const bus = new MessageBus(root);
  bus.send({
    taskId: "M1-01",
    from: "codex",
    to: "claude-code-deepseek",
    type: "decision",
    subject: "Continue implementation",
    content: "The proposed approach is approved.",
  });

  assert.equal(bus.listInbox("claude-code-deepseek", false).length, 1);
  bus.markPendingRead("claude-code-deepseek", "M1-01", "2026-06-06T00:01:00.000Z");
  assert.equal(bus.listInbox("claude-code-deepseek", false).length, 0);
  assert.equal(bus.listInbox("claude-code-deepseek")[0]?.status, "read");
});

test("prompt injection and consumption are isolated by task id", () => {
  const root = mkdtempSync(join(tmpdir(), "opsagent-message-"));
  const bus = new MessageBus(root);
  bus.send({
    taskId: "M1-01",
    from: "codex",
    to: "claude-code-deepseek",
    type: "decision",
    subject: "Login decision",
    content: "Use secure cookies.",
  });
  bus.send({
    taskId: "M2-01",
    from: "codex",
    to: "claude-code-deepseek",
    type: "decision",
    subject: "Logging decision",
    content: "Use structured logs.",
  });

  const prompt = bus.formatInboxForPrompt("claude-code-deepseek", "M1-01");
  assert.match(prompt, /Login decision/);
  assert.doesNotMatch(prompt, /Logging decision/);

  bus.markPendingRead("claude-code-deepseek", "M1-01");
  const pending = bus.listInbox("claude-code-deepseek", false);
  assert.equal(pending.length, 1);
  assert.equal(pending[0]?.taskId, "M2-01");
});
