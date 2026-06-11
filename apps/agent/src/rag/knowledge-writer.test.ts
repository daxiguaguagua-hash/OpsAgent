/**
 * knowledge-writer.ts 单元测试
 *
 * 覆盖范围：
 * - 任务 completed 后自动生成 <task-id>.md 草稿
 * - 任务状态非 completed/accepted 时 skipped
 * - 已存在草稿时 skipped
 * - 非法 taskId 时 skipped
 * - 草稿包含 DRAFT_PREFIX + 审核 checklist
 * - ADR / incident 路径要求人工审核
 *
 * 运行方式：pnpm --filter @opsagent/agent test
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  buildDraft,
  captureTaskSummary,
  KNOWLEDGE_CAPTURE,
  requiresManualReview,
  type TaskSummary,
} from "./knowledge-writer.js";

const FIXTURE_SUMMARY: TaskSummary = {
  taskId: "M3-15",
  title: "任务完成后知识沉淀",
  status: "completed",
  conclusion: "实现了 knowledge-writer，任务 completed 后生成草稿。",
  keyEvidence: ["knowledge-writer.ts", "knowledge-writer.test.ts"],
  completedAt: "2026-06-11T12:00:00Z",
};

function makeDeps(existing: string[] = []) {
  const written: Record<string, string> = {};
  return {
    written,
    deps: {
      writeText: (p: string, c: string) => {
        written[p] = c;
      },
      exists: (p: string) => existing.includes(p) || p in written,
      knowledgeRoot: "/fake/knowledge/tasks",
    },
  };
}

describe("captureTaskSummary — 成功", () => {
  test("completed 任务生成草稿", () => {
    const { written, deps } = makeDeps();
    const result = captureTaskSummary(FIXTURE_SUMMARY, deps);
    assert.equal(result.skipped, false, "不应跳过");
    assert.equal(
      result.path,
      "/fake/knowledge/tasks/M3-15.md",
      "路径应为 <taskId>.md",
    );
    const content = written["/fake/knowledge/tasks/M3-15.md"] ?? "";
    assert.ok(
      content.includes(KNOWLEDGE_CAPTURE.DRAFT_PREFIX),
      "应包含 DRAFT_PREFIX",
    );
    assert.ok(content.includes("M3-15"), "应包含 taskId");
    assert.ok(content.includes("knowledge-writer.ts"), "应包含证据");
    assert.ok(
      content.includes("待人工审核"),
      "应包含审核 checklist",
    );
  });

  test("accepted 任务也可沉淀", () => {
    const { deps } = makeDeps();
    const result = captureTaskSummary(
      { ...FIXTURE_SUMMARY, status: "accepted" },
      deps,
    );
    assert.equal(result.skipped, false, "accepted 不应跳过");
  });
});

describe("captureTaskSummary — 跳过场景", () => {
  test("status 非 completed/accepted 时 skipped", () => {
    const { deps } = makeDeps();
    const result = captureTaskSummary(
      { ...FIXTURE_SUMMARY, status: "implementing" as "completed" },
      deps,
    );
    assert.equal(result.skipped, true, "应跳过");
    assert.ok(
      result.reason?.includes("not eligible"),
      "reason 应提示 not eligible",
    );
  });

  test("草稿已存在时 skipped", () => {
    const { deps } = makeDeps(["/fake/knowledge/tasks/M3-15.md"]);
    const result = captureTaskSummary(FIXTURE_SUMMARY, deps);
    assert.equal(result.skipped, true, "应跳过");
    assert.ok(
      result.reason?.includes("already exists"),
      "reason 应提示 already exists",
    );
  });

  test("非法 taskId 时 skipped", () => {
    const { deps } = makeDeps();
    const result = captureTaskSummary(
      { ...FIXTURE_SUMMARY, taskId: "../etc/passwd" },
      deps,
    );
    assert.equal(result.skipped, true, "应跳过");
    assert.ok(
      result.reason?.includes("invalid taskId"),
      "reason 应提示 invalid taskId",
    );
  });
});

describe("buildDraft — 内容结构", () => {
  test("草稿包含必要章节", () => {
    const draft = buildDraft(FIXTURE_SUMMARY);
    assert.ok(draft.includes("# M3-15"), "应包含标题");
    assert.ok(draft.includes("## 结论"), "应包含结论章节");
    assert.ok(draft.includes("## 关键证据"), "应包含证据章节");
    assert.ok(draft.includes("## 待人工审核"), "应包含审核章节");
    assert.ok(
      draft.includes(KNOWLEDGE_CAPTURE.DRAFT_PREFIX),
      "应以 DRAFT_PREFIX 开头",
    );
  });

  test("无证据时显示占位", () => {
    const draft = buildDraft({ ...FIXTURE_SUMMARY, keyEvidence: [] });
    assert.ok(
      draft.includes("待补充关键证据"),
      "空证据应显示占位",
    );
  });
});

describe("requiresManualReview", () => {
  test("ADR 路径要求人工审核", () => {
    assert.equal(
      requiresManualReview("docs/decisions/ADR-001.md"),
      true,
      "ADR 应要求人工审核",
    );
  });

  test("incident 路径要求人工审核", () => {
    assert.equal(
      requiresManualReview("docs/knowledge/incidents/20260611-001.md"),
      true,
      "incident 应要求人工审核",
    );
  });

  test("tasks 路径无需人工审核", () => {
    assert.equal(
      requiresManualReview("docs/knowledge/tasks/M3-15.md"),
      false,
      "tasks 不应要求人工审核",
    );
  });
});
