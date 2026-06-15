/**
 * analysisApi.ts 单元测试
 *
 * 覆盖范围：
 * - 200 + 完整字段：返回 AnalysisResponseDto
 * - 200 + 缺失字段：抛 OpsApiError ANALYSIS_UNAVAILABLE
 * - HTTP 503：抛 OpsApiError 并透传 backend error code
 * - 网络失败：fetch 抛异常时向外抛出
 *
 * 运行方式：pnpm --filter frontend test
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { OpsApiError } from "./opsApi.js";
import {
  ANALYSIS_ERROR_CODE,
  ANALYSIS_ROUTE,
  requestAnalysis,
} from "./analysisApi.js";

interface FakeResponseInit {
  ok: boolean;
  status: number;
  body: unknown;
}

function makeFetcher(init: FakeResponseInit): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    void input;
    return {
      ok: init.ok,
      status: init.status,
      json: async () => init.body,
      text: async () => JSON.stringify(init.body),
      headers: new Headers(),
    } as unknown as Response;
  }) as typeof fetch;
}

describe("requestAnalysis — 成功", () => {
  test("200 + 完整字段返回 DTO", async () => {
    const body = {
      incidentId: "20260611-001",
      markdown: "# Incident Report\n\nhello",
      generatedAt: "2026-06-11T10:00:00Z",
      provider: "mock",
    };
    const fetcher = makeFetcher({ ok: true, status: 200, body });
    const result = await requestAnalysis("http://localhost:8000", fetcher);
    assert.equal(result.incidentId, "20260611-001", "incidentId 应透传");
    assert.equal(
      result.markdown,
      "# Incident Report\n\nhello",
      "markdown 应透传",
    );
    assert.equal(result.provider, "mock", "provider 应透传");
  });

  test("请求路径为 /api/analysis", async () => {
    let capturedUrl = "";
    const fetcher = (async (input: RequestInfo | URL) => {
      capturedUrl = typeof input === "string" ? input : input.toString();
      return {
        ok: true,
        status: 200,
        json: async () => ({
          incidentId: "x",
          markdown: "y",
          generatedAt: "z",
          provider: "p",
        }),
      } as unknown as Response;
    }) as typeof fetch;

    await requestAnalysis("http://localhost:8000", fetcher);
    assert.equal(
      capturedUrl,
      `http://localhost:8000${ANALYSIS_ROUTE.ANALYZE}`,
      "请求路径应为 /api/analysis",
    );
  });
});

describe("requestAnalysis — 失败", () => {
  test("HTTP 503 抛 OpsApiError 并透传 backend code", async () => {
    const fetcher = makeFetcher({
      ok: false,
      status: 503,
      body: {
        error: {
          code: ANALYSIS_ERROR_CODE.ANALYSIS_UNAVAILABLE,
          message: "agent unavailable",
        },
      },
    });
    await assert.rejects(
      () => requestAnalysis("http://localhost:8000", fetcher),
      (err: unknown) => {
        assert.ok(err instanceof OpsApiError, "应为 OpsApiError");
        const apiErr = err as OpsApiError;
        assert.equal(apiErr.status, 503, "status 应为 503");
        assert.equal(
          apiErr.code,
          ANALYSIS_ERROR_CODE.ANALYSIS_UNAVAILABLE,
          "error code 应透传",
        );
        assert.ok(
          apiErr.message.includes("agent unavailable"),
          "message 应包含原文",
        );
        return true;
      },
    );
  });

  test("200 但缺字段时抛 ANALYSIS_UNAVAILABLE", async () => {
    const fetcher = makeFetcher({
      ok: true,
      status: 200,
      body: { incidentId: "x" },
    });
    await assert.rejects(
      () => requestAnalysis("http://localhost:8000", fetcher),
      (err: unknown) => {
        assert.ok(err instanceof OpsApiError, "应为 OpsApiError");
        const apiErr = err as OpsApiError;
        assert.equal(
          apiErr.code,
          ANALYSIS_ERROR_CODE.ANALYSIS_UNAVAILABLE,
          "缺字段时 code 应为 ANALYSIS_UNAVAILABLE",
        );
        return true;
      },
    );
  });

  test("fetch 抛异常时向外抛出", async () => {
    const fetcher = (async () => {
      throw new Error("network down");
    }) as typeof fetch;
    await assert.rejects(
      () => requestAnalysis("http://localhost:8000", fetcher),
      /network down/,
      "应向上传播 fetch 异常",
    );
  });
});
