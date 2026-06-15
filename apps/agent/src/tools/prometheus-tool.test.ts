/**
 * prometheus-tool.ts 单元测试
 *
 * 覆盖范围：
 * - 成功瞬时查询（vector）：请求参数拼接正确、结果标准化、unit 推断正确
 * - 成功 range 查询（matrix）：start/end/step 正确传递、values 被解析
 * - 空结果：result 为空数组时返回 success + results: []
 * - 网络错误：fetch 抛异常降级为结构化 error，不抛异常
 * - Prometheus 应用层错误：status=error 时返回 PROMETHEUS_ERROR
 * - HTTP 非 200：返回 FETCH_FAILED + 状态码
 * - 超时：AbortError 降级为 FETCH_FAILED
 * - 入参校验：空 query 被 zod min(1) 拦截
 * - unit 推断：覆盖 seconds / bytes / count / ratio / unknown
 *
 * 运行方式：pnpm --filter @opsagent/agent test
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  createPrometheusTool,
  type PrometheusDeps,
} from "./prometheus-tool.js";
import { PROMETHEUS_TOOL } from "./constants.js";

interface ToolCallInput {
  query: string;
  time?: string;
  range?: { start: string; end: string; step?: string };
}

interface FakeResponse {
  ok: boolean;
  status: number;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
}

function buildDeps(
  overrides: Partial<PrometheusDeps> & {
    response?: FakeResponse;
    fetchError?: Error;
    capturedUrls?: string[];
  } = {},
): PrometheusDeps {
  const capturedUrls = overrides.capturedUrls ?? [];
  const response = overrides.response;
  const fetchError = overrides.fetchError;
  const fetchImpl = async (input: string | URL | Request): Promise<Response> => {
    capturedUrls.push(typeof input === "string" ? input : input.toString());
    if (fetchError) throw fetchError;
    if (!response) {
      throw new Error("no response configured in buildDeps");
    }
    return {
      ok: response.ok,
      status: response.status,
      text:
        response.text ??
        (async () => ""),
      json:
        response.json ??
        (async () => ({})),
      headers: new Headers(),
    } as unknown as Response;
  };
  const { response: _r, fetchError: _f, capturedUrls: _c, ...rest } = overrides;
  return {
    endpoint: "http://prom.test:9090",
    fetch: fetchImpl as typeof fetch,
    timeoutMs: 5000,
    ...rest,
  };
}

async function callWith(
  input: ToolCallInput,
  overrides: Parameters<typeof buildDeps>[0] = {},
) {
  const capturedUrls: string[] = [];
  const deps = buildDeps({ ...overrides, capturedUrls });
  const tool = createPrometheusTool(deps);
  const execute = tool.execute;
  if (!execute) throw new Error("tool.execute should exist");
  const result = (await execute(input, {} as any)) as {
    status: "success" | "error";
    results: Array<{
      metric: Record<string, string>;
      value?: number;
      timestamp?: number;
      values?: Array<{ timestamp: number; value: number }>;
      unit: string;
    }>;
    error?: string;
  };
  if (!result) throw new Error("tool.execute should return a value");
  return { result, capturedUrls };
}

describe("createPrometheusTool — 成功瞬时查询", () => {
  test("vector 结果被标准化、unit 推断为 count", async () => {
    const { result, capturedUrls } = await callWith(
      { query: "sum(rate(http_requests_total[5m]))" },
      {
        response: {
          ok: true,
          status: 200,
          json: async () => ({
            status: "success",
            data: {
              resultType: "vector",
              result: [
                {
                  metric: { __name__: "http_requests_total", method: "GET" },
                  value: [1_700_000_000, "42.5"],
                },
              ],
            },
          }),
        },
      },
    );

    assert.equal(result.status, "success", "status 应为 success");
    assert.equal(result.results.length, 1, "应解析出 1 条结果");
    const first = result.results[0];
    if (!first) throw new Error("first result missing");
    assert.equal(first.value, 42.5, "value 应为 42.5");
    assert.equal(first.timestamp, 1_700_000_000, "timestamp 应透传");
    assert.equal(first.unit, PROMETHEUS_TOOL.UNIT.COUNT, "http_requests_total 推断 count");
    assert.deepEqual(
      first.metric,
      { __name__: "http_requests_total", method: "GET" },
      "metric 应原样透传",
    );
    assert.equal(capturedUrls.length, 1, "应发起 1 次请求");
    const url = new URL(capturedUrls[0]!);
    assert.equal(url.pathname, PROMETHEUS_TOOL.API_PATH.QUERY, "应走 /api/v1/query");
    assert.equal(
      url.searchParams.get("query"),
      "sum(rate(http_requests_total[5m]))",
      "query 参数应被编码",
    );
    assert.equal(
      url.searchParams.has("start"),
      false,
      "瞬时查询不应带 start",
    );
  });

  test("传入 time 参数时拼接到 URL", async () => {
    const { capturedUrls } = await callWith(
      { query: "up", time: "2026-06-11T10:00:00Z" },
      {
        response: {
          ok: true,
          status: 200,
          json: async () => ({
            status: "success",
            data: { resultType: "vector", result: [] },
          }),
        },
      },
    );
    const url = new URL(capturedUrls[0]!);
    assert.equal(
      url.searchParams.get("time"),
      String(Date.parse("2026-06-11T10:00:00Z") / 1000),
      "ISO 时间应被转换为 unix 秒",
    );
  });

  test("scalar 结果被包装为单条结果", async () => {
    const { result } = await callWith(
      { query: "1+1" },
      {
        response: {
          ok: true,
          status: 200,
          json: async () => ({
            status: "success",
            data: { resultType: "scalar", result: [1_700_000_000, "2"] },
          }),
        },
      },
    );
    assert.equal(result.status, "success", "scalar 应成功");
    assert.equal(result.results.length, 1, "scalar 包装为 1 条结果");
    assert.equal(result.results[0]?.value, 2, "scalar value 应为 2");
    assert.equal(
      result.results[0]?.unit,
      PROMETHEUS_TOOL.UNIT.UNKNOWN,
      "无 metric 名时 unit 为 unknown",
    );
  });
});

describe("createPrometheusTool — 成功 range 查询", () => {
  test("matrix 结果被标准化为 values 数组", async () => {
    const { result, capturedUrls } = await callWith(
      {
        query: "rate(http_request_duration_seconds_sum[5m])",
        range: { start: "2026-06-11T09:00:00Z", end: "2026-06-11T10:00:00Z", step: "60s" },
      },
      {
        response: {
          ok: true,
          status: 200,
          json: async () => ({
            status: "success",
            data: {
              resultType: "matrix",
              result: [
                {
                  metric: { __name__: "http_request_duration_seconds" },
                  values: [
                    [1_700_000_000, "0.1"],
                    [1_700_000_060, "0.2"],
                  ],
                },
              ],
            },
          }),
        },
      },
    );

    assert.equal(result.status, "success", "status 应为 success");
    assert.equal(result.results.length, 1, "应解析出 1 条 series");
    const first = result.results[0];
    if (!first) throw new Error("first result missing");
    assert.equal(first.values?.length, 2, "values 长度应为 2");
    assert.equal(first.values?.[0]?.value, 0.1, "第一个 value 应为 0.1");
    assert.equal(first.values?.[1]?.timestamp, 1_700_000_060, "第二个 timestamp 应透传");
    assert.equal(
      first.unit,
      PROMETHEUS_TOOL.UNIT.SECONDS,
      "http_request_duration_seconds 推断 seconds",
    );

    const url = new URL(capturedUrls[0]!);
    assert.equal(
      url.pathname,
      PROMETHEUS_TOOL.API_PATH.QUERY_RANGE,
      "应走 /api/v1/query_range",
    );
    assert.equal(url.searchParams.get("step"), "60s", "step 应透传");
    assert.ok(url.searchParams.get("start"), "start 应存在");
    assert.ok(url.searchParams.get("end"), "end 应存在");
  });

  test("step 未传时使用 DEFAULT_STEP", async () => {
    const { capturedUrls } = await callWith(
      {
        query: "up",
        range: { start: "1700000000", end: "1700003600" },
      },
      {
        response: {
          ok: true,
          status: 200,
          json: async () => ({
            status: "success",
            data: { resultType: "matrix", result: [] },
          }),
        },
      },
    );
    const url = new URL(capturedUrls[0]!);
    assert.equal(
      url.searchParams.get("step"),
      PROMETHEUS_TOOL.DEFAULT_STEP,
      "默认 step 应生效",
    );
    assert.equal(
      url.searchParams.get("start"),
      "1700000000",
      "unix 秒字符串应透传",
    );
  });
});

describe("createPrometheusTool — 空结果", () => {
  test("result 为空数组时返回 success + results: []", async () => {
    const { result } = await callWith(
      { query: "nonexistent_metric" },
      {
        response: {
          ok: true,
          status: 200,
          json: async () => ({
            status: "success",
            data: { resultType: "vector", result: [] },
          }),
        },
      },
    );

    assert.equal(result.status, "success", "空结果仍为 success");
    assert.deepEqual(result.results, [], "results 应为空数组");
    assert.equal(result.error, undefined, "不应包含 error 字段");
  });
});

describe("createPrometheusTool — 网络与协议错误", () => {
  test("fetch 抛异常时降级为 FETCH_FAILED 而非抛出", async () => {
    const { result } = await callWith(
      { query: "up" },
      { fetchError: new Error("ECONNREFUSED") },
    );

    assert.equal(result.status, "error", "status 应为 error");
    assert.deepEqual(result.results, [], "results 应为空");
    assert.ok(
      result.error?.startsWith(`${PROMETHEUS_TOOL.ERROR.FETCH_FAILED}:`),
      "error 应以 FETCH_FAILED 开头",
    );
    assert.ok(
      result.error?.includes("ECONNREFUSED"),
      "error 应包含原始错误信息",
    );
  });

  test("HTTP 503 返回 FETCH_FAILED + 状态码", async () => {
    const { result } = await callWith(
      { query: "up" },
      {
        response: {
          ok: false,
          status: 503,
          text: async () => "service unavailable",
        },
      },
    );
    assert.equal(result.status, "error", "status 应为 error");
    assert.ok(
      result.error?.includes("503"),
      "error 应包含状态码",
    );
    assert.ok(
      result.error?.includes("service unavailable"),
      "error 应包含响应体",
    );
  });

  test("Prometheus 应用层错误返回 PROMETHEUS_ERROR", async () => {
    const { result } = await callWith(
      { query: "invalid(promql" },
      {
        response: {
          ok: true,
          status: 200,
          json: async () => ({
            status: "error",
            errorType: "bad_data",
            error: "parse error",
          }),
        },
      },
    );
    assert.equal(result.status, "error", "status 应为 error");
    assert.ok(
      result.error?.startsWith(PROMETHEUS_TOOL.ERROR.PROMETHEUS_ERROR),
      "error 应以 PROMETHEUS_ERROR 开头",
    );
    assert.ok(result.error?.includes("bad_data"), "应包含 errorType");
    assert.ok(result.error?.includes("parse error"), "应包含 error 原文");
  });

  test("AbortError 降级为 FETCH_FAILED", async () => {
    const { result } = await callWith(
      { query: "up" },
      { fetchError: new Error("The operation was aborted") },
    );
    assert.equal(result.status, "error", "status 应为 error");
    assert.ok(
      result.error?.startsWith(PROMETHEUS_TOOL.ERROR.FETCH_FAILED),
      "AbortError 应被归类为 FETCH_FAILED",
    );
  });
});

describe("createPrometheusTool — 入参校验", () => {
  test("空 query 被 zod min(1) 拦截", async () => {
    const tool = createPrometheusTool(buildDeps());
    const execute = tool.execute;
    if (!execute) throw new Error("tool.execute should exist");

    const result = (await execute({ query: "" }, {} as any)) as {
      error?: boolean;
      message?: string;
    };

    assert.equal(result.error, true, "Mastra 应返回 error: true");
    assert.ok(
      typeof result.message === "string" &&
        result.message.includes("query") &&
        result.message.includes("Too small"),
      "message 应提示 query 字段的 min(1) 校验失败",
    );
  });

  test("range.start 为空字符串时被拦截", async () => {
    const tool = createPrometheusTool(buildDeps());
    const execute = tool.execute;
    if (!execute) throw new Error("tool.execute should exist");

    const result = (await execute(
      { query: "up", range: { start: "", end: "2026-06-11T10:00:00Z" } },
      {} as any,
    )) as { error?: boolean; message?: string };
    assert.equal(result.error, true, "空 start 应触发校验失败");
  });
});

describe("createPrometheusTool — unit 推断", () => {
  async function runUnitCase(metricName: string, expectedUnit: string) {
    const { result } = await callWith(
      { query: metricName },
      {
        response: {
          ok: true,
          status: 200,
          json: async () => ({
            status: "success",
            data: {
              resultType: "vector",
              result: [{ metric: { __name__: metricName }, value: [0, "1"] }],
            },
          }),
        },
      },
    );
    assert.equal(
      result.results[0]?.unit,
      expectedUnit,
      `${metricName} 应推断为 ${expectedUnit}`,
    );
  }

  test("http_request_duration_seconds → seconds", async () => {
    await runUnitCase("http_request_duration_seconds", PROMETHEUS_TOOL.UNIT.SECONDS);
  });

  test("process_resident_memory_bytes → bytes", async () => {
    await runUnitCase("process_resident_memory_bytes", PROMETHEUS_TOOL.UNIT.BYTES);
  });

  test("node_cpu_seconds_total → count（_total 优先）", async () => {
    await runUnitCase("node_cpu_seconds_total", PROMETHEUS_TOOL.UNIT.COUNT);
  });

  test("http_success_ratio → ratio", async () => {
    await runUnitCase("http_success_ratio", PROMETHEUS_TOOL.UNIT.RATIO);
  });

  test("无 metric 名 → unknown", async () => {
    const { result } = await callWith(
      { query: "scalar(1)" },
      {
        response: {
          ok: true,
          status: 200,
          json: async () => ({
            status: "success",
            data: {
              resultType: "vector",
              result: [{ metric: {}, value: [0, "1"] }],
            },
          }),
        },
      },
    );
    assert.equal(
      result.results[0]?.unit,
      PROMETHEUS_TOOL.UNIT.UNKNOWN,
      "无 __name__ 应为 unknown",
    );
  });
});
