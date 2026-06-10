/**
 * tracing.ts 单元测试
 *
 * 覆盖范围：
 * - createTracingMiddleware：OTel span 的创建、属性、状态、异常处理
 * - initializeTelemetry：遥测初始化和关闭
 *
 * 运行方式：pnpm --filter backend exec tsx --test src/observability/tracing.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  SpanKind,
  SpanStatusCode,
  type Tracer,
} from "@opentelemetry/api";
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  NodeTracerProvider,
} from "@opentelemetry/sdk-trace-node";
import { OPS_API_ROUTE } from "@opsagent/shared";

import { createApp } from "../app";
import type { OrderService, CreateOrderInput } from "../business/orders";
import type { Order } from "@opsagent/db/schema";
import { OPS_SERVICE_STATUS, type OrderHealthDto } from "@opsagent/shared";
import { API_ERROR_CODE } from "../http/constants";
import { OPENTELEMETRY } from "./constants";
import { initializeTelemetry } from "./tracing";

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

function createTestTracer(): {
  exporter: InMemorySpanExporter;
  provider: NodeTracerProvider;
  tracer: Tracer;
} {
  const exporter = new InMemorySpanExporter();
  const provider = new NodeTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  return {
    exporter,
    provider,
    tracer: provider.getTracer(OPENTELEMETRY.INSTRUMENTATION_NAME),
  };
}

/* ── createTracingMiddleware 测试 ─────────────────── */

test("中间件为每个请求创建一个 SERVER 类型的 span", async () => {
  const { exporter, provider, tracer } = createTestTracer();
  try {
    const app = createApp(createFakeOrderService(), undefined, () => {}, tracer);
    await app.request(OPS_API_ROUTE.ORDER_HEALTH);
    const spans = exporter.getFinishedSpans();

    assert.equal(spans.length, 1, "应该恰好产生一个 span");
    assert.equal(spans[0]?.kind, SpanKind.SERVER, "span 类型必须为 SERVER");
  } finally {
    await provider.shutdown();
  }
});

test("span 名称格式为「METHOD /path」", async () => {
  const { exporter, provider, tracer } = createTestTracer();
  try {
    const app = createApp(createFakeOrderService(), undefined, () => {}, tracer);
    await app.request(OPS_API_ROUTE.ORDER_HEALTH);
    const span = exporter.getFinishedSpans()[0];

    assert.equal(span?.name, `GET ${OPS_API_ROUTE.ORDER_HEALTH}`);
  } finally {
    await provider.shutdown();
  }
});

test("span 包含 http.request.method 和 url.path 属性", async () => {
  const { exporter, provider, tracer } = createTestTracer();
  try {
    const app = createApp(createFakeOrderService(), undefined, () => {}, tracer);
    await app.request(OPS_API_ROUTE.ORDER_HEALTH);
    const span = exporter.getFinishedSpans()[0];

    assert.equal(span?.attributes["http.request.method"], "GET");
    assert.equal(span?.attributes["url.path"], OPS_API_ROUTE.ORDER_HEALTH);
  } finally {
    await provider.shutdown();
  }
});

test("span 包含 http.response.status_code 属性", async () => {
  const { exporter, provider, tracer } = createTestTracer();
  try {
    const app = createApp(createFakeOrderService(), undefined, () => {}, tracer);
    await app.request(OPS_API_ROUTE.ORDER_HEALTH);
    const span = exporter.getFinishedSpans()[0];

    assert.equal(span?.attributes["http.response.status_code"], 200);
  } finally {
    await provider.shutdown();
  }
});

test("traceId 被设置到 Hono context 中，供后续中间件使用", async () => {
  const { exporter, provider, tracer } = createTestTracer();
  try {
    const lines: string[] = [];
    const app = createApp(
      createFakeOrderService(),
      undefined,
      (msg) => lines.push(msg),
      tracer,
    );
    const response = await app.request(OPS_API_ROUTE.ORDER_HEALTH);
    const logEntry = JSON.parse(lines[0] ?? "{}");
    const span = exporter.getFinishedSpans()[0];

    assert.equal(logEntry.traceId, span?.spanContext().traceId);
    assert.equal(response.headers.get("x-trace-id"), logEntry.traceId);
    assert.match(logEntry.traceId, /^[0-9a-f]{32}$/, "traceId 必须是 W3C 32 位十六进制格式");
  } finally {
    await provider.shutdown();
  }
});

