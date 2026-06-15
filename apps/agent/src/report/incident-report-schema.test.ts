/**
 * incident-report-schema.ts 单元测试
 *
 * 覆盖范围：
 * - 合法报告通过 IncidentReportSchema 校验
 * - 缺失必填字段时校验失败
 * - phase 仅接受 INCIDENT_PHASE 枚举
 * - severity 仅接受 INCIDENT_SEVERITY 枚举
 * - incidentId 格式必须为 YYYYMMDD-NNN
 * - rootCause 最短 20 字符
 *
 * 运行方式：pnpm --filter @opsagent/agent test
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { INCIDENT_PHASE, INCIDENT_SEVERITY } from "../constants.js";
import {
  IncidentReportSchema,
  type IncidentReport,
} from "./incident-report-schema.js";

const FIXTURE_VALID_REPORT: IncidentReport = {
  incidentId: "20260611-001",
  summary: {
    detectedAt: "2026-06-11T10:00:00Z",
    phase: INCIDENT_PHASE.DETECTED,
    impact: "backend /api/orders 500 错误率 100%",
    severity: INCIDENT_SEVERITY.P1,
    mitigationStatus: "unmitigated",
  },
  evidence: {
    metrics: [
      {
        query: "sum(rate(http_requests_total[5m]))",
        results: [{ value: 0.035 }],
        conclusion: "请求速率正常，5xx 突增",
      },
    ],
    logs: {
      query: '{job="opsagent-backend"} | json | level="ERROR"',
      entries: [
        {
          timestamp: "2026-06-11T10:00:00Z",
          line: '{"level":"ERROR","msg":"db down"}',
          labels: { job: "opsagent-backend" },
          detectedLevel: "error",
        },
      ],
      traceIds: ["abc123"],
    },
    traces: [
      {
        traceId: "abc123",
        rootService: "opsagent-backend",
        durationMs: 1234,
        spans: [
          {
            spanId: "ff244c77d9fc4bed",
            operationName: "POST /api/orders",
            serviceName: "opsagent-backend",
            durationMs: 1234,
            status: "ERROR",
            attributes: { "opsagent.error.code": "DB_DOWN" },
          },
        ],
      },
    ],
    gitContext: [
      {
        path: "apps/backend/src/db.ts",
        recentCommits: [
          {
            hash: "abc123",
            author: "Alice",
            date: "2026-06-11",
            message: "feat: db pool",
          },
        ],
        suspiciousChange: "连接池上限被改小",
      },
    ],
  },
  rootCause: "数据库连接池上限被意外改小，在高并发请求时迅速耗尽，导致后续请求抛出连接不可用异常。",
  recommendations: {
    shortTerm: "回滚连接池上限改动并扩容",
    longTerm: "引入连接池配置变更保护",
    prevention: "增加连接池水位监控与 SLO 告警",
  },
  review: {
    reviewer: "",
    conclusion: "adopted",
    comments: "",
  },
  lifecycle: {
    phases: [
      { phase: INCIDENT_PHASE.DETECTED, at: "2026-06-11T10:00:00Z" },
    ],
    current: INCIDENT_PHASE.DETECTED,
  },
};

describe("IncidentReportSchema — 合法报告", () => {
  test("完整报告通过校验", () => {
    const parsed = IncidentReportSchema.safeParse(FIXTURE_VALID_REPORT);
    assert.equal(parsed.success, true, "完整报告应通过校验");
  });
});

describe("IncidentReportSchema — 必填字段缺失", () => {
  test("缺少 incidentId 时校验失败", () => {
    const { incidentId: _id, ...rest } = FIXTURE_VALID_REPORT;
    const parsed = IncidentReportSchema.safeParse(rest);
    assert.equal(parsed.success, false, "缺少 incidentId 应失败");
  });

  test("缺少 summary 时校验失败", () => {
    const { summary: _s, ...rest } = FIXTURE_VALID_REPORT;
    const parsed = IncidentReportSchema.safeParse(rest);
    assert.equal(parsed.success, false, "缺少 summary 应失败");
  });

  test("缺少 evidence 时校验失败", () => {
    const { evidence: _e, ...rest } = FIXTURE_VALID_REPORT;
    const parsed = IncidentReportSchema.safeParse(rest);
    assert.equal(parsed.success, false, "缺少 evidence 应失败");
  });
});

describe("IncidentReportSchema — 枚举约束", () => {
  test("phase 非法时校验失败", () => {
    const bad = {
      ...FIXTURE_VALID_REPORT,
      summary: { ...FIXTURE_VALID_REPORT.summary, phase: "resolved" },
    };
    const parsed = IncidentReportSchema.safeParse(bad);
    assert.equal(parsed.success, false, "非法 phase 应失败");
  });

  test("severity 非法时校验失败", () => {
    const bad = {
      ...FIXTURE_VALID_REPORT,
      summary: { ...FIXTURE_VALID_REPORT.summary, severity: "P9" },
    };
    const parsed = IncidentReportSchema.safeParse(bad);
    assert.equal(parsed.success, false, "非法 severity 应失败");
  });

  test("incidentId 格式错误时校验失败", () => {
    const bad = { ...FIXTURE_VALID_REPORT, incidentId: "INC-001" };
    const parsed = IncidentReportSchema.safeParse(bad);
    assert.equal(
      parsed.success,
      false,
      "incidentId 必须为 YYYYMMDD-NNN 格式",
    );
  });

  test("rootCause 过短时校验失败", () => {
    const bad = { ...FIXTURE_VALID_REPORT, rootCause: "太短" };
    const parsed = IncidentReportSchema.safeParse(bad);
    assert.equal(parsed.success, false, "rootCause < 20 字符应失败");
  });
});
