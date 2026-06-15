/**
 * trace-tool.ts 单元测试
 *
 * 覆盖范围：
 * - 合法 traceId：返回 span 列表与总耗时
 * - traceId 不存在（HTTP 404）：返回空结构而非抛异常
 * - traceId 非法字符：返回参数错误
 * - base64 spanId 被转换为 hex
 * - 错误 span 的 status 被正确映射为 ERROR
 * - 网络/协议错误：降级为结构化 error
 * - includeSpans=false 时不返回 span 列表
 *
 * 运行方式：pnpm --filter @opsagent/agent test
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { createTraceTool, type TraceDeps } from "./trace-tool.js";
import { TRACE_TOOL } from "./constants.js";

interface ToolCallInput {
  traceId: string;
  includeSpans?: boolean;
}

interface FakeResponse {
  ok: boolean;
  status: number;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
}

function buildDeps(
  overrides: Partial<TraceDeps> & {
    response?: FakeResponse;
    fetchError?: Error;
    capturedUrls?: string[];
  } = {},
): TraceDeps {
  const capturedUrls = overrides.capturedUrls ?? [];
  const response = overrides.response;
  const fetchError = overrides.fetchError;
  const fetchImpl = async (input: string | URL | Request): Promise<Response> => {
    capturedUrls.push(typeof input === "string" ? input : input.toString());
    if (fetchError) throw fetchError;
    if (!response) throw new Error("no response configured");
    return {
      ok: response.ok,
      status: response.status,
      text: response.text ?? (async () => ""),
      json: response.json ?? (async () => ({})),
      headers: new Headers(),
    } as unknown as Response;
  };
  return {
    endpoint: "http://tempo.test:3200",
    fetch: fetchImpl as typeof fetch,
    timeoutMs: 5000,
  };
}

async function callWith(
  input: ToolCallInput,
  overrides: Parameters<typeof buildDeps>[0] = {},
) {
  const capturedUrls: string[] = [];
  const deps = buildDeps({ ...overrides, capturedUrls });
  const tool = createTraceTool(deps);
  const execute = tool.execute;
  if (!execute) throw new Error("tool.execute should exist");
  const result = (await execute(input, {} as any)) as {
    status: "success" | "error";
    traceId: string;
    rootService?: string;
    durationMs?: number;
    spans: Array<{
      spanId: string;
      parentSpanId?: string;
      operationName: string;
      serviceName: string;
      durationMs: number;
      status: string;
      attributes: Record<string, string>;
    }>;
    error?: string;
  };
  return { result, capturedUrls };
}

const FIXTURE_TEMPO_OK = {
  batches: [
    {
      resource: {
        attributes: [
          { key: "service.name", value: { stringValue: "opsagent-backend" } },
        ],
      },
      scopeSpans: [
        {
          scope: { name: "opsagent-backend-http" },
          spans: [
            {
              traceId: "AAAAAAAAAAAAAAAAAAAAAA==",
              spanId: "AAAAAAAAAAA=",
              name: "POST /api/demo/fail-500",
              startTimeUnixNano: "1700000000000000000",
              endTimeUnixNano: "1700000001234000000",
              attributes: [
                {
                  key: "http.response.status_code",
                  value: { intValue: "500" },
                },
                {
                  key: "opsagent.error.code",
                  value: { stringValue: "DEMO_FORCED_FAILURE" },
                },
              ],
              status: { code: "STATUS_CODE_ERROR" },
            },
          ],
        },
      ],
    },
  ],
};

describe("createTraceTool — 合法 traceId", () => {
  test("返回 span 列表、rootService、总耗时", async () => {
    const { result, capturedUrls } = await callWith(
      { traceId: "abc123def456" },
      {
        response: {
          ok: true,
          status: 200,
          json: async () => FIXTURE_TEMPO_OK,
        },
      },
    );

    assert.equal(result.status, "success", "status 应为 success");
    assert.equal(result.traceId, "abc123def456", "traceId 应回显");
    assert.equal(
      result.rootService,
      "opsagent-backend",
      "rootService 应从 resource attributes 推断",
    );
    assert.equal(result.durationMs, 1234, "durationMs 应为 start/end 差值(ms)");
    assert.equal(result.spans.length, 1, "应解析出 1 个 span");
    const span = result.spans[0];
    if (!span) throw new Error("span missing");
    assert.equal(span.operationName, "POST /api/demo/fail-500", "operationName 应透传");
    assert.equal(span.serviceName, "opsagent-backend", "serviceName 应来自 resource");
    assert.equal(span.durationMs, 1234, "span durationMs 应正确");
    assert.equal(span.status, TRACE_TOOL.STATUS.ERROR, "STATUS_CODE_ERROR → ERROR");
    assert.equal(
      span.attributes["opsagent.error.code"],
      "DEMO_FORCED_FAILURE",
      "自定义属性应透传",
    );
    assert.equal(
      span.attributes["http.response.status_code"],
      "500",
      "int 属性应被转换为字符串",
    );

    assert.equal(capturedUrls.length, 1, "应发起 1 次请求");
    const url = new URL(capturedUrls[0]!);
    assert.equal(
      url.pathname,
      `${TRACE_TOOL.API_PATH}/abc123def456`,
      "应走 /api/traces/:traceId",
    );
  });

  test("base64 spanId 被转换为 hex", async () => {
    const { result } = await callWith(
      { traceId: "abc" },
      {
        response: {
          ok: true,
          status: 200,
          json: async () => ({
            batches: [
              {
                resource: { attributes: [] },
                scopeSpans: [
                  {
                    spans: [
                      {
                        traceId: "abc",
                        spanId: "/yRMd9n8S+0=",
                        name: "GET /x",
                        startTimeUnixNano: "0",
                        endTimeUnixNano: "1000000",
                      },
                    ],
                  },
                ],
              },
            ],
          }),
        },
      },
    );
    const span = result.spans[0];
    if (!span) throw new Error("span missing");
    assert.equal(
      span.spanId,
      "ff244c77d9fc4bed",
      "base64 spanId 应被转换为 hex",
    );
    assert.equal(span.durationMs, 1, "1ms 应为整数");
    assert.equal(
      span.status,
      TRACE_TOOL.STATUS.UNSET,
      "无 status.code 应为 UNSET",
    );
  });

  test("includeSpans=false 时不返回 span 列表但仍返回 duration", async () => {
    const { result } = await callWith(
      { traceId: "abc", includeSpans: false },
      {
        response: {
          ok: true,
          status: 200,
          json: async () => FIXTURE_TEMPO_OK,
        },
      },
    );
    assert.equal(result.status, "success", "status 应为 success");
    assert.deepEqual(result.spans, [], "spans 应为空数组");
    assert.equal(result.durationMs, 1234, "durationMs 仍应返回");
  });
});

describe("createTraceTool — traceId 异常", () => {
  test("非法字符返回 INVALID_TRACE_ID", async () => {
    const { result, capturedUrls } = await callWith(
      { traceId: "invalid trace id with space" },
      {
        response: {
          ok: true,
          status: 200,
          json: async () => ({ batches: [] }),
        },
      },
    );
    assert.equal(result.status, "error", "status 应为 error");
    assert.deepEqual(result.spans, [], "spans 应为空");
    assert.ok(
      result.error?.startsWith(TRACE_TOOL.ERROR.INVALID_TRACE_ID),
      "error 应以 INVALID_TRACE_ID 开头",
    );
    assert.equal(capturedUrls.length, 0, "不应发起网络请求");
  });

  test("HTTP 404 返回 TRACE_NOT_FOUND 而非抛异常", async () => {
    const { result } = await callWith(
      { traceId: "nonexistent" },
      {
        response: {
          ok: false,
          status: 404,
          text: async () => "not found",
        },
      },
    );
    assert.equal(result.status, "error", "status 应为 error");
    assert.deepEqual(result.spans, [], "spans 应为空");
    assert.ok(
      result.error?.startsWith(TRACE_TOOL.ERROR.TRACE_NOT_FOUND),
      "error 应以 TRACE_NOT_FOUND 开头",
    );
  });

  test("HTTP 503 返回 FETCH_FAILED", async () => {
    const { result } = await callWith(
      { traceId: "abc" },
      {
        response: {
          ok: false,
          status: 503,
          text: async () => "tempo down",
        },
      },
    );
    assert.equal(result.status, "error", "status 应为 error");
    assert.ok(
      result.error?.includes("503"),
      "error 应包含状态码",
    );
    assert.ok(
      result.error?.includes("tempo down"),
      "error 应包含响应体",
    );
  });

  test("fetch 抛异常时降级为 FETCH_FAILED", async () => {
    const { result } = await callWith(
      { traceId: "abc" },
      { fetchError: new Error("ECONNREFUSED") },
    );
    assert.equal(result.status, "error", "status 应为 error");
    assert.ok(
      result.error?.startsWith(TRACE_TOOL.ERROR.FETCH_FAILED),
      "error 应以 FETCH_FAILED 开头",
    );
    assert.ok(
      result.error?.includes("ECONNREFUSED"),
      "error 应包含原始错误",
    );
  });

  test("空 traceId 被 zod min(1) 拦截", async () => {
    const tool = createTraceTool(buildDeps());
    const execute = tool.execute;
    if (!execute) throw new Error("tool.execute should exist");

    const result = (await execute({ traceId: "" }, {} as any)) as {
      error?: boolean;
      message?: string;
    };
    assert.equal(result.error, true, "Mastra 应返回 error: true");
  });
});
