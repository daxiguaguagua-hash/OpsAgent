/**
 * eval + citation-audit 单元测试
 *
 * 覆盖范围：
 * - runEval：命中率计算、topK 透传、seed 可复现、两次相同 seed 结果一致
 * - citation-audit：auditCitations 区分 valid / missing
 * - extractCitations：从 markdown 提取 sourceId
 * - requireCitations：整篇报告引用审计
 * - checkReportCoverage：覆盖度检查
 *
 * 运行方式：pnpm --filter @opsagent/agent test
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type {
  GBrainClient,
  GBrainSource,
  KnowledgeChunk,
  SearchOptions,
} from "../gbrain/types.js";
import {
  auditCitations,
  checkReportCoverage,
  extractCitations,
  requireCitations,
} from "./citation-audit.js";
import { runEval, type EvalQuestion } from "./eval/run-eval.js";

class FakeClient implements GBrainClient {
  constructor(
    private readonly answers: Record<string, KnowledgeChunk[]>,
    private readonly sources: GBrainSource[] = [],
  ) {}

  async search(options: SearchOptions): Promise<KnowledgeChunk[]> {
    return this.answers[options.query] ?? [];
  }
  async syncSource(): Promise<{ synced: number }> {
    return { synced: 0 };
  }
  async listSources(): Promise<GBrainSource[]> {
    return this.sources;
  }
}

const SOURCES: GBrainSource[] = [
  {
    id: "opsagent-architecture",
    path: "docs/architecture/",
    description: "架构",
    searchWeight: 1,
    syncMode: "on_demand",
  },
  {
    id: "opsagent-workflows",
    path: "docs/workflows/",
    description: "工作流",
    searchWeight: 1,
    syncMode: "on_demand",
  },
  {
    id: "opsagent-knowledge",
    path: "docs/knowledge/",
    description: "知识",
    searchWeight: 0.7,
    syncMode: "on_demand",
  },
];

describe("runEval — 命中率", () => {
  test("全部命中时 hitRate=1", async () => {
    const client = new FakeClient({
      "问题 A": [
        {
          id: "a1",
          sourceId: "opsagent-architecture",
          path: "p",
          title: "t",
          content: "c",
          score: 1,
        },
      ],
      "问题 B": [
        {
          id: "b1",
          sourceId: "opsagent-knowledge",
          path: "p",
          title: "t",
          content: "c",
          score: 1,
        },
      ],
    });
    const questions: EvalQuestion[] = [
      {
        id: "q1",
        question: "问题 A",
        expectedSourceId: "opsagent-architecture",
        category: "architecture",
      },
      {
        id: "q2",
        question: "问题 B",
        expectedSourceId: "opsagent-knowledge",
        category: "knowledge",
      },
    ];
    const report = await runEval(client, { questions, seed: 1 });
    assert.equal(report.hitRate, 1, "全部命中 hitRate 应为 1");
    assert.equal(report.hits, 2, "hits 应为 2");
    assert.equal(report.questions, 2, "questions 应为 2");
  });

  test("部分命中时 hitRate=0.5", async () => {
    const client = new FakeClient({
      命中: [
        {
          id: "h1",
          sourceId: "opsagent-architecture",
          path: "p",
          title: "t",
          content: "c",
          score: 1,
        },
      ],
      不命中: [
        {
          id: "m1",
          sourceId: "opsagent-knowledge",
          path: "p",
          title: "t",
          content: "c",
          score: 1,
        },
      ],
    });
    const questions: EvalQuestion[] = [
      {
        id: "q1",
        question: "命中",
        expectedSourceId: "opsagent-architecture",
        category: "architecture",
      },
      {
        id: "q2",
        question: "不命中",
        expectedSourceId: "opsagent-workflows",
        category: "workflow",
      },
    ];
    const report = await runEval(client, { questions, seed: 7 });
    assert.equal(report.hitRate, 0.5, "部分命中 hitRate 应为 0.5");
    assert.equal(report.hits, 1, "hits 应为 1");
  });

  test("seed 可复现：两次相同 seed 结果一致", async () => {
    const client = new FakeClient({});
    const questions: EvalQuestion[] = Array.from({ length: 10 }, (_, i) => ({
      id: `q${i}`,
      question: `question-${i}`,
      expectedSourceId: "opsagent-knowledge",
      category: "knowledge" as const,
    }));
    const r1 = await runEval(client, { questions, seed: 123 });
    const r2 = await runEval(client, { questions, seed: 123 });
    assert.deepEqual(
      r1.results.map((r) => r.questionId),
      r2.results.map((r) => r.questionId),
      "相同 seed 时 questionId 顺序应一致",
    );
  });
});

describe("citation-audit", () => {
  test("auditCitations 区分 valid / missing", async () => {
    const client = new FakeClient({}, SOURCES);
    const result = await auditCitations(client, [
      "opsagent-architecture",
      "opsagent-unknown",
      "opsagent-knowledge",
    ]);
    assert.equal(result.valid.length, 2, "应有 2 条 valid");
    assert.deepEqual(result.missing, ["opsagent-unknown"], "missing 应为 unknown");
    assert.equal(result.total, 3, "total 应为 3");
  });

  test("extractCitations 从 markdown 提取 sourceId", () => {
    const md =
      "## [knowledge:opsagent-architecture] Title\n- sourceId: opsagent-architecture\n## [knowledge:opsagent-knowledge] Title2\n- sourceId: opsagent-knowledge";
    const ids = extractCitations(md);
    assert.deepEqual(
      ids.sort(),
      ["opsagent-architecture", "opsagent-knowledge"],
      "应提取两条 sourceId 并去重",
    );
  });

  test("requireCitations 整篇报告审计", async () => {
    const client = new FakeClient({}, SOURCES);
    const md =
      "报告引用 sourceId: opsagent-architecture 和 sourceId: opsagent-unknown";
    const result = await requireCitations(client, md);
    assert.deepEqual(result.valid, ["opsagent-architecture"], "valid 应为 architecture");
    assert.deepEqual(result.missing, ["opsagent-unknown"], "missing 应为 unknown");
  });

  test("checkReportCoverage 报告覆盖度", async () => {
    const client = new FakeClient({}, SOURCES);
    const chunks: KnowledgeChunk[] = [
      {
        id: "a",
        sourceId: "opsagent-architecture",
        path: "p",
        title: "t",
        content: "c",
        score: 1,
      },
    ];
    const result = await checkReportCoverage(client, chunks);
    assert.equal(result.covered, false, "未覆盖全部源应为 false");
    assert.equal(
      result.coveredCount,
      1,
      "coveredCount 应为 1",
    );
    assert.ok(
      result.missingChunks.some((s) => s.startsWith("opsagent-workflows")),
      "missingChunks 应包含 workflows",
    );
  });
});
