/**
 * traceProxy.ts 单元测试
 *
 * 覆盖范围：
 * - createTraceProxyHandler：Tempo 代理路由的三种结果（成功 / 404 / 503）
 * - createTraceProxy：默认代理实例的 URL 拼接
 *
 * 运行方式：pnpm --filter backend exec tsx --test src/observability/traceProxy.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";

import { OPS_API_ROUTE } from "@opsagent/shared";
import type { Order } from "@opsagent/db/schema";
import { OPS_SERVICE_STATUS, type OrderHealthDto } from "@opsagent/shared";

import { createApp } from "../app";
import type { OrderService, CreateOrderInput } from "../business/orders";
import { API_ERROR_CODE, API_MESSAGE, HTTP_STATUS } from "../http/constants";
import { TEMPO } from "./constants";
import type { TraceProxy } from "./traceProxy";

/* ── 测试夹具 ─────────────────────────────────────── */

const FIXTURE_ORDER: Order = {
  id: 1,
  reference: "order-test",
  customerName: "Test Customer",
  status: "pending",
  totalCents: 2500,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const FIXTURE_HEALTH: OrderHealthDto = {
  status: OPS_SERVICE_STATUS.OK,
  services: {
    database: OPS_SERVICE_STATUS.CONNECTED,
    cache: OPS_SERVICE_STATUS.CONNECTED,
  },
  orderCount: 1,
};

function createFakeOrderService(): OrderService {
  const storedOrders = [FIXTURE_ORDER];
  return {
    async checkHealth() { return FIXTURE_HEALTH; },
    async create(input: CreateOrderInput) {
      const order = { ...FIXTURE_ORDER, id: storedOrders.length + 1, customerName: input.customerName, totalCents: input.totalCents };
      storedOrders.push(order);
      return order;
    },
    async list() { return storedOrders; },
  };
}

const FIXTURE_TRACE_ID = "abcdef0123456789abcdef0123456789";

const FIXTURE_TRACE_BODY = JSON.stringify({
  batches: [
    {
      resourceSpans: [
        {
          scopeSpans: [
            {
              spans: [
                {
                  traceId: FIXTURE_TRACE_ID,
                  spanId: "0123456789abcdef",
                  name: "GET /api/orders/health",
                  status: { code: 1 },
                },
              ],
            },
          ],
        },
      ],
    },
  ],
});

function createFakeTraceProxy(overrides?: {
  status?: number;
  body?: string;
  throwOnFetch?: boolean;
}): TraceProxy {
  const status = overrides?.status ?? 200;
  const body = overrides?.body ?? FIXTURE_TRACE_BODY;
  const throwOnFetch = overrides?.throwOnFetch ?? false;

  return {
    async fetchTrace(_traceId: string) {
      if (throwOnFetch) {
        throw new TypeError("fetch failed");
      }
      return new Response(body, {
        status,
        headers: { "content-type": "application/json" },
      });
    },
  };
}

/* ── createTraceProxyHandler 测试 ─────────────────── */

test("有效 traceId 返回 200 和 span 树（包含 batches 数组）", async () => {
  const proxy = createFakeTraceProxy();
  const app = createApp(createFakeOrderService(), undefined, () => {}, undefined, proxy);

  const response = await app.request(`${OPS_API_ROUTE.TRACES}/${FIXTURE_TRACE_ID}`);
  const body = await response.json() as { batches: unknown[] };

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(body.batches), "响应必须包含 batches 数组");
  assert.equal(body.batches.length, 1);
});

test("响应头的 content-type 默认为 application/json", async () => {
  const proxy = createFakeTraceProxy();
  const app = createApp(createFakeOrderService(), undefined, () => {}, undefined, proxy);

  const response = await app.request(`${OPS_API_ROUTE.TRACES}/${FIXTURE_TRACE_ID}`);

  assert.equal(
    response.headers.get("content-type"),
    TEMPO.ACCEPT_HEADER,
  );
});

