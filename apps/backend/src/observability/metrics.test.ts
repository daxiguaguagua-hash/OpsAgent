/**
 * metrics.ts 单元测试
 *
 * 覆盖范围：
 * - createMetricsMiddleware：请求计数、耗时统计、/metrics 路由跳过
 * - httpRequestsTotal / httpRequestDurationSeconds：Prometheus 指标值验证
 * - getMetricsContent：/metrics 端点返回格式
 *
 * 运行方式：pnpm --filter backend exec tsx --test src/observability/metrics.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { Order } from "@opsagent/db/schema";
import { OPS_API_ROUTE, OPS_HTTP_METHOD, OPS_SERVICE_STATUS, type OrderHealthDto } from "@opsagent/shared";

import { createApp } from "../app";
import type { OrderService, CreateOrderInput } from "../business/orders";
import {
  httpRequestsTotal,
  httpRequestDurationSeconds,
  METRICS_ROUTE,
  getMetricsContent,
} from "./metrics";
import { PROMETHEUS } from "./constants";

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

/* ── getMetricsContent / METRICS_ROUTE 测试 ──────── */

test("/metrics 端点返回 Prometheus 文本格式", async () => {
  const app = createApp(createFakeOrderService());
  const response = await app.request(METRICS_ROUTE);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), PROMETHEUS.CONTENT_TYPE);
});

test("/metrics 响应体包含 http_requests_total 计数器名称", async () => {
  const app = createApp(createFakeOrderService());
  await app.request(OPS_API_ROUTE.ORDER_HEALTH);
  const response = await app.request(METRICS_ROUTE);
  const body = await response.text();

  assert.ok(
    body.includes(PROMETHEUS.METRIC_NAME.HTTP_REQUESTS_TOTAL),
    "应包含 http_requests_total",
  );
});

test("/metrics 响应体包含 http_request_duration_seconds 直方图名称", async () => {
  const app = createApp(createFakeOrderService());
  await app.request(OPS_API_ROUTE.ORDER_HEALTH);
  const response = await app.request(METRICS_ROUTE);
  const body = await response.text();

  assert.ok(
    body.includes(PROMETHEUS.METRIC_NAME.HTTP_REQUEST_DURATION_SECONDS),
    "应包含 http_request_duration_seconds",
  );
});

/* ── httpRequestsTotal 计数器测试 ────────────────── */

test("GET 请求后 http_requests_total 计数器增加，标签包含 method/route/status_code", async () => {
  const app = createApp(createFakeOrderService());
  const response = await app.request(OPS_API_ROUTE.ORDER_HEALTH);

  const metric = await httpRequestsTotal.get();
  const matching = metric.values.find(
    (v) =>
      v.labels.method === OPS_HTTP_METHOD.GET
      && v.labels.route === OPS_API_ROUTE.ORDER_HEALTH
      && v.labels.status_code === String(response.status),
  );

  assert.ok(matching, "计数器必须有对应 health check 请求的记录");
  assert.ok(matching.value >= 1, "计数器值至少为 1");
});

test("500 错误请求后 http_requests_total 记录正确标签", async () => {
  const app = createApp(createFakeOrderService());
  const response = await app.request(OPS_API_ROUTE.DEMO_FAIL_500, {
    method: OPS_HTTP_METHOD.POST,
  });

  const metric = await httpRequestsTotal.get();
  const matching = metric.values.find(
    (v) =>
      v.labels.method === OPS_HTTP_METHOD.POST
      && v.labels.route === OPS_API_ROUTE.DEMO_FAIL_500
      && v.labels.status_code === String(response.status),
  );

  assert.ok(matching, "计数器必须有对应 500 请求的记录");
  assert.ok(matching.value >= 1);
});

/* ── httpRequestDurationSeconds 直方图测试 ────────── */

test("请求后 http_request_duration_seconds 记录耗时，标签包含 method/route/status_code", async () => {
  const app = createApp(createFakeOrderService());
  const response = await app.request(OPS_API_ROUTE.ORDER_HEALTH);

  const metric = await httpRequestDurationSeconds.get();
  const matching = metric.values.find(
    (v) =>
      v.labels.method === OPS_HTTP_METHOD.GET
      && v.labels.route === OPS_API_ROUTE.ORDER_HEALTH
      && v.labels.status_code === String(response.status),
  );

  assert.ok(matching, "直方图必须有对应请求的记录");
  assert.ok(typeof matching.value === "number");
});

/* ── 中间件行为测试 ──────────────────────────────── */

test("metrics 中间件不对 /metrics 路由本身计数（避免自引用）", async () => {
  const app = createApp(createFakeOrderService());

  // 先请求一次 metrics，再请求一次 metrics
  await app.request(METRICS_ROUTE);
  await app.request(METRICS_ROUTE);

  const metric = await httpRequestsTotal.get();
  const metricsRouteEntry = metric.values.find(
    (v) => v.labels.route === METRICS_ROUTE,
  );

  assert.equal(
    metricsRouteEntry,
    undefined,
    "/metrics 路由不应被计入 http_requests_total",
  );
});
