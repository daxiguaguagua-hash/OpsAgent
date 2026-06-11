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
