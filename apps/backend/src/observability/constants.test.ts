/**
 * constants.ts 单元测试
 *
 * 覆盖范围：
 * - OBSERVABILITY：traceId 相关配置常量
 * - OPENTELEMETRY：OTel 服务名、instrumentation 名、默认端点、span 属性、信号
 * - LOG_LEVEL：日志级别枚举
 * - PROMETHEUS：Prometheus 路由、content-type、指标名称、标签
 * - TRACE_ID_PATTERN：traceId 正则校验
 * - TEMPO：Tempo 查询端点、API 路径、Accept 头
 *
 * 运行方式：pnpm --filter backend exec tsx --test src/observability/constants.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";

import { OPS_HTTP_HEADER } from "@opsagent/shared";

import {
  LOG_LEVEL,
  OBSERVABILITY,
  OPENTELEMETRY,
  PROMETHEUS,
  TEMPO,
  TRACE_ID_PATTERN,
} from "./constants";

/* ── OBSERVABILITY 常量测试 ──────────────────────── */

test("OBSERVABILITY.TRACE_ID_HEADER 与共享包的 x-trace-id 保持一致", () => {
  assert.equal(OBSERVABILITY.TRACE_ID_HEADER, OPS_HTTP_HEADER.TRACE_ID);
  assert.equal(OBSERVABILITY.TRACE_ID_HEADER, "x-trace-id");
});

test("OBSERVABILITY.TRACE_ID_PREFIX 为 opsagent", () => {
  assert.equal(OBSERVABILITY.TRACE_ID_PREFIX, "opsagent");
});

test("OBSERVABILITY.TRACE_ID_MAX_LENGTH 为正整数", () => {
  assert.equal(typeof OBSERVABILITY.TRACE_ID_MAX_LENGTH, "number");
  assert.ok(OBSERVABILITY.TRACE_ID_MAX_LENGTH > 0);
});

/* ── OPENTELEMETRY 常量测试 ──────────────────────── */

test("OPENTELEMETRY.SERVICE_NAME 为 opsagent-backend", () => {
  assert.equal(OPENTELEMETRY.SERVICE_NAME, "opsagent-backend");
});

test("OPENTELEMETRY.INSTRUMENTATION_NAME 为 opsagent-backend-http", () => {
  assert.equal(OPENTELEMETRY.INSTRUMENTATION_NAME, "opsagent-backend-http");
});

test("OPENTELEMETRY.DEFAULT_OTLP_HTTP_ENDPOINT 为合法的 OTLP HTTP URL", () => {
  const url = new URL(OPENTELEMETRY.DEFAULT_OTLP_HTTP_ENDPOINT);
  assert.equal(url.protocol, "http:");
  assert.ok(url.pathname.includes("/v1/traces"));
});

test("OPENTELEMETRY.SPAN_ATTRIBUTE.ERROR_CODE 采用反向域名格式", () => {
  assert.equal(OPENTELEMETRY.SPAN_ATTRIBUTE.ERROR_CODE, "opsagent.error.code");
});

test("OPENTELEMETRY.SIGNAL 包含 SIGINT 和 SIGTERM", () => {
  assert.equal(OPENTELEMETRY.SIGNAL.INTERRUPT, "SIGINT");
  assert.equal(OPENTELEMETRY.SIGNAL.TERMINATE, "SIGTERM");
});

/* ── LOG_LEVEL 常量测试 ──────────────────────────── */

test("LOG_LEVEL 包含 INFO 和 ERROR 两个级别", () => {
  assert.equal(LOG_LEVEL.INFO, "INFO");
  assert.equal(LOG_LEVEL.ERROR, "ERROR");
  assert.equal(Object.keys(LOG_LEVEL).length, 2, "不应有多余的日志级别");
});

/* ── PROMETHEUS 常量测试 ─────────────────────────── */

test("PROMETHEUS.ROUTE 为 /metrics", () => {
  assert.equal(PROMETHEUS.ROUTE, "/metrics");
});

test("PROMETHEUS.CONTENT_TYPE 符合 Prometheus 文本格式规范", () => {
  assert.equal(PROMETHEUS.CONTENT_TYPE, "text/plain; version=0.0.4");
});

test("PROMETHEUS.METRIC_NAME 包含 http_requests_total 和 http_request_duration_seconds", () => {
  assert.equal(PROMETHEUS.METRIC_NAME.HTTP_REQUESTS_TOTAL, "http_requests_total");
  assert.equal(PROMETHEUS.METRIC_NAME.HTTP_REQUEST_DURATION_SECONDS, "http_request_duration_seconds");
});

test("PROMETHEUS.METRIC_HELP 为每个指标提供人类可读的说明", () => {
  assert.ok(PROMETHEUS.METRIC_HELP.HTTP_REQUESTS_TOTAL.length > 0);
  assert.ok(PROMETHEUS.METRIC_HELP.HTTP_REQUEST_DURATION_SECONDS.length > 0);
});

test("PROMETHEUS.LABEL 包含 method、route、status_code 三个标签", () => {
  assert.equal(PROMETHEUS.LABEL.METHOD, "method");
  assert.equal(PROMETHEUS.LABEL.ROUTE, "route");
  assert.equal(PROMETHEUS.LABEL.STATUS_CODE, "status_code");
});

/* ── TRACE_ID_PATTERN 测试 ───────────────────────── */

test("TRACE_ID_PATTERN 匹配合法的 traceId 格式", () => {
  assert.ok(TRACE_ID_PATTERN.test("opsagent-abc-123"));
  assert.ok(TRACE_ID_PATTERN.test("upstream-trace-id"));
  assert.ok(TRACE_ID_PATTERN.test("abc123"));
  assert.ok(TRACE_ID_PATTERN.test("trace:id:with:colons"));
  assert.ok(TRACE_ID_PATTERN.test("trace.with.dots"));
});

test("TRACE_ID_PATTERN 拒绝包含空格和特殊字符的 traceId", () => {
  assert.equal(TRACE_ID_PATTERN.test("invalid trace id"), false);
  assert.equal(TRACE_ID_PATTERN.test("trace/with/slash"), false);
  assert.equal(TRACE_ID_PATTERN.test("trace@with@at"), false);
  assert.equal(TRACE_ID_PATTERN.test("trace#with#hash"), false);
});

/* ── TEMPO 常量测试 ──────────────────────────────── */

test("TEMPO.DEFAULT_QUERY_ENDPOINT 为合法的 Tempo URL", () => {
  const url = new URL(TEMPO.DEFAULT_QUERY_ENDPOINT);
  assert.equal(url.protocol, "http:");
  assert.equal(url.port, "3200");
});

test("TEMPO.API_PATH 为 /api/traces", () => {
  assert.equal(TEMPO.API_PATH, "/api/traces");
});

test("TEMPO.ACCEPT_HEADER 为 application/json", () => {
  assert.equal(TEMPO.ACCEPT_HEADER, "application/json");
});

/* ── 常量完整性测试 ──────────────────────────────── */

test("所有导出的常量对象不为 null 且为 object 类型", () => {
  for (const [name, value] of [
    ["OBSERVABILITY", OBSERVABILITY],
    ["OPENTELEMETRY", OPENTELEMETRY],
    ["LOG_LEVEL", LOG_LEVEL],
    ["PROMETHEUS", PROMETHEUS],
    ["TEMPO", TEMPO],
  ] as const) {
    assert.ok(value !== null && typeof value === "object", `${name} 必须是有效的对象`);
  }
});

test("TRACE_ID_PATTERN 是 RegExp 实例", () => {
  assert.ok(TRACE_ID_PATTERN instanceof RegExp);
});
