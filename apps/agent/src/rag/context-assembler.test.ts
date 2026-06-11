/**
 * context-assembler.ts 单元测试
 *
 * 覆盖范围：
 * - 三类来源（task/knowledge/code）合并并按 source 优先级 + score 排序
 * - 每个 snippet 带 sourceId，来源清晰
 * - maxSnippets 截断时 truncated=true
 * - maxTokens 截断时 truncated=true
 * - renderPrompt 输出可拼接到 prompt
 * - 空输入返回空数组
 *
 * 运行方式：pnpm --filter @opsagent/agent test
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { KnowledgeChunk } from "../../gbrain/types.js";
import {
  assembleContext,
  renderPrompt,
  type CodeContext,
  type TaskFacts,
} from "./context-assembler.js";

const FIXTURE_KNOWLEDGE: KnowledgeChunk[] = [
  {
    id: "arch-1",
    sourceId: "opsagent-architecture",
    path: "docs/architecture/overview.md",
    title: "Architecture Overview",
    content: "OpsAgent 是一个 AI Ops 演示项目。",
    score: 0.9,
  },
  {
    id: "know-1",
    sourceId: "opsagent-knowledge",
    path: "docs/knowledge/prometheus.md",
    title: "Prometheus 基础",
    content: "PromQL 是查询语言。",
    score: 0.7,
  },
];

const FIXTURE_TASK: TaskFacts = {
  taskId: "M3-14",
  status: "implementing",
  scope: "实现 Agent 执行前 RAG",
  acceptanceCriteria: ["任务事实注入", "历史知识注入", "代码上下文注入"],
};

const FIXTURE_CODE: CodeContext[] = [
  {
    path: "apps/agent/src/rag/context-assembler.ts",
    symbols: ["assembleContext", "renderPrompt"],
    body: "export function assembleContext() { /* ... */ }",
  },
];

describe("assembleContext — 合并与排序", () => {
  test("三类来源合并且 task 排最前", () => {
    const result = assembleContext({
      taskFacts: FIXTURE_TASK,
      knowledge: FIXTURE_KNOWLEDGE,
      codeContext: FIXTURE_CODE,
    });
    assert.equal(result.snippets.length, 4, "应合并为 4 条");
    assert.equal(
      result.snippets[0]?.source,
      "task",
      "task 应排在最前",
    );
    assert.equal(
      result.snippets[0]?.sourceId,
      "opsagent-postgres",
      "task 应来自 opsagent-postgres",
    );
    assert.equal(result.truncated, false, "未超预算时不应截断");
  });

  test("knowledge 按 score 降序", () => {
    const result = assembleContext({
      knowledge: [FIXTURE_KNOWLEDGE[1]!, FIXTURE_KNOWLEDGE[0]!],
    });
    assert.equal(
      result.snippets[0]?.title,
      "Architecture Overview",
      "score 高的应排在前",
    );
  });

  test("code 来源 sourceId 为 opsagent-codegraph", () => {
    const result = assembleContext({ codeContext: FIXTURE_CODE });
    assert.equal(
      result.snippets[0]?.sourceId,
      "opsagent-codegraph",
      "code 应来自 opsagent-codegraph",
    );
  });
});

describe("assembleContext — 截断", () => {
  test("maxSnippets 截断时 truncated=true", () => {
    const chunks: KnowledgeChunk[] = Array.from({ length: 5 }, (_, i) => ({
      id: `k-${i}`,
      sourceId: "opsagent-knowledge",
      path: `docs/knowledge/${i}.md`,
      title: `K${i}`,
      content: `content ${i}`,
      score: 0.5 + i * 0.01,
    }));
    const result = assembleContext({ knowledge: chunks, maxSnippets: 2 });
    assert.equal(result.snippets.length, 2, "应只保留 2 条");
    assert.equal(result.truncated, true, "应标记 truncated");
  });

  test("maxTokens 截断时 truncated=true", () => {
    const longContent = "x".repeat(3000);
    const chunks: KnowledgeChunk[] = [
      {
        id: "k-long",
        sourceId: "opsagent-knowledge",
        path: "docs/knowledge/long.md",
        title: "Long",
        content: longContent,
        score: 0.5,
      },
      {
        id: "k-short",
        sourceId: "opsagent-knowledge",
        path: "docs/knowledge/short.md",
        title: "Short",
        content: "short",
        score: 0.4,
      },
    ];
    const result = assembleContext({ knowledge: chunks, maxTokens: 753 });
    assert.equal(result.snippets.length, 1, "第二条应被截断掉");
    assert.equal(result.truncated, true, "应标记 truncated");
  });
});

describe("assembleContext — 空输入", () => {
  test("三类都缺时返回空数组", () => {
    const result = assembleContext({ knowledge: [] });
    assert.deepEqual(result.snippets, [], "snippets 应为空");
    assert.equal(result.truncated, false, "不应标记 truncated");
    assert.equal(
      result.totalTokensEstimate,
      0,
      "totalTokensEstimate 应为 0",
    );
  });
});

describe("renderPrompt", () => {
  test("拼接每条 snippet 为 markdown", () => {
    const assembled = assembleContext({
      taskFacts: FIXTURE_TASK,
      knowledge: [FIXTURE_KNOWLEDGE[0]!],
    });
    const prompt = renderPrompt(assembled);
    assert.ok(
      prompt.includes("[task:opsagent-postgres]"),
      "应包含 task sourceId 标签",
    );
    assert.ok(
      prompt.includes("[knowledge:opsagent-architecture]"),
      "应包含 knowledge sourceId 标签",
    );
    assert.ok(
      prompt.includes("OpsAgent 是一个 AI Ops 演示项目"),
      "应包含 knowledge body",
    );
  });

  test("truncated 时追加 footer", () => {
    const chunks: KnowledgeChunk[] = Array.from({ length: 3 }, (_, i) => ({
      id: `k-${i}`,
      sourceId: "opsagent-knowledge",
      path: `docs/knowledge/${i}.md`,
      title: `K${i}`,
      content: "content",
      score: 0.5,
    }));
    const assembled = assembleContext({ knowledge: chunks, maxSnippets: 1 });
    const prompt = renderPrompt(assembled);
    assert.ok(
      prompt.includes("context truncated"),
      "应追加截断 footer",
    );
  });
});
