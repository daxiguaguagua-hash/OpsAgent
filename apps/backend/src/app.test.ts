import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  SpanStatusCode,
  type Tracer,
} from "@opentelemetry/api";
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  NodeTracerProvider,
} from "@opentelemetry/sdk-trace-node";
import type { Order } from "@opsagent/db/schema";
import {
  OPS_API_ROUTE,
  OPS_HTTP_HEADER,
  OPS_HTTP_METHOD,
  OPS_SERVICE_STATUS,
  type OrderHealthDto,
} from "@opsagent/shared";

import { createApp } from "./app";
import type {
  CreateOrderInput,
  OrderService,
} from "./business/orders";
import {
  API_ERROR_CODE,
  HTTP_STATUS,
} from "./http/constants";
import { DEMO_BUSINESS } from "./business/constants";
import type { DemoService } from "./business/demo";
import { PROMETHEUS } from "./observability/constants";
import { OPENTELEMETRY } from "./observability/constants";
import {
  createRuntimeLogSink,
  type LogEntry,
  type LogSink,
} from "./observability/logger";
import {
  httpRequestsTotal,
  httpRequestDurationSeconds,
  METRICS_ROUTE,
} from "./observability/metrics";

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

function requireSingleLogLine(lines: string[]): string {
  assert.equal(lines.length, 1, "exactly one log line per request");
  const line = lines[0];
  assert.ok(line, "structured log line must be present");
  return line;
}

