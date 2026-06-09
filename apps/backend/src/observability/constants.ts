import { OPS_HTTP_HEADER } from "@opsagent/shared";

export const OBSERVABILITY = {
  TRACE_ID_HEADER: OPS_HTTP_HEADER.TRACE_ID,
  TRACE_ID_PREFIX: "opsagent",
  TRACE_ID_MAX_LENGTH: 128,
} as const;

export const OPENTELEMETRY = {
  SERVICE_NAME: "opsagent-backend",
  INSTRUMENTATION_NAME: "opsagent-backend-http",
  DEFAULT_OTLP_HTTP_ENDPOINT: "http://localhost:4318/v1/traces",
  SPAN_ATTRIBUTE: {
    ERROR_CODE: "opsagent.error.code",
  },
  SIGNAL: {
    INTERRUPT: "SIGINT",
    TERMINATE: "SIGTERM",
  },
} as const;

export const LOG_LEVEL = {
  INFO: "INFO",
  ERROR: "ERROR",
} as const;

export const PROMETHEUS = {
  ROUTE: "/metrics",
  CONTENT_TYPE: "text/plain; version=0.0.4",
  METRIC_NAME: {
    HTTP_REQUESTS_TOTAL: "http_requests_total",
    HTTP_REQUEST_DURATION_SECONDS: "http_request_duration_seconds",
  },
  METRIC_HELP: {
    HTTP_REQUESTS_TOTAL: "Total number of HTTP requests",
    HTTP_REQUEST_DURATION_SECONDS: "HTTP request duration in seconds",
  },
  LABEL: {
    METHOD: "method",
    ROUTE: "route",
    STATUS_CODE: "status_code",
  },
} as const;

export const TRACE_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;

export const TEMPO = {
  DEFAULT_QUERY_ENDPOINT: "http://localhost:3200",
  API_PATH: "/api/traces",
  ACCEPT_HEADER: "application/json",
} as const;