test("500 响应的 span 状态标记为 ERROR", async () => {
  const { exporter, provider, tracer } = createTestTracer();
  try {
    const app = createApp(createFakeOrderService(), undefined, () => {}, tracer);
    await app.request(OPS_API_ROUTE.DEMO_FAIL_500, { method: "POST" });
    const span = exporter.getFinishedSpans()[0];

    assert.equal(span?.status.code, SpanStatusCode.ERROR);
    assert.equal(span?.attributes["http.response.status_code"], 500);
  } finally {
    await provider.shutdown();
  }
});

test("500 响应的 span 记录 opsagent.error.code 属性", async () => {
  const { exporter, provider, tracer } = createTestTracer();
  try {
    const app = createApp(createFakeOrderService(), undefined, () => {}, tracer);
    await app.request(OPS_API_ROUTE.DEMO_FAIL_500, { method: "POST" });
    const span = exporter.getFinishedSpans()[0];

    assert.equal(
      span?.attributes[OPENTELEMETRY.SPAN_ATTRIBUTE.ERROR_CODE],
      API_ERROR_CODE.DEMO_FORCED_FAILURE,
    );
  } finally {
    await provider.shutdown();
  }
});

test("未抛异常时 span 正常结束（finally 块保证 span.end 被调用）", async () => {
  const { exporter, provider, tracer } = createTestTracer();
  try {
    const app = createApp(createFakeOrderService(), undefined, () => {}, tracer);
    await app.request(OPS_API_ROUTE.ORDER_HEALTH);
    const spans = exporter.getFinishedSpans();

    assert.equal(spans.length, 1, "span 必须已结束并导出");
    const span = spans[0]!;
    assert.ok(span.endTime[0] > 0 || span.endTime[1] > 0, "endTime 不能为零");
  } finally {
    await provider.shutdown();
  }
});

test("400 响应的 span 不会标记为 ERROR 状态", async () => {
  const { exporter, provider, tracer } = createTestTracer();
  try {
    const app = createApp(createFakeOrderService(), undefined, () => {}, tracer);
    await app.request(OPS_API_ROUTE.ORDERS, {
      method: "POST",
      body: JSON.stringify({ customerName: "", totalCents: 0 }),
      headers: { "content-type": "application/json" },
    });
    const span = exporter.getFinishedSpans()[0];

    assert.equal(span?.attributes["http.response.status_code"], 400);
    assert.notEqual(span?.status.code, SpanStatusCode.ERROR, "400 不应标记为 ERROR");
  } finally {
    await provider.shutdown();
  }
});

test("400 响应的 span 仍然记录 errorCode 属性", async () => {
  const { exporter, provider, tracer } = createTestTracer();
  try {
    const app = createApp(createFakeOrderService(), undefined, () => {}, tracer);
    await app.request(OPS_API_ROUTE.ORDERS, {
      method: "POST",
      body: JSON.stringify({ customerName: "", totalCents: 0 }),
      headers: { "content-type": "application/json" },
    });
    const span = exporter.getFinishedSpans()[0];

    assert.equal(
      span?.attributes[OPENTELEMETRY.SPAN_ATTRIBUTE.ERROR_CODE],
      API_ERROR_CODE.INVALID_ORDER_INPUT,
    );
  } finally {
    await provider.shutdown();
  }
});

/* ── initializeTelemetry 测试 ─────────────────────── */

test("initializeTelemetry 在 enabled=false 时返回空操作的 shutdown", async () => {
  const runtime = initializeTelemetry("http://localhost:4318/v1/traces", false);
  assert.equal(typeof runtime.shutdown, "function");
  // 空操作 shutdown 不应抛异常
  await runtime.shutdown();
});

test("initializeTelemetry 在 enabled=true 时返回可用的 shutdown 函数", async () => {
  const runtime = initializeTelemetry("http://localhost:4318/v1/traces", true);
  assert.equal(typeof runtime.shutdown, "function");
  await runtime.shutdown();
});
