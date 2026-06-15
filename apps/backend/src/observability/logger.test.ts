/**
 * logger.ts 单元测试
 *
 * 覆盖范围：
 * - createStructuredLogger：JSON 日志格式、必填字段、traceId 关联、errorCode
 * - generateTraceId / resolveTraceId：traceId 生成和校验逻辑
 * - createFileLogSink / createRuntimeLogSink：日志输出管道
 *
 * 运行方式：pnpm --filter backend exec tsx --test src/observability/logger.test.ts
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { Order } from "@opsagent/db/schema";
import { OPS_API_ROUTE, OPS_HTTP_HEADER, OPS_SERVICE_STATUS, type OrderHealthDto } from "@opsagent/shared";

import { createApp } from "../app";
import type { OrderService, CreateOrderInput } from "../business/orders";
import { API_ERROR_CODE } from "../http/constants";
import {
  createFileLogSink,
  createRuntimeLogSink,
  generateTraceId,
  resolveTraceId,
  type LogEntry,
} from "./logger";
import { OBSERVABILITY } from "./constants";

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

/* ── generateTraceId 测试 ─────────────────────────── */

test("生成的 traceId 以 opsagent- 为前缀", () => {
  const traceId = generateTraceId();
  assert.ok(traceId.startsWith(OBSERVABILITY.TRACE_ID_PREFIX));
});

test("每次生成的 traceId 都不同", () => {
  const id1 = generateTraceId();
  const id2 = generateTraceId();
  assert.notEqual(id1, id2);
});

/* ── resolveTraceId 测试 ─────────────────────────── */

test("有效的 traceId 被原样返回", () => {
  const valid = "upstream-abc-123";
  assert.equal(resolveTraceId(valid), valid);
});

test("包含空格的无效 traceId 被替换为自动生成的 ID", () => {
  const result = resolveTraceId("invalid trace id");
  assert.ok(result.startsWith(OBSERVABILITY.TRACE_ID_PREFIX));
  assert.notEqual(result, "invalid trace id");
});

test("undefined 输入时自动生成新 ID", () => {
  const result = resolveTraceId(undefined);
  assert.ok(result.startsWith(OBSERVABILITY.TRACE_ID_PREFIX));
});

test("超过最大长度的 traceId 被替换", () => {
  const tooLong = "a".repeat(OBSERVABILITY.TRACE_ID_MAX_LENGTH + 1);
  const result = resolveTraceId(tooLong);
  assert.ok(result.startsWith(OBSERVABILITY.TRACE_ID_PREFIX));
});

/* ── createStructuredLogger 测试 ─────────────────── */

test("日志输出是可解析的 JSON，包含所有必填字段", async () => {
  const lines: string[] = [];
  const app = createApp(createFakeOrderService(), undefined, (msg) => lines.push(msg));
  await app.request(OPS_API_ROUTE.ORDER_HEALTH);

  const entry = JSON.parse(lines[0]!) as LogEntry;

  assert.equal(typeof entry.timestamp, "string");
  assert.equal(entry.level, "INFO");
  assert.equal(typeof entry.traceId, "string");
  assert.equal(entry.method, "GET");
  assert.equal(entry.route, OPS_API_ROUTE.ORDER_HEALTH);
  assert.equal(entry.statusCode, 200);
  assert.equal(typeof entry.durationMs, "number");
  assert.equal(entry.errorCode, undefined);
});

test("200 响应的日志级别为 INFO", async () => {
  const lines: string[] = [];
  const app = createApp(createFakeOrderService(), undefined, (msg) => lines.push(msg));
  await app.request(OPS_API_ROUTE.ORDER_HEALTH);

  const entry = JSON.parse(lines[0]!) as LogEntry;
  assert.equal(entry.level, "INFO");
});

test("500 响应的日志级别为 ERROR 且包含 errorCode", async () => {
  const lines: string[] = [];
  const app = createApp(createFakeOrderService(), undefined, (msg) => lines.push(msg));
  await app.request(OPS_API_ROUTE.DEMO_FAIL_500, { method: "POST" });

  const entry = JSON.parse(lines[0]!) as LogEntry;
  assert.equal(entry.level, "ERROR");
  assert.equal(entry.statusCode, 500);
  assert.equal(entry.errorCode, API_ERROR_CODE.DEMO_FORCED_FAILURE);
});

test("400 响应的日志级别为 ERROR 且包含 errorCode", async () => {
  const lines: string[] = [];
  const app = createApp(createFakeOrderService(), undefined, (msg) => lines.push(msg));
  await app.request(OPS_API_ROUTE.ORDERS, {
    method: "POST",
    body: JSON.stringify({ customerName: "", totalCents: 0 }),
    headers: { "content-type": "application/json" },
  });

  const entry = JSON.parse(lines[0]!) as LogEntry;
  assert.equal(entry.level, "ERROR");
  assert.equal(entry.statusCode, 400);
  assert.equal(entry.errorCode, API_ERROR_CODE.INVALID_ORDER_INPUT);
});

test("traceId 从上游请求头继承", async () => {
  const lines: string[] = [];
  const upstreamTraceId = "upstream-abc-123";
  const app = createApp(createFakeOrderService(), undefined, (msg) => lines.push(msg));
  const response = await app.request(OPS_API_ROUTE.ORDER_HEALTH, {
    headers: { [OPS_HTTP_HEADER.TRACE_ID]: upstreamTraceId },
  });

  assert.equal(response.headers.get(OPS_HTTP_HEADER.TRACE_ID), upstreamTraceId);
  const entry = JSON.parse(lines[0]!) as LogEntry;
  assert.equal(entry.traceId, upstreamTraceId);
});

