export const GIT_CONTEXT_TOOL = {
  ID: "git-context",
  DESCRIPTION:
    "Read a source file in the OpsAgent repository and list its most recent git commits. Use this to associate an incident with the code that was last changed.",
  DEFAULT_COMMIT_LIMIT: 5,
  COMMIT_LIMIT_MIN: 1,
  COMMIT_LIMIT_MAX: 20,
  MAX_CONTENT_BYTES: 256 * 1024,
  ERROR: {
    PATH_OUT_OF_REPO: "PATH_OUT_OF_REPO",
    FILE_NOT_FOUND: "FILE_NOT_FOUND",
    CONTENT_TRUNCATED: "CONTENT_TRUNCATED",
    READ_FAILED: "READ_FAILED",
    GIT_FAILED: "GIT_FAILED",
  },
} as const;

export type GitContextErrorCode =
  (typeof GIT_CONTEXT_TOOL.ERROR)[keyof typeof GIT_CONTEXT_TOOL.ERROR];

export const PROMETHEUS_TOOL = {
  ID: "prometheus",
  DESCRIPTION:
    "Query Prometheus for instant or range metrics (error rate, latency percentiles, request rate). Use this to collect evidence for an incident report.",
  DEFAULT_ENDPOINT: "http://localhost:9090",
  DEFAULT_STEP: "60s",
  DEFAULT_RANGE_SECONDS: 3600,
  API_PATH: {
    QUERY: "/api/v1/query",
    QUERY_RANGE: "/api/v1/query_range",
  },
  TIMEOUT_MS: 10_000,
  ERROR: {
    FETCH_FAILED: "FETCH_FAILED",
    INVALID_RESPONSE: "INVALID_RESPONSE",
    PROMETHEUS_ERROR: "PROMETHEUS_ERROR",
  },
  UNIT: {
    SECONDS: "seconds",
    BYTES: "bytes",
    COUNT: "count",
    RATIO: "ratio",
    UNKNOWN: "unknown",
  },
} as const;

export type PrometheusToolErrorCode =
  (typeof PROMETHEUS_TOOL.ERROR)[keyof typeof PROMETHEUS_TOOL.ERROR];

export type PrometheusUnit =
  (typeof PROMETHEUS_TOOL.UNIT)[keyof typeof PROMETHEUS_TOOL.UNIT];

export const LOKI_TOOL = {
  ID: "loki",
  DESCRIPTION:
    "Query Loki for log entries within a time window (LogQL). Use this to retrieve error logs and traceIds as evidence for an incident report.",
  DEFAULT_ENDPOINT: "http://localhost:3100",
  API_PATH: {
    QUERY_RANGE: "/loki/api/v1/query_range",
    QUERY: "/loki/api/v1/query",
  },
  DEFAULT_LIMIT: 100,
  MIN_LIMIT: 1,
  MAX_LIMIT: 1000,
  DEFAULT_LOOKBACK_SECONDS: 3600,
  TIMEOUT_MS: 15_000,
  ERROR: {
    FETCH_FAILED: "FETCH_FAILED",
    INVALID_RESPONSE: "INVALID_RESPONSE",
    LOKI_ERROR: "LOKI_ERROR",
  },
} as const;

export type LokiToolErrorCode =
  (typeof LOKI_TOOL.ERROR)[keyof typeof LOKI_TOOL.ERROR];

export const TRACE_TOOL = {
  ID: "trace",
  DESCRIPTION:
    "Retrieve a single trace by traceId from Tempo (span tree, root service, total duration). Use this to locate the slow or failing span within a request.",
  DEFAULT_ENDPOINT: "http://localhost:3200",
  API_PATH: "/api/traces",
  TIMEOUT_MS: 10_000,
  TRACE_ID_PATTERN: /^[A-Za-z0-9._:-]+$/,
  STATUS: {
    OK: "OK",
    ERROR: "ERROR",
    UNSET: "UNSET",
  },
  ERROR: {
    FETCH_FAILED: "FETCH_FAILED",
    INVALID_RESPONSE: "INVALID_RESPONSE",
    TEMPO_ERROR: "TEMPO_ERROR",
    INVALID_TRACE_ID: "INVALID_TRACE_ID",
    TRACE_NOT_FOUND: "TRACE_NOT_FOUND",
  },
} as const;

export type TraceToolErrorCode =
  (typeof TRACE_TOOL.ERROR)[keyof typeof TRACE_TOOL.ERROR];

export type TraceSpanStatus =
  (typeof TRACE_TOOL.STATUS)[keyof typeof TRACE_TOOL.STATUS];

export const SENTRY_TOOL = {
  ID: "sentry",
  DESCRIPTION:
    "Query Sentry for recent frontend error issues and their latest events (symbolicated stacktrace + breadcrumbs + browser context). Use this to analyze frontend exceptions and correlate them with recent source code changes via git-context.",
  DEFAULT_ENDPOINT: "https://sentry.io/api/0",
  API_PATH: {
    PROJECT_ISSUES: "/projects/{org}/{project}/issues/",
    ISSUE_LATEST_EVENT: "/issues/{issueId}/events/latest/",
  },
  TIMEOUT_MS: 15_000,
  DEFAULT_QUERY: "is:unresolved",
  DEFAULT_LIMIT: 5,
  MIN_LIMIT: 1,
  MAX_LIMIT: 20,
  MAX_STACKTRACE_FRAMES: 20,
  MAX_BREADCRUMBS: 30,
  ERROR: {
    FETCH_FAILED: "FETCH_FAILED",
    INVALID_RESPONSE: "INVALID_RESPONSE",
    SENTRY_ERROR: "SENTRY_ERROR",
    MISSING_CONFIG: "MISSING_CONFIG",
    INVALID_LIMIT: "INVALID_LIMIT",
  },
} as const;

export type SentryToolErrorCode =
  (typeof SENTRY_TOOL.ERROR)[keyof typeof SENTRY_TOOL.ERROR];

export const GLITCHTIP_TOOL = {
  ID: "glitchtip",
  DESCRIPTION:
    "Retrieve a frontend error issue from GlitchTip (Sentry-compatible self-hosted) together with its latest event's symbolicated stacktrace. Each frame carries the resolved source file path (e.g. src/routes/index.tsx), line number, and a context window of surrounding source lines — quote the contextLine in the incident report so the reader can see the actual code that threw. Prefer this tool over 'sentry' when diagnosing frontend exceptions, because it returns the source context inline (no second git-context call needed for the throw site).",
  DEFAULT_ENDPOINT: "http://localhost:8001/api/0",
  API_PATH: {
    ISSUE_DETAIL: "/issues/{issueId}/",
    ISSUE_LATEST_EVENT: "/issues/{issueId}/events/latest/",
  },
  TIMEOUT_MS: 15_000,
  DEFAULT_QUERY: "is:unresolved",
  DEFAULT_LIMIT: 5,
  MIN_LIMIT: 1,
  MAX_LIMIT: 20,
  MAX_STACKTRACE_FRAMES: 20,
  MAX_CONTEXT_LINES: 20,
  ERROR: {
    FETCH_FAILED: "FETCH_FAILED",
    INVALID_RESPONSE: "INVALID_RESPONSE",
    GLITCHTIP_ERROR: "GLITCHTIP_ERROR",
    MISSING_CONFIG: "MISSING_CONFIG",
  },
} as const;

export type GlitchtipToolErrorCode =
  (typeof GLITCHTIP_TOOL.ERROR)[keyof typeof GLITCHTIP_TOOL.ERROR];