function createFakeOrderService(): OrderService {
  const storedOrders = [FIXTURE_ORDER];

  return {
    async checkHealth() {
      return FIXTURE_HEALTH;
    },
    async create(input: CreateOrderInput) {
      const order = {
        ...FIXTURE_ORDER,
        id: storedOrders.length + 1,
        customerName: input.customerName,
        totalCents: input.totalCents,
      };
      storedOrders.push(order);
      return order;
    },
    async list() {
      return storedOrders;
    },
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

test("order health exposes database and cache status", async () => {
  const response = await createApp(createFakeOrderService()).request(
    OPS_API_ROUTE.ORDER_HEALTH,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), FIXTURE_HEALTH);
});

test("orders can be created and listed", async () => {
  const app = createApp(createFakeOrderService());
  const createResponse = await app.request(OPS_API_ROUTE.ORDERS, {
    method: OPS_HTTP_METHOD.POST,
    body: JSON.stringify({
      customerName: "Vincent",
      totalCents: 9900,
    }),
    headers: {
      "content-type": "application/json",
    },
  });

  assert.equal(createResponse.status, HTTP_STATUS.CREATED);

  const listResponse = await app.request(OPS_API_ROUTE.ORDERS);
  const body = await listResponse.json() as { orders: Order[] };
  assert.equal(body.orders.length, 2);
  assert.equal(body.orders[1]?.customerName, "Vincent");
});

test("invalid order input returns a stable error code", async () => {
  const response = await createApp(createFakeOrderService()).request(
    OPS_API_ROUTE.ORDERS,
    {
      method: OPS_HTTP_METHOD.POST,
      body: JSON.stringify({
        customerName: "",
        totalCents: 0,
      }),
      headers: {
        "content-type": "application/json",
      },
    },
  );
  const body = await response.json() as {
    error: { code: string };
  };

  assert.equal(response.status, HTTP_STATUS.BAD_REQUEST);
  assert.equal(body.error.code, API_ERROR_CODE.INVALID_ORDER_INPUT);
});

test("controlled backend failure returns a stable 500 response", async () => {
  const response = await createApp(createFakeOrderService()).request(
    OPS_API_ROUTE.DEMO_FAIL_500,
    {
      method: OPS_HTTP_METHOD.POST,
    },
  );
  const body = await response.json() as {
    error: {
      code: string;
      message: string;
      stack?: string;
    };
  };

  assert.equal(response.status, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  assert.equal(body.error.code, API_ERROR_CODE.DEMO_FORCED_FAILURE);
  assert.equal(body.error.stack, undefined);
});

test("slow endpoint delegates the configured delay", async () => {
  let requestedDelay = 0;
  const fakeDemoService: DemoService = {
    async delay(milliseconds) {
      requestedDelay = milliseconds;
    },
  };
  const response = await createApp(
    createFakeOrderService(),
    fakeDemoService,
  ).request(OPS_API_ROUTE.DEMO_SLOW);
  const body = await response.json() as {
    status: string;
    configuredDelayMs: number;
    thresholdMs: number;
  };

  assert.equal(response.status, 200);
  assert.equal(requestedDelay, DEMO_BUSINESS.SLOW_DELAY_MS);
  assert.equal(body.status, OPS_SERVICE_STATUS.COMPLETED);
  assert.equal(body.configuredDelayMs, DEMO_BUSINESS.SLOW_DELAY_MS);
  assert.equal(body.thresholdMs, DEMO_BUSINESS.SLOW_THRESHOLD_MS);
});

test("response includes trace ID header on success", async () => {
  const response = await createApp(createFakeOrderService()).request(
    OPS_API_ROUTE.ORDER_HEALTH,
  );

  const traceId = response.headers.get(OPS_HTTP_HEADER.TRACE_ID);
  assert.ok(traceId, "trace ID header must be present");
  assert.ok(
    traceId.startsWith("opsagent-"),
    "trace ID must have opsagent prefix",
  );
});

test("structured log output is parseable JSON with required fields", async () => {
  const lines: string[] = [];
  const sink: LogSink = (message) => {
    lines.push(message);
  };

  const app = createApp(createFakeOrderService(), undefined, sink);
  await app.request(OPS_API_ROUTE.ORDER_HEALTH);

  const entry = JSON.parse(requireSingleLogLine(lines)) as LogEntry;

  assert.equal(typeof entry.timestamp, "string");
  assert.equal(entry.level, "INFO");
  assert.equal(typeof entry.traceId, "string");
  assert.ok(entry.traceId.startsWith("opsagent-"));
  assert.equal(entry.method, "GET");
  assert.equal(entry.route, OPS_API_ROUTE.ORDER_HEALTH);
  assert.equal(entry.statusCode, 200);
  assert.equal(typeof entry.durationMs, "number");
  assert.equal(entry.errorCode, undefined);
});

test("trace ID is inherited from incoming request header", async () => {
  const lines: string[] = [];
  const sink: LogSink = (message) => {
    lines.push(message);
  };
  const upstreamTraceId = "upstream-abc-123";

  const app = createApp(createFakeOrderService(), undefined, sink);
  const response = await app.request(OPS_API_ROUTE.ORDER_HEALTH, {
    headers: { [OPS_HTTP_HEADER.TRACE_ID]: upstreamTraceId },
  });

  assert.equal(
    response.headers.get(OPS_HTTP_HEADER.TRACE_ID),
    upstreamTraceId,
  );
  const entry = JSON.parse(requireSingleLogLine(lines)) as LogEntry;
  assert.equal(entry.traceId, upstreamTraceId);
});

test("invalid incoming trace ID is replaced with a generated ID", async () => {
  const lines: string[] = [];
  const app = createApp(
    createFakeOrderService(),
    undefined,
    (message) => lines.push(message),
  );

  const response = await app.request(OPS_API_ROUTE.ORDER_HEALTH, {
    headers: { [OPS_HTTP_HEADER.TRACE_ID]: "invalid trace id" },
  });
  const traceId = response.headers.get(OPS_HTTP_HEADER.TRACE_ID);

  assert.ok(traceId?.startsWith("opsagent-"));
  assert.notEqual(traceId, "invalid trace id");
  const entry = JSON.parse(requireSingleLogLine(lines)) as LogEntry;
  assert.equal(entry.traceId, traceId);
});

test("error log for 500 includes errorCode without stack or sensitive data", async () => {
  const lines: string[] = [];
  const sink: LogSink = (message) => {
    lines.push(message);
  };

  const app = createApp(createFakeOrderService(), undefined, sink);
  await app.request(OPS_API_ROUTE.DEMO_FAIL_500, {
    method: OPS_HTTP_METHOD.POST,
  });

  const raw = requireSingleLogLine(lines);
  const entry = JSON.parse(raw) as LogEntry;
  assert.equal(entry.level, "ERROR");
  assert.equal(entry.statusCode, 500);
  assert.equal(entry.errorCode, API_ERROR_CODE.DEMO_FORCED_FAILURE);

  assert.equal(raw.includes("stack"), false);
  assert.equal(raw.includes("authorization"), false);
  assert.equal(raw.includes("cookie"), false);
});

test("error log for 400 includes stable errorCode", async () => {
  const lines: string[] = [];
  const sink: LogSink = (message) => {
    lines.push(message);
  };

  const app = createApp(createFakeOrderService(), undefined, sink);
  await app.request(OPS_API_ROUTE.ORDERS, {
    method: OPS_HTTP_METHOD.POST,
    body: JSON.stringify({ customerName: "", totalCents: 0 }),
    headers: { "content-type": "application/json" },
  });

  const entry = JSON.parse(requireSingleLogLine(lines)) as LogEntry;
  assert.equal(entry.level, "ERROR");
  assert.equal(entry.statusCode, 400);
  assert.equal(entry.errorCode, API_ERROR_CODE.INVALID_ORDER_INPUT);
});

test("structured log trace ID matches the OpenTelemetry span", async () => {
  const lines: string[] = [];
  const { exporter, provider, tracer } = createTestTracer();

  try {
    const app = createApp(
      createFakeOrderService(),
      undefined,
      (message) => lines.push(message),
      tracer,
    );
    const response = await app.request(OPS_API_ROUTE.ORDER_HEALTH);
    const entry = JSON.parse(requireSingleLogLine(lines)) as LogEntry;
    const spans = exporter.getFinishedSpans();

    assert.equal(spans.length, 1);
    assert.equal(entry.traceId, spans[0]?.spanContext().traceId);
    assert.equal(
      response.headers.get(OPS_HTTP_HEADER.TRACE_ID),
      entry.traceId,
    );
    assert.match(entry.traceId, /^[0-9a-f]{32}$/);
  } finally {
    await provider.shutdown();
  }
});

test("500 request span includes error status and stable error code", async () => {
  const { exporter, provider, tracer } = createTestTracer();

  try {
    const app = createApp(
      createFakeOrderService(),
      undefined,
      () => {},
      tracer,
    );
    await app.request(OPS_API_ROUTE.DEMO_FAIL_500, {
      method: OPS_HTTP_METHOD.POST,
    });
    const spans = exporter.getFinishedSpans();
    const span = spans[0];

    assert.equal(spans.length, 1);
    assert.equal(span?.status.code, SpanStatusCode.ERROR);
    assert.equal(
      span?.attributes[OPENTELEMETRY.SPAN_ATTRIBUTE.ERROR_CODE],
      API_ERROR_CODE.DEMO_FORCED_FAILURE,
    );
    assert.equal(span?.attributes["http.response.status_code"], 500);
  } finally {
    await provider.shutdown();
  }
});

test("runtime log sink keeps console output when file logging is disabled", () => {
  const lines: string[] = [];
  const sink = createRuntimeLogSink(
    undefined,
    (message) => lines.push(message),
  );

  sink("{\"status\":\"ok\"}");

  assert.deepEqual(lines, ["{\"status\":\"ok\"}"]);
});

test("runtime log sink creates a JSONL file and keeps console output", async () => {
  const directory = mkdtempSync(join(tmpdir(), "opsagent-logs-"));
  const filePath = join(directory, "nested", "backend.jsonl");
  const consoleLines: string[] = [];

  try {
    const sink = createRuntimeLogSink(
      filePath,
      (message) => consoleLines.push(message),
    );
    const app = createApp(createFakeOrderService(), undefined, sink);

    await app.request(OPS_API_ROUTE.DEMO_FAIL_500, {
      method: OPS_HTTP_METHOD.POST,
    });

    const fileLines = readFileSync(filePath, "utf8").trim().split("\n");
    assert.equal(fileLines.length, 1);
    assert.deepEqual(consoleLines, fileLines);

    const entry = JSON.parse(fileLines[0] ?? "") as LogEntry;
    assert.equal(entry.statusCode, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    assert.equal(entry.errorCode, API_ERROR_CODE.DEMO_FORCED_FAILURE);
    assert.equal(fileLines[0]?.includes("stack"), false);
    assert.equal(fileLines[0]?.includes("authorization"), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("metrics endpoint returns Prometheus text with expected metric names", async () => {
  const app = createApp(createFakeOrderService());
  const response = await app.request(METRICS_ROUTE);

  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get("content-type"),
    PROMETHEUS.CONTENT_TYPE,
  );

  const body = await response.text();
  assert.ok(
    body.includes(PROMETHEUS.METRIC_NAME.HTTP_REQUESTS_TOTAL),
    "includes counter",
  );
  assert.ok(
    body.includes(PROMETHEUS.METRIC_NAME.HTTP_REQUEST_DURATION_SECONDS),
    "includes histogram",
  );
});

test("http_requests_total increments after a backend request", async () => {
  const app = createApp(createFakeOrderService());

  const response = await app.request(OPS_API_ROUTE.ORDER_HEALTH);

  const metric = await httpRequestsTotal.get();
  const matching = metric.values.find(
    (v) =>
      v.labels.method === OPS_HTTP_METHOD.GET
      && v.labels.route === OPS_API_ROUTE.ORDER_HEALTH
      && v.labels.status_code === String(response.status),
  );

  assert.ok(matching, "counter has entry for the health check request");
  assert.ok(matching.value >= 1, "counter value is at least 1");
});

test("http_request_duration_seconds records duration after a request", async () => {
  const app = createApp(createFakeOrderService());

  const response = await app.request(OPS_API_ROUTE.ORDER_HEALTH);

  const metric = await httpRequestDurationSeconds.get();
  const matching = metric.values.find(
    (v) =>
      v.labels.method === OPS_HTTP_METHOD.GET
      && v.labels.route === OPS_API_ROUTE.ORDER_HEALTH
      && v.labels.status_code === String(response.status),
  );

  assert.ok(matching, "histogram has entry for the health check request");
  assert.ok(typeof matching.value === "number");
});

test("http_requests_total records 500 error requests with correct labels", async () => {
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

  assert.ok(matching, "counter has entry for the 500 fail request");
  assert.ok(matching.value >= 1, "counter value is at least 1");
});

test("unexpected errors use a stable code without leaking exception details", async () => {
  const lines: string[] = [];
  const failingOrders = createFakeOrderService();
  failingOrders.checkHealth = async () => {
    throw new Error("database password must remain private");
  };
  const app = createApp(
    failingOrders,
    undefined,
    (message) => lines.push(message),
  );

  const response = await app.request(OPS_API_ROUTE.ORDER_HEALTH);
  const raw = requireSingleLogLine(lines);
  const entry = JSON.parse(raw) as LogEntry;

  assert.equal(response.status, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  assert.equal(entry.level, "ERROR");
  assert.equal(entry.errorCode, API_ERROR_CODE.INTERNAL_SERVER_ERROR);
  assert.equal(raw.includes("database password"), false);
  assert.equal(raw.includes("stack"), false);
});