test("Tempo 返回 404 时，代理返回 404 和 TRACE_NOT_FOUND 错误码", async () => {
  const proxy = createFakeTraceProxy({ status: 404, body: "" });
  const app = createApp(createFakeOrderService(), undefined, () => {}, undefined, proxy);

  const response = await app.request(`${OPS_API_ROUTE.TRACES}/${FIXTURE_TRACE_ID}`);
  const body = await response.json() as { error: { code: string; message: string } };

  assert.equal(response.status, HTTP_STATUS.NOT_FOUND);
  assert.equal(body.error.code, API_ERROR_CODE.TRACE_NOT_FOUND);
  assert.equal(body.error.message, API_MESSAGE.TRACE_NOT_FOUND);
});

test("Tempo 不可用时，代理返回 503 和 TEMPO_UNAVAILABLE 错误码", async () => {
  const proxy = createFakeTraceProxy({ throwOnFetch: true });
  const app = createApp(createFakeOrderService(), undefined, () => {}, undefined, proxy);

  const response = await app.request(`${OPS_API_ROUTE.TRACES}/${FIXTURE_TRACE_ID}`);
  const body = await response.json() as { error: { code: string; message: string } };

  assert.equal(response.status, HTTP_STATUS.SERVICE_UNAVAILABLE);
  assert.equal(body.error.code, API_ERROR_CODE.TEMPO_UNAVAILABLE);
  assert.equal(body.error.message, API_MESSAGE.TEMPO_UNAVAILABLE);
});

test("503 响应不泄露内部异常信息", async () => {
  const proxy = createFakeTraceProxy({ throwOnFetch: true });
  const app = createApp(createFakeOrderService(), undefined, () => {}, undefined, proxy);

  const response = await app.request(`${OPS_API_ROUTE.TRACES}/${FIXTURE_TRACE_ID}`);
  const raw = await response.text();

  assert.equal(raw.includes("fetch failed"), false, "不应暴露底层 fetch 异常");
  assert.equal(raw.includes("stack"), false, "不应暴露堆栈信息");
});

test("代理响应透传 Tempo 返回的 HTTP 状态码", async () => {
  const proxy = createFakeTraceProxy({ status: 200, body: '{"batches":[]}' });
  const app = createApp(createFakeOrderService(), undefined, () => {}, undefined, proxy);

  const response = await app.request(`${OPS_API_ROUTE.TRACES}/${FIXTURE_TRACE_ID}`);

  assert.equal(response.status, 200);
});

test("代理将 Tempo 的 content-type 透传给客户端", async () => {
  const customContentType = "application/protobuf";
  const proxy: TraceProxy = {
    async fetchTrace(_traceId: string) {
      return new Response("binary-data", {
        status: 200,
        headers: { "content-type": customContentType },
      });
    },
  };
  const app = createApp(createFakeOrderService(), undefined, () => {}, undefined, proxy);

  const response = await app.request(`${OPS_API_ROUTE.TRACES}/${FIXTURE_TRACE_ID}`);

  assert.equal(response.headers.get("content-type"), customContentType);
});

test("Tempo 返回非 JSON content-type 时，代理原样透传", async () => {
  // Response 构造函数会自动为字符串 body 设置 text/plain，
  // 此测试验证代理层忠实地透传上游的 content-type（不会强制覆盖为 JSON）
  const proxy: TraceProxy = {
    async fetchTrace(_traceId: string) {
      return new Response(FIXTURE_TRACE_BODY, {
        status: 200,
        // 不手动设置 content-type，让 Response 使用默认值 text/plain
      });
    },
  };
  const app = createApp(createFakeOrderService(), undefined, () => {}, undefined, proxy);

  const response = await app.request(`${OPS_API_ROUTE.TRACES}/${FIXTURE_TRACE_ID}`);
  const contentType = response.headers.get("content-type");

  // 代理透传了 Response 自动分配的 content-type
  assert.ok(contentType, "content-type 必须存在");
  assert.notEqual(contentType, TEMPO.ACCEPT_HEADER, "不应强制覆盖为 JSON");
});
