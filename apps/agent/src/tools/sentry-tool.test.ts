/**
 * sentry-tool.ts 单元测试
 *
 * 覆盖范围：
 * - 成功 list issues：URL 拼接、Authorization header、issues 标准化
 * - 成功 get latest event：stacktrace 反转截断、breadcrumbs 提取、contexts 透传
 * - 缺失凭证：返回 MISSING_CONFIG 而不是发请求
 * - HTTP 401：返回 FETCH_FAILED + 状态码
 * - 空结果（list）：返回 success + issues: []
 * - 超时：AbortError 降级为 FETCH_FAILED
 * - 入参校验：limit 超出范围被 zod 拦截
 * - stacktrace 缺失时返回 []
 * - breadcrumbs 缺失时返回 []
 *
 * 运行方式：pnpm --filter @opsagent/agent test
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  createSentryTool,
  type SentryDeps,
  type SentryListResult,
  type SentryEventResult,
} from "./sentry-tool.js";
import { SENTRY_TOOL } from "./constants.js";

interface FakeResponse {
  ok: boolean;
  status: number;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
}

interface CapturedRequest {
  url: string;
  headers: Record<string, string>;
}

function buildDeps(
  overrides: Partial<SentryDeps> & {
    response?: FakeResponse;
    fetchError?: Error;
    captured?: CapturedRequest[];
  } = {},
): SentryDeps {
  const captured = overrides.captured ?? [];
  const response = overrides.response;
  const fetchError = overrides.fetchError;
  const fetchImpl = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();
    const headers: Record<string, string> = {};
    const rawHeaders = init?.headers;
    if (rawHeaders && !(rawHeaders instanceof Headers)) {
      if (Array.isArray(rawHeaders)) {
        for (const pair of rawHeaders) {
          const [k, v] = pair;
          if (typeof k === "string" && typeof v === "string") {
            headers[k] = v;
          }
        }
      } else {
        Object.assign(headers, rawHeaders);
      }
    }
    captured.push({ url, headers });
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
  const { response: _r, fetchError: _f, captured: _c, ...rest } = overrides;
  return {
    endpoint: "https://sentry.test/api/0",
    authToken: "sntrys_test_token_xxx",
    org: "test-org",
    project: "test-project",
    fetch: fetchImpl as typeof fetch,
    timeoutMs: 5000,
    ...rest,
  };
}

async function callWith(
  input: { issueId?: string; query?: string; limit?: number },
  overrides: Parameters<typeof buildDeps>[0] = {},
): Promise<{ result: SentryListResult | SentryEventResult; captured: CapturedRequest[] }> {
  const captured: CapturedRequest[] = [];
  const deps = buildDeps({ ...overrides, captured });
  const tool = createSentryTool(deps);
  const execute = tool.execute;
  if (!execute) throw new Error("tool.execute should exist");
  const result = (await execute(input, {} as never)) as
    | SentryListResult
    | SentryEventResult;
  if (!result) throw new Error("tool.execute should return a value");
  return { result, captured };
}

describe("createSentryTool — 成功 list issues", () => {
  test("URL 拼接正确 + Authorization Bearer token + issues 标准化", async () => {
    const { result, captured } = await callWith(
      { query: "is:unresolved level:error", limit: 3 },
      {
        response: {
          ok: true,
          status: 200,
          json: async () => [
            {
              id: "111",
              shortId: "PROJ-1",
              title: "TypeError: x is null",
              culprit: "Checkout.tsx in handleSubmit",
              count: "42",
              userCount: 7,
              firstSeen: "2026-06-15T10:00:00Z",
              lastSeen: "2026-06-16T08:00:00Z",
              level: "error",
              platform: "javascript",
            },
          ],
        },
      },
    );

    assert.equal(result.status, "success", "status 应为 success");
    assert.equal(result.mode, "list", "mode 应为 list");
    if (result.mode !== "list") throw new Error("narrowing");
    assert.equal(result.issues.length, 1, "应解析出 1 条 issue");
    const first = result.issues[0];
    if (!first) throw new Error("first issue missing");
    assert.equal(first.id, "111", "id 应透传");
    assert.equal(first.shortId, "PROJ-1", "shortId 应透传");
    assert.equal(first.title, "TypeError: x is null", "title 应透传");
    assert.equal(first.culprit, "Checkout.tsx in handleSubmit", "culprit 应透传");
    assert.equal(first.count, "42", "count 应为字符串");
    assert.equal(first.userCount, 7, "userCount 应为数字");
    assert.equal(first.level, "error", "level 应透传");
    assert.equal(first.platform, "javascript", "platform 应透传");

    assert.equal(captured.length, 1, "应发起 1 次请求");
    const req = captured[0];
    if (!req) throw new Error("captured[0] missing");
    const url = new URL(req.url);
    assert.equal(
      url.pathname,
      "/api/0/projects/test-org/test-project/issues/",
      "pathname 应替换 org / project",
    );
    assert.equal(url.searchParams.get("query"), "is:unresolved level:error", "query 应透传");
    assert.equal(url.searchParams.get("limit"), "3", "limit 应透传");
    assert.equal(
      req.headers.Authorization,
      "Bearer sntrys_test_token_xxx",
      "应带 Bearer token",
    );
    assert.equal(req.headers.Accept, "application/json", "应请求 JSON");
  });

  test("未传 query / limit 时使用默认值", async () => {
    const { captured } = await callWith(
      {},
      {
        response: {
          ok: true,
          status: 200,
          json: async () => [],
        },
      },
    );
    const url = new URL(captured[0]!.url);
    assert.equal(
      url.searchParams.get("query"),
      SENTRY_TOOL.DEFAULT_QUERY,
      "默认 query 应生效",
    );
    assert.equal(
      url.searchParams.get("limit"),
      String(SENTRY_TOOL.DEFAULT_LIMIT),
      "默认 limit 应生效",
    );
  });
});

describe("createSentryTool — 成功 get latest event", () => {
  const fakeEvent = {
    eventID: "evt-abc",
    title: "TypeError: Cannot read 'total' of null",
    platform: "javascript",
    timestamp: "2026-06-16T08:30:00Z",
    entries: [
      {
        type: "exception",
        data: {
          values: [
            {
              stacktrace: {
                frames: [
                  { filename: "old.js", function: "oldFn", lineNo: 1, inApp: true },
                  {
                    filename: "apps/frontend/src/pages/Checkout.tsx",
                    function: "handleSubmit",
                    lineNo: 137,
                    colNo: 24,
                    inApp: true,
                  },
                ],
              },
            },
          ],
        },
      },
      {
        type: "breadcrumbs",
        data: {
          values: [
            { type: "navigation", category: "nav", message: "/cart → /checkout", timestamp: "2026-06-16T08:29:50Z" },
            { type: "ui.click", category: "ui", message: "button#submit-order", timestamp: "2026-06-16T08:30:00Z" },
          ],
        },
      },
    ],
    contexts: {
      browser: { name: "Chrome", version: "126.0" },
      os: { name: "macOS", version: "14.5" },
    },
  };

  test("stacktrace 反转截断 + breadcrumbs 提取 + contexts 透传", async () => {
    const { result, captured } = await callWith(
      { issueId: "12345" },
      {
        response: {
          ok: true,
          status: 200,
          json: async () => fakeEvent,
        },
      },
    );

    assert.equal(result.status, "success", "status 应为 success");
    assert.equal(result.mode, "event", "mode 应为 event");
    if (result.mode !== "event") throw new Error("narrowing");
    const event = result.event;
    if (!event) throw new Error("event should exist");

    assert.equal(event.issueId, "12345", "issueId 应回显");
    assert.equal(event.eventId, "evt-abc", "eventId 应透传");
    assert.equal(event.title, "TypeError: Cannot read 'total' of null", "title 应透传");
    assert.equal(event.platform, "javascript", "platform 应透传");
    assert.equal(event.timestamp, "2026-06-16T08:30:00Z", "timestamp 应透传");

    assert.equal(event.stacktrace.length, 2, "应有 2 个 frame");
    assert.equal(
      event.stacktrace[0]?.filename,
      "apps/frontend/src/pages/Checkout.tsx",
      "stacktrace 应反转（最新的在前）",
    );
    assert.equal(event.stacktrace[0]?.lineNo, 137, "lineNo 应透传");
    assert.equal(event.stacktrace[0]?.colNo, 24, "colNo 应透传");
    assert.equal(event.stacktrace[0]?.function, "handleSubmit", "function 应透传");
    assert.equal(event.stacktrace[0]?.inApp, true, "inApp 应透传");
    assert.equal(event.stacktrace[1]?.filename, "old.js", "第二个 frame 应是老调用");

    assert.equal(event.breadcrumbs.length, 2, "应有 2 个 breadcrumb");
    assert.equal(event.breadcrumbs[0]?.type, "navigation", "第一个 breadcrumb 是导航");
    assert.equal(event.breadcrumbs[1]?.message, "button#submit-order", "第二个是点击");

    assert.deepEqual(event.contexts.browser, { name: "Chrome", version: "126.0" }, "browser context 透传");
    assert.deepEqual(event.contexts.os, { name: "macOS", version: "14.5" }, "os context 透传");

    const url = new URL(captured[0]!.url);
    assert.equal(
      url.pathname,
      "/api/0/issues/12345/events/latest/",
      "pathname 应使用 ISSUE_LATEST_EVENT 模板",
    );
  });

  test("stacktrace / breadcrumbs 缺失时返回空数组", async () => {
    const { result } = await callWith(
      { issueId: "111" },
      {
        response: {
          ok: true,
          status: 200,
          json: async () => ({
            eventID: "evt-2",
            title: "simple error",
            entries: [],
          }),
        },
      },
    );
    if (result.mode !== "event") throw new Error("mode should be event");
    if (!result.event) throw new Error("event should exist");
    assert.deepEqual(result.event.stacktrace, [], "无 exception entry时 stacktrace 应为 []");
    assert.deepEqual(result.event.breadcrumbs, [], "无 breadcrumbs 条目时 breadcrumbs 应为 []");
    assert.deepEqual(result.event.contexts, {}, "无 contexts 时应为 {}");
  });

  test("timestamp 为 unix 秒数字时被转为 ISO 字符串", async () => {
    const { result } = await callWith(
      { issueId: "222" },
      {
        response: {
          ok: true,
          status: 200,
          json: async () => ({
            eventID: "evt-3",
            title: "e",
            timestamp: 1_750_000_000,
            entries: [],
          }),
        },
      },
    );
    if (result.mode !== "event" || !result.event) throw new Error("narrowing");
    assert.equal(
      result.event.timestamp,
      new Date(1_750_000_000 * 1000).toISOString(),
      "unix 秒 timestamp 应被转换为 ISO",
    );
  });
});

describe("createSentryTool — 凭证缺失", () => {
  test("token / org / project 全部缺失时返回 MISSING_CONFIG，不发请求", async () => {
    const { result, captured } = await callWith(
      {},
      { authToken: undefined, org: undefined, project: undefined },
    );
    assert.equal(result.status, "error", "status 应为 error");
    assert.equal(result.mode, "list", "list 模式保持 list");
    if (result.mode !== "list") throw new Error("narrowing");
    assert.deepEqual(result.issues, [], "issues 应为 []");
    assert.ok(
      result.error?.startsWith(SENTRY_TOOL.ERROR.MISSING_CONFIG),
      "error 应以 MISSING_CONFIG 开头",
    );
    assert.ok(result.error?.includes("SENTRY_AUTH_TOKEN"), "应提示 AUTH_TOKEN");
    assert.ok(result.error?.includes("SENTRY_ORG"), "应提示 ORG");
    assert.ok(result.error?.includes("SENTRY_PROJECT"), "应提示 PROJECT");
    assert.equal(captured.length, 0, "凭证缺失时不应发起请求");
  });

  test("issueId 模式下凭证缺失仍返回 event 模式错误", async () => {
    const { result, captured } = await callWith(
      { issueId: "x" },
      { authToken: "", org: "o", project: "p" },
    );
    assert.equal(result.mode, "event", "issueId 模式应返回 event 模式");
    assert.equal(result.status, "error", "凭证缺失应 error");
    if (result.mode !== "event") throw new Error("narrowing");
    assert.equal(result.event, null, "event 应为 null");
    assert.equal(captured.length, 0, "凭证缺失时不应发起请求");
  });
});

describe("createSentryTool — 网络与协议错误", () => {
  test("HTTP 401 返回 FETCH_FAILED + 状态码", async () => {
    const { result } = await callWith(
      {},
      {
        response: {
          ok: false,
          status: 401,
          text: async () => "invalid token",
        },
      },
    );
    assert.equal(result.status, "error", "status 应为 error");
    assert.ok(
      result.error?.startsWith(SENTRY_TOOL.ERROR.FETCH_FAILED),
      "error 应以 FETCH_FAILED 开头",
    );
    assert.ok(result.error?.includes("401"), "应包含状态码");
    assert.ok(result.error?.includes("invalid token"), "应包含响应体");
  });

  test("fetch 抛异常时降级为 FETCH_FAILED", async () => {
    const { result } = await callWith(
      {},
      { fetchError: new Error("ECONNREFUSED") },
    );
    assert.equal(result.status, "error", "status 应为 error");
    assert.ok(
      result.error?.startsWith(SENTRY_TOOL.ERROR.FETCH_FAILED),
      "error 应以 FETCH_FAILED 开头",
    );
    assert.ok(result.error?.includes("ECONNREFUSED"), "应包含原始错误");
  });

  test("AbortError 降级为 FETCH_FAILED", async () => {
    const { result } = await callWith(
      {},
      { fetchError: new Error("The operation was aborted") },
    );
    assert.equal(result.status, "error", "status 应为 error");
    assert.ok(
      result.error?.startsWith(SENTRY_TOOL.ERROR.FETCH_FAILED),
      "AbortError 应归类为 FETCH_FAILED",
    );
  });

  test("非 JSON 响应返回 INVALID_RESPONSE", async () => {
    const { result } = await callWith(
      {},
      {
        response: {
          ok: true,
          status: 200,
          json: async () => {
            throw new Error("Unexpected token '<'");
          },
        },
      },
    );
    assert.equal(result.status, "error", "status 应为 error");
    assert.ok(
      result.error?.startsWith(SENTRY_TOOL.ERROR.INVALID_RESPONSE),
      "error 应以 INVALID_RESPONSE 开头",
    );
  });

  test("返回的不是数组时（list 模式）返回 INVALID_RESPONSE", async () => {
    const { result } = await callWith(
      {},
      {
        response: {
          ok: true,
          status: 200,
          json: async () => ({ unexpected: "object" }),
        },
      },
    );
    assert.equal(result.status, "error", "status 应为 error");
    assert.ok(
      result.error?.startsWith(SENTRY_TOOL.ERROR.INVALID_RESPONSE),
      "error 应以 INVALID_RESPONSE 开头",
    );
  });
});

describe("createSentryTool — 空结果", () => {
  test("issues 为空数组时返回 success + issues: []", async () => {
    const { result } = await callWith(
      {},
      {
        response: {
          ok: true,
          status: 200,
          json: async () => [],
        },
      },
    );
    assert.equal(result.status, "success", "空结果仍为 success");
    if (result.mode !== "list") throw new Error("mode 应为 list");
    assert.deepEqual(result.issues, [], "issues 应为空数组");
    assert.equal(result.error, undefined, "不应有 error");
  });
});

describe("createSentryTool — 入参校验", () => {
  test("limit 超过 MAX_LIMIT 被 zod 拦截", async () => {
    const tool = createSentryTool(buildDeps());
    const execute = tool.execute;
    if (!execute) throw new Error("tool.execute should exist");
    const result = (await execute(
      { limit: SENTRY_TOOL.MAX_LIMIT + 1 },
      {} as never,
    )) as { error?: boolean; message?: string };
    assert.equal(result.error, true, "Mastra 应返回 error: true");
    assert.ok(
      typeof result.message === "string" &&
        result.message.includes("limit") &&
        result.message.includes("Too big"),
      "message 应提示 limit 字段超出上限",
    );
  });

  test("limit 小于 MIN_LIMIT 被 zod 拦截", async () => {
    const tool = createSentryTool(buildDeps());
    const execute = tool.execute;
    if (!execute) throw new Error("tool.execute should exist");
    const result = (await execute(
      { limit: SENTRY_TOOL.MIN_LIMIT - 1 },
      {} as never,
    )) as { error?: boolean; message?: string };
    assert.equal(result.error, true, "Mastra 应返回 error: true");
  });
});
