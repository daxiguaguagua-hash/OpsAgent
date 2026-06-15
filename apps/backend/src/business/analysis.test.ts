/**
 * analysis.ts 单元测试
 *
 * 覆盖范围：
 * - generateIncidentId 格式 YYYYMMDD-NNN
 * - renderIncidentMarkdown 五段式渲染（含证据、警告、空证据占位）
 * - AnalysisResponseSchema 非法 incidentId / markdown 过短拦截
 * - createDefaultAnalysisService 委托 pipeline
 *
 * 运行方式：pnpm --filter backend test
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  INCIDENT_MITIGATION_STATUS,
  INCIDENT_PHASE,
  INCIDENT_SEVERITY,
  generateIncidentId,
  renderIncidentMarkdown,
  type IncidentReport,
} from "@opsagent/agent";

import {
  AnalysisResponseSchema,
  createDefaultAnalysisService,
} from "./analysis";

const FIXTURE_REPORT: IncidentReport = {
  incidentId: "20260611-630",
  summary: {
    detectedAt: "2026-06-11T10:30:00.000Z",
    phase: INCIDENT_PHASE.DETECTED,
    impact: "backend /api/*",
    severity: INCIDENT_SEVERITY.P1,
    mitigationStatus: INCIDENT_MITIGATION_STATUS.UNMITIGATED,
  },
  evidence: {
    metrics: [
      {
        query: "sum(rate(http_requests_total[5m]))",
        results: [{ value: 0.035 }],
        conclusion: "5xx 错误率为 0.035",
      },
    ],
    logs: {
      query: '{job="backend"} | json | level="ERROR"',
      entries: [
        {
          timestamp: "2026-06-11T10:00:00Z",
          line: '{"level":"ERROR","msg":"db down"}',
          labels: { job: "backend" },
          detectedLevel: "ERROR",
        },
      ],
      traceIds: [],
    },
    traces: [],
    gitContext: [],
  },
  rootCause: "数据库连接池耗尽导致后端服务不可用",
  recommendations: {
    shortTerm: "重启服务并清理连接池",
    longTerm: "增加连接池大小限制和超时配置",
    prevention: "添加连接池监控告警",
  },
  review: {
    reviewer: "",
    conclusion: "adopted",
    comments: "",
  },
};

describe("generateIncidentId", () => {
  test("格式为 YYYYMMDD-NNN", () => {
    const id = generateIncidentId(new Date("2026-06-11T10:30:00Z"));
    assert.match(
      id,
      /^[0-9]{8}-[0-9]{3}$/,
      "incidentId 必须为 YYYYMMDD-NNN 格式",
    );
    assert.ok(id.startsWith("20260611"), "日期部分应为 20260611");
  });

  test("午夜时分 seq 为 000", () => {
    const id = generateIncidentId(new Date("2026-06-11T00:00:00Z"));
    assert.equal(id, "20260611-000", "午夜 seq 应为 000");
  });
});

describe("renderIncidentMarkdown", () => {
  test("渲染包含五段式模板", () => {
    const md = renderIncidentMarkdown(FIXTURE_REPORT);
    assert.ok(
      md.includes("# Incident Report: 20260611-630"),
      "应包含标题",
    );
    assert.ok(md.includes("## 1. 摘要"), "应包含摘要段");
    assert.ok(md.includes("## 2. 证据"), "应包含证据段");
    assert.ok(md.includes("## 3. 根因分析"), "应包含根因段");
    assert.ok(md.includes("## 4. 建议"), "应包含建议段");
    assert.ok(md.includes("## 5. 人类审核"), "应包含审核段");
  });

  test("包含指标和日志证据", () => {
    const md = renderIncidentMarkdown(FIXTURE_REPORT);
    assert.ok(md.includes("0.035"), "应包含 metric 结论");
    assert.ok(md.includes("db down"), "应包含日志原文");
  });

  test("包含根因和建议", () => {
    const md = renderIncidentMarkdown(FIXTURE_REPORT);
    assert.ok(
      md.includes("数据库连接池耗尽"),
      "应包含根因分析",
    );
    assert.ok(
      md.includes("重启服务并清理连接池"),
      "应包含短期建议",
    );
  });

  test("空证据时显示占位", () => {
    const emptyReport: IncidentReport = {
      ...FIXTURE_REPORT,
      evidence: {
        metrics: [],
        logs: { query: "", entries: [], traceIds: [] },
        traces: [],
        gitContext: [],
      },
    };
    const md = renderIncidentMarkdown(emptyReport);
    assert.ok(md.includes("无指标数据"), "应显示 metric 占位");
    assert.ok(md.includes("无错误日志"), "应显示 log 占位");
    assert.ok(md.includes("无链路数据"), "应显示 trace 占位");
    assert.ok(md.includes("无源码上下文"), "应显示 git 占位");
  });

  test("包含链路和 Git 证据", () => {
    const reportWithTraces: IncidentReport = {
      ...FIXTURE_REPORT,
      evidence: {
        ...FIXTURE_REPORT.evidence,
        traces: [
          {
            traceId: "abc123",
            rootService: "backend",
            durationMs: 5000,
            spans: [
              {
                spanId: "span1",
                operationName: "GET /api/orders",
                serviceName: "backend",
                durationMs: 5000,
                status: "ERROR",
              },
            ],
          },
        ],
        gitContext: [
          {
            path: "apps/backend/src/business/orders.ts",
            recentCommits: [
              {
                hash: "abc1234567890",
                author: "dev",
                date: "2026-06-11",
                message: "fix: order query timeout",
              },
            ],
          },
        ],
      },
    };
    const md = renderIncidentMarkdown(reportWithTraces);
    assert.ok(md.includes("abc123"), "应包含 traceId");
    assert.ok(md.includes("backend"), "应包含 rootService");
    assert.ok(md.includes("abc1234"), "应包含 commit hash");
    assert.ok(
      md.includes("order query timeout"),
      "应包含 commit message",
    );
  });
});

describe("AnalysisResponseSchema", () => {
  test("非法 incidentId 被拦截", () => {
    const parsed = AnalysisResponseSchema.safeParse({
      incidentId: "INC-001",
      markdown: "x".repeat(30),
      generatedAt: "2026-06-11T10:00:00Z",
      provider: "mock",
    });
    assert.equal(parsed.success, false, "INC-001 应被拦截");
  });

  test("markdown 过短被拦截", () => {
    const parsed = AnalysisResponseSchema.safeParse({
      incidentId: "20260611-001",
      markdown: "x",
      generatedAt: "2026-06-11T10:00:00Z",
      provider: "mock",
    });
    assert.equal(parsed.success, false, "短 markdown 应被拦截");
  });

  test("合法数据通过校验", () => {
    const parsed = AnalysisResponseSchema.safeParse({
      incidentId: "20260611-001",
      markdown: "x".repeat(30),
      generatedAt: "2026-06-11T10:00:00Z",
      provider: "mock",
    });
    assert.equal(parsed.success, true, "合法数据应通过");
  });
});

describe("createDefaultAnalysisService", () => {
  test("返回有效响应", async () => {
    const service = createDefaultAnalysisService();
    const result = await service.generate();

    assert.match(
      result.incidentId,
      /^[0-9]{8}-[0-9]{3}$/,
      "incidentId 格式应为 YYYYMMDD-NNN",
    );
    assert.ok(result.markdown.length > 0, "markdown 不应为空");
    assert.ok(result.generatedAt.length > 0, "generatedAt 不应为空");
    assert.ok(result.provider.length > 0, "provider 不应为空");
  });
});
