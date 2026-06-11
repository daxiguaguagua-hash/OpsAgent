/**
 * loki-tool.ts 单元测试
 *
 * 覆盖范围：
 * - 成功 streams 查询：entries 被标准化、detectedLevel 透传、按时间倒序
 * - 时间窗口：start/end 被转换为 unix 纳秒并拼接到 URL
 * - limit 透传与默认值
 * - 空结果：result 为空数组时返回 success + entries: []
 * - 网络错误：fetch 抛异常降级为结构化 error
 * - HTTP 非 200：返回 FETCH_FAILED + 状态码
 * - Loki 应用层错误：status != success 时返回 LOKI_ERROR
 * - 入参校验：空 query 被 zod min(1) 拦截；limit 超界被拦截
 *
 * 运行方式：pnpm --filter @opsagent/agent test
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { createLokiTool, type LokiDeps } from "./loki-tool.js";
import { LOKI_TOOL } from "./constants.js";

interface ToolCallInput {
  query: string;
  start?: string;
  end?: string;
  limit?: number;
}

interface FakeResponse {
  ok: boolean;
  status: number;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
}

function buildDeps(
  overrides: Partial<LokiDeps> & {
    response?: FakeResponse;
    fetchError?: Error;
    capturedUrls?: string[];
    fixedNow?: number;
  } = {},
): LokiDeps {
  const capturedUrls = overrides.capturedUrls ?? [];
  const response = overrides.response;
  const fetchError = overrides.fetchError;
  const fetchImpl = async (input: string | URL | Request): Promise<Response> => {
    capturedUrls.push(typeof input === "string" ? input : input.toString());
    if (fetchError) throw fetchError;
    if (!response) throw new Error("no response configured in buildDeps");
    return {
      ok: response.ok,
      status: response.status,
      text: response.text ?? (async () => ""),
      json: response.json ?? (async () => ({})),
      headers: new Headers(),
    } as unknown as Response;
  };
  return {
    endpoint: "http://loki.test:3100",
    fetch: fetchImpl as typeof fetch,
    timeoutMs: 5000,
    now: () => overrides.fixedNow ?? 1_700_000_000_000,
  };
}

async function callWith(
  input: ToolCallInput,
  overrides: Parameters<typeof buildDeps>[0] = {},
) {
  const capturedUrls: string[] = [];
  const deps = buildDeps({ ...overrides, capturedUrls });
  const tool = createLokiTool(deps);
  const execute = tool.execute;
  if (!execute) throw new Error("tool.execute should exist");
  const result = (await execute(input, {} as any)) as {
    status: "success" | "error";
    entries: Array<{
      timestamp: string;
      line: string;
      labels: Record<string, string>;
      detectedLevel?: string;
    }>;
    error?: string;
  };
  if (!result) throw new Error("tool.execute should return a value");
  return { result, capturedUrls };
}

describe("createLokiTool — 成功 streams 查询", () => {
  test("entries 被标准化、detectedLevel 透传、按时间倒序", async () => {
    const { result, capturedUrls } = await callWith(
      { query: '{job="opsagent-backend"} | json' },
      {
        response: {
          ok: true,
          status: 200,
          json: async () => ({
            status: "success",
            data: {
              resultType: "streams",
              result: [
                {
                  stream: {
                    job: "opsagent-backend",
                    detected_level: "error",
                    filename: "/var/log/opsagent/backend.jsonl",
                  },
                  values: [
                    ["1700000010000000000", '{"level":"ERROR","msg":"db down"}'],
                    ["1700000005000000000", '{"level":"ERROR","msg":"timeout"}'],
                  ],
                },
              ],
            },
          }),
        },
      },
    );

    assert.equal(result.status, "success", "status 应为 success");
    assert.equal(result.entries.length, 2, "应解析出 2 条 entries");
    const [first, second] = result.entries;
    if (!first || !second) throw new Error("entries missing");
    assert.equal(
      first.timestamp,
      new Date(1_700_000_010_000).toISOString(),
      "纳秒时间戳应被转换为 ISO",
    );
    assert.equal(
      first.line,
      '{"level":"ERROR","msg":"db down"}',
      "line 应透传",
    );
    assert.equal(
      first.labels.job,
      "opsagent-backend",
      "labels.job 应透传",
    );
    assert.equal(
      first.detectedLevel,
      "error",
      "detectedLevel 应从 stream labels 透传",
    );
    assert.ok(
      first.timestamp > second.timestamp,
      "应按时间倒序（最新在前）",
    );

    assert.equal(capturedUrls.length, 1, "应发起 1 次请求");
    const url = new URL(capturedUrls[0]!);
    assert.equal(
      url.pathname,
      LOKI_TOOL.API_PATH.QUERY_RANGE,
      "应走 /loki/api/v1/query_range",
    );
    assert.equal(
      url.searchParams.get("query"),
      '{job="opsagent-backend"} | json',
      "query 参数应被编码",
    );
  });

  test("start/end 被转换为 unix 纳秒", async () => {
    const { capturedUrls } = await callWith(
      {
        query: '{job="opsagent-backend"}',
        start: "2026-06-11T10:00:00Z",
        end: "2026-06-11T11:00:00Z",
        limit: 50,
      },
      {
        response: {
          ok: true,
          status: 200,
          json: async () => ({
            status: "success",
            data: { resultType: "streams", result: [] },
          }),
        },
      },
    );
    const url = new URL(capturedUrls[0]!);
    const expectedStart = String(
      BigInt(Date.parse("2026-06-11T10:00:00Z")) * 1_000_000n,
    );
    const expectedEnd = String(
      BigInt(Date.parse("2026-06-11T11:00:00Z")) * 1_000_000n,
    );
    assert.equal(
      url.searchParams.get("start"),
      expectedStart,
      "start ISO 应被转换为 unix 纳秒",
    );
    assert.equal(
      url.searchParams.get("end"),
      expectedEnd,
      "end ISO 应被转换为 unix 纳秒",
    );
    assert.equal(url.searchParams.get("limit"), "50", "limit 应透传");
  });

  test("unix 秒字符串也被转换为纳秒", async () => {
    const { capturedUrls } = await callWith(
      { query: "{job=\"x\"}", start: "1700000000", end: "1700003600" },
      {
        response: {
          ok: true,
          status: 200,
          json: async () => ({
            status: "success",
            data: { resultType: "streams", result: [] },
          }),
        },
      },
    );
    const url = new URL(capturedUrls[0]!);
    assert.equal(
      url.searchParams.get("start"),
      "1700000000000000000",
      "unix 秒应被转换为纳秒",
    );
    assert.equal(
      url.searchParams.get("end"),
      "1700003600000000000",
      "unix 秒应被转换为纳秒",
    );
  });

  test("默认 start 为 1 小时前、end 为当前、limit 为 DEFAULT_LIMIT", async () => {
    const fixedNow = 1_700_000_000_000;
    const { capturedUrls } = await callWith(
      { query: "{job=\"x\"}" },
      {
        fixedNow,
        response: {
          ok: true,
          status: 200,
          json: async () => ({
            status: "success",
            data: { resultType: "streams", result: [] },
          }),
        },
      },
    );
    const url = new URL(capturedUrls[0]!);
    const expectedStart = String(
      BigInt(fixedNow - LOKI_TOOL.DEFAULT_LOOKBACK_SECONDS * 1000) *
        1_000_000n,
    );
    const expectedEnd = String(BigInt(fixedNow) * 1_000_000n);
    assert.equal(
      url.searchParams.get("start"),
      expectedStart,
      "默认 start 应为 1 小时前",
    );
    assert.equal(
      url.searchParams.get("end"),
      expectedEnd,
      "默认 end 应为当前",
    );
    assert.equal(
      url.searchParams.get("limit"),
      String(LOKI_TOOL.DEFAULT_LIMIT),
      "默认 limit 应为 DEFAULT_LIMIT",
    );
  });
});

describe("createLokiTool — 空结果", () => {
  test("result 为空数组时返回 success + entries: []", async () => {
    const { result } = await callWith(
      { query: '{job="nonexistent"}' },
      {
        response: {
          ok: true,
          status: 200,
          json: async () => ({
            status: "success",
            data: { resultType: "streams", result: [] },
          }),
        },
      },
    );
    assert.equal(result.status, "success", "空结果仍为 success");
    assert.deepEqual(result.entries, [], "entries 应为空数组");
    assert.equal(result.error, undefined, "不应包含 error");
  });
});

describe("createLokiTool — 网络与协议错误", () => {
  test("fetch 抛异常时降级为 FETCH_FAILED", async () => {
    const { result } = await callWith(
      { query: "{job=\"x\"}" },
      { fetchError: new Error("ECONNREFUSED") },
    );
    assert.equal(result.status, "error", "status 应为 error");
    assert.deepEqual(result.entries, [], "entries 应为空");
    assert.ok(
      result.error?.startsWith(`${LOKI_TOOL.ERROR.FETCH_FAILED}:`),
      "error 应以 FETCH_FAILED 开头",
    );
    assert.ok(
      result.error?.includes("ECONNREFUSED"),
      "error 应包含原始错误",
    );
  });

  test("HTTP 503 返回 FETCH_FAILED + 状态码", async () => {
    const { result } = await callWith(
      { query: "{job=\"x\"}" },
      {
        response: {
          ok: false,
          status: 503,
          text: async () => "loki unavailable",
        },
      },
    );
    assert.equal(result.status, "error", "status 应为 error");
    assert.ok(result.error?.includes("503"), "error 应包含状态码");
    assert.ok(
      result.error?.includes("loki unavailable"),
      "error 应包含响应体",
    );
  });

  test("Loki 应用层错误返回 LOKI_ERROR", async () => {
    const { result } = await callWith(
      { query: "invalid(logql" },
      {
        response: {
          ok: true,
          status: 200,
          json: async () => ({
            status: "error",
            message: "parse error",
          }),
        },
      },
    );
    assert.equal(result.status, "error", "status 应为 error");
    assert.ok(
      result.error?.startsWith(LOKI_TOOL.ERROR.LOKI_ERROR),
      "error 应以 LOKI_ERROR 开头",
    );
    assert.ok(
      result.error?.includes("parse error"),
      "error 应包含原始消息",
    );
  });
});

describe("createLokiTool — 入参校验", () => {
  test("空 query 被 zod min(1) 拦截", async () => {
    const tool = createLokiTool(buildDeps());
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
      "message 应提示 query min(1)",
    );
  });

  test("limit 超过 MAX_LIMIT 被拦截", async () => {
    const tool = createLokiTool(buildDeps());
    const execute = tool.execute;
    if (!execute) throw new Error("tool.execute should exist");

    const result = (await execute(
      { query: "{job=\"x\"}", limit: LOKI_TOOL.MAX_LIMIT + 1 },
      {} as any,
    )) as { error?: boolean; message?: string };
    assert.equal(result.error, true, "超界 limit 应触发校验失败");
  });

  test("limit 小于 MIN_LIMIT 被拦截", async () => {
    const tool = createLokiTool(buildDeps());
    const execute = tool.execute;
    if (!execute) throw new Error("tool.execute should exist");

    const result = (await execute(
      { query: "{job=\"x\"}", limit: 0 },
      {} as any,
    )) as { error?: boolean };
    assert.equal(result.error, true, "limit<MIN_LIMIT 应触发校验失败");
  });
});