test("无效的上游 traceId 被替换为自动生成的 ID", async () => {
  const lines: string[] = [];
  const app = createApp(createFakeOrderService(), undefined, (msg) => lines.push(msg));
  const response = await app.request(OPS_API_ROUTE.ORDER_HEALTH, {
    headers: { [OPS_HTTP_HEADER.TRACE_ID]: "invalid trace id" },
  });

  const traceId = response.headers.get(OPS_HTTP_HEADER.TRACE_ID);
  assert.ok(traceId?.startsWith(OBSERVABILITY.TRACE_ID_PREFIX));
  assert.notEqual(traceId, "invalid trace id");
});

test("日志中不包含 stack、authorization、cookie 等敏感信息", async () => {
  const lines: string[] = [];
  const app = createApp(createFakeOrderService(), undefined, (msg) => lines.push(msg));
  await app.request(OPS_API_ROUTE.DEMO_FAIL_500, { method: "POST" });

  const raw = lines[0]!;
  assert.equal(raw.includes("stack"), false);
  assert.equal(raw.includes("authorization"), false);
  assert.equal(raw.includes("cookie"), false);
});

test("响应头中包含 x-trace-id", async () => {
  const app = createApp(createFakeOrderService());
  const response = await app.request(OPS_API_ROUTE.ORDER_HEALTH);

  const traceId = response.headers.get(OPS_HTTP_HEADER.TRACE_ID);
  assert.ok(traceId, "x-trace-id 响应头必须存在");
  assert.ok(traceId.startsWith("opsagent-"));
});

test("durationMs 为非负整数", async () => {
  const lines: string[] = [];
  const app = createApp(createFakeOrderService(), undefined, (msg) => lines.push(msg));
  await app.request(OPS_API_ROUTE.ORDER_HEALTH);

  const entry = JSON.parse(lines[0]!) as LogEntry;
  assert.ok(entry.durationMs >= 0);
  assert.equal(Number.isInteger(entry.durationMs), true);
});

/* ── createFileLogSink 测试 ───────────────────────── */

test("文件日志 sink 将消息追加写入 JSONL 文件", () => {
  const dir = mkdtempSync(join(tmpdir(), "opsagent-log-test-"));
  const filePath = join(dir, "test.jsonl");

  try {
    const sink = createFileLogSink(filePath);
    sink('{"status":"ok"}');
    sink('{"status":"done"}');

    const content = readFileSync(filePath, "utf8").trim().split("\n");
    assert.equal(content.length, 2);
    assert.equal(content[0], '{"status":"ok"}');
    assert.equal(content[1], '{"status":"done"}');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("文件日志 sink 自动创建嵌套目录", () => {
  const dir = mkdtempSync(join(tmpdir(), "opsagent-log-test-"));
  const filePath = join(dir, "nested", "deep", "test.jsonl");

  try {
    const sink = createFileLogSink(filePath);
    sink('{"test":true}');

    const content = readFileSync(filePath, "utf8").trim();
    assert.equal(content, '{"test":true}');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ── createRuntimeLogSink 测试 ───────────────────── */

test("无文件路径时，运行时 sink 仅输出到控制台", () => {
  const lines: string[] = [];
  const sink = createRuntimeLogSink(undefined, (msg) => lines.push(msg));

  sink('{"status":"ok"}');

  assert.deepEqual(lines, ['{"status":"ok"}']);
});

test("指定文件路径时，运行时 sink 同时输出到控制台和文件", async () => {
  const dir = mkdtempSync(join(tmpdir(), "opsagent-log-test-"));
  const filePath = join(dir, "backend.jsonl");
  const consoleLines: string[] = [];

  try {
    const sink = createRuntimeLogSink(filePath, (msg) => consoleLines.push(msg));
    const app = createApp(createFakeOrderService(), undefined, sink);
    await app.request(OPS_API_ROUTE.DEMO_FAIL_500, { method: "POST" });

    const fileLines = readFileSync(filePath, "utf8").trim().split("\n");
    assert.equal(fileLines.length, 1);
    assert.deepEqual(consoleLines, fileLines, "控制台输出和文件内容应一致");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("文件写入失败时不中断控制台输出，仅打印警告", () => {
  const dir = mkdtempSync(join(tmpdir(), "opsagent-log-test-"));
  const filePath = join(dir, "test.jsonl");
  const consoleLines: string[] = [];
  const warnings: string[] = [];

  try {
    // 先正常创建 sink
    const sink = createRuntimeLogSink(
      filePath,
      (msg) => consoleLines.push(msg),
      (msg) => warnings.push(msg),
    );

    // 正常写入
    sink('{"test":"ok"}');
    assert.equal(consoleLines.length, 1);

    // 删除文件所在的目录来模拟写入失败
    rmSync(dir, { recursive: true, force: true });

    // 再次写入，文件写入应该失败但控制台输出不受影响
    sink('{"test":"fail"}');
    assert.equal(consoleLines.length, 2, "控制台输出不受文件写入失败影响");
    assert.ok(warnings.length > 0, "应该输出文件写入失败的警告");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
