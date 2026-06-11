/**
 * analysis.ts 单元测试
 *
 * 覆盖范围：
 * - generateIncidentId 格式 YYYYMMDD-NNN
 * - createMockReportRenderer 渲染包含五段式模板
 * - createAnalysisService 编排 collector + renderer + 校验
 * - createHttpEvidenceCollector 真实 HTTP 采集（命中/错误/警告）
 * - AnalysisResponseSchema 非法 incidentId / markdown 过短拦截
 *
 * 运行方式：pnpm --filter backend test
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  AnalysisResponseSchema,
  createAnalysisService,
  createHttpEvidenceCollector,
  createMockReportRenderer,
  generateIncidentId,
  type EvidenceBundle,
} from "./analysis";

const FIXTURE_BUNDLE: EvidenceBundle = {
  metrics: [
    {
      query: "sum(rate(http_requests_total[5m]))",
      result: "0.035",
    },
  ],
  logs: [
    {
      timestamp: "2026-06-11T10:00:00Z",
      level: "ERROR",
      line: '{"level":"ERROR","msg":"db down"}',
    },
  ],
  traces: [],
  git: [],
  warnings: [],
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
});

describe("createMockReportRenderer", () => {
  test("渲染包含五段式模板", () => {
    const renderer = createMockReportRenderer();
    const md = renderer.render("20260611-001", FIXTURE_BUNDLE);
    assert.ok(md.includes("# Incident Report: 20260611-001"), "应包含标题");
    assert.ok(md.includes("## 1. 摘要"), "应包含摘要段");
    assert.ok(md.includes("## 2. 证据"), "应包含证据段");
    assert.ok(md.includes("## 3. 根因分析"), "应包含根因段");
    assert.ok(md.includes("## 4. 建议"), "应包含建议段");
    assert.ok(md.includes("## 5. 人类审核"), "应包含审核段");
    assert.ok(md.includes("0.035"), "应包含 metric 结果");
    assert.ok(md.includes("db down"), "应包含日志原文");
  });

  test("无证据时显示占位", () => {
    const renderer = createMockReportRenderer();
    const md = renderer.render("20260611-001", {
      metrics: [],
      logs: [],
      traces: [],
      git: [],
      warnings: [],
    });
    assert.ok(md.includes("无指标数据"), "应显示 metric 占位");
    assert.ok(md.includes("无错误日志"), "应显示 log 占位");
  });

  test("warnings 以引用块渲染", () => {
    const renderer = createMockReportRenderer();
    const md = renderer.render("20260611-001", {
      ...FIXTURE_BUNDLE,
      warnings: ["prometheus timeout", "loki unavailable"],
    });
    assert.ok(md.includes("⚠️ 采集警告"), "应包含警告标题");
    assert.ok(md.includes("prometheus timeout"), "应包含第一条警告");
    assert.ok(md.includes("loki unavailable"), "应包含第二条警告");
  });
});

describe("createAnalysisService", () => {
  test("编排 collector + renderer 并通过 schema", async () => {
    let collected = false;
    const service = createAnalysisService({
      collector: {
        collect: async () => {
          collected = true;
          return FIXTURE_BUNDLE;
        },
      },
      renderer: createMockReportRenderer(),
      now: () => new Date("2026-06-11T10:30:00Z"),
    });
    const result = await service.generate();
    assert.equal(collected, true, "collector 应被调用");
    assert.equal(result.incidentId, "20260611-630", "incidentId 应匹配");
    assert.equal(
      result.generatedAt,
      "2026-06-11T10:30:00.000Z",
      "generatedAt 应使用注入的 now",
    );
    assert.equal(result.provider, "mock", "provider 应为 mock");
    assert.ok(
      result.markdown.includes("# Incident Report"),
      "markdown 应来自 renderer",
    );
  });

  test("collector 抛错时向上抛", async () => {
    const service = createAnalysisService({
      collector: {
        collect: async () => {
          throw new Error("prometheus down");
        },
      },
      renderer: createMockReportRenderer(),
    });
    await assert.rejects(
      () => service.generate(),
      /prometheus down/,
      "collector 抛错应向上传播",
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

describe("createHttpEvidenceCollector", () => {
  test("fetch 返回 200 + 合法 JSON 时解析 metric 与 log", async () => {
    const fakeFetch = (async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();
      const pathname = new URL(url).pathname;
      if (pathname === "/api/v1/query") {
        return new Response(
          JSON.stringify({
            data: { result: [{ value: [1700000000, "0.042"] }] },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (pathname === "/loki/api/v1/query_range") {
        return new Response(
          JSON.stringify({
            data: {
              result: [
                {
                  stream: { level: "ERROR" },
                  values: [["1700000000000000000", '{"msg":"boom"}']],
                },
              ],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const collector = createHttpEvidenceCollector(fakeFetch);
    const bundle = await collector.collect();
    assert.equal(bundle.metrics.length, 1, "应解析 1 条 metric");
    assert.equal(bundle.metrics[0]?.result, "0.042", "metric 值应为 0.042");
    assert.equal(bundle.logs.length, 1, "应解析 1 条 log");
    assert.equal(bundle.logs[0]?.level, "ERROR", "log level 应为 ERROR");
    assert.equal(bundle.warnings.length, 0, "不应有 warnings");
  });

  test("fetch 抛异常时降级为 warning 而非抛错", async () => {
    const fakeFetch = (async () => {
      throw new Error("network down");
    }) as typeof fetch;
    const collector = createHttpEvidenceCollector(fakeFetch);
    const bundle = await collector.collect();
    assert.equal(bundle.metrics.length, 0, "metric 应为空");
    assert.equal(bundle.logs.length, 0, "log 应为空");
    assert.ok(bundle.warnings.length >= 2, "至少 2 条 warning（prom + loki）");
    assert.ok(
      bundle.warnings.some((w) => w.includes("network down")),
      "warning 应包含错误信息",
    );
  });

  test("HTTP 5xx 时降级为 warning", async () => {
    const fakeFetch = (async () =>
      new Response("boom", { status: 503 })) as typeof fetch;
    const collector = createHttpEvidenceCollector(fakeFetch);
    const bundle = await collector.collect();
    assert.ok(bundle.warnings.length >= 2, "应有 warnings");
    assert.ok(
      bundle.warnings.some((w) => w.includes("503")),
      "warning 应包含状态码",
    );
  });
});
