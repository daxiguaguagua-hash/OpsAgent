import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { PROMETHEUS_TOOL, type PrometheusUnit } from "./constants.js";

export interface PrometheusDeps {
  endpoint?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

interface PrometheusVectorResult {
  metric: Record<string, string>;
  value?: [number, string];
  values?: Array<[number, string]>;
}

interface PrometheusResponse {
  status: "success" | "error";
  data?: {
    resultType: "vector" | "matrix" | "scalar" | "string";
    result: PrometheusVectorResult[] | [number, string] | [number, string];
  };
  error?: string;
  errorType?: string;
}

function inferUnit(metricName: string | undefined): PrometheusUnit {
  if (!metricName) return PROMETHEUS_TOOL.UNIT.UNKNOWN;
  if (/^http_requests_total$|_total$/.test(metricName)) return PROMETHEUS_TOOL.UNIT.COUNT;
  if (/_seconds$|_duration/.test(metricName)) return PROMETHEUS_TOOL.UNIT.SECONDS;
  if (/_bytes$|_size/.test(metricName)) return PROMETHEUS_TOOL.UNIT.BYTES;
  if (/_ratio$|_percent|_fraction/.test(metricName)) return PROMETHEUS_TOOL.UNIT.RATIO;
  return PROMETHEUS_TOOL.UNIT.UNKNOWN;
}

function isoOrUnix(value: string): string {
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    const n = Number(value);
    if (n < 1e12) return String(n);
    return String(n / 1000);
  }
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return value;
  return String(ms / 1000);
}

function defaultEndpoint(): string {
  const raw = process.env.PROMETHEUS_URL?.trim();
  return raw && raw.length > 0 ? raw : PROMETHEUS_TOOL.DEFAULT_ENDPOINT;
}

export function createPrometheusTool(deps: PrometheusDeps = {}) {
  const endpoint = deps.endpoint ?? defaultEndpoint();
  const fetchImpl: typeof fetch = deps.fetch ?? globalThis.fetch;
  const timeoutMs = deps.timeoutMs ?? PROMETHEUS_TOOL.TIMEOUT_MS;

  return createTool({
    id: PROMETHEUS_TOOL.ID,
    description: PROMETHEUS_TOOL.DESCRIPTION,
    inputSchema: z.object({
      query: z.string().min(1).describe("PromQL 表达式"),
      time: z
        .string()
        .min(1)
        .optional()
        .describe("瞬时查询时间点，ISO 8601 或 unix 秒，默认当前时间"),
      range: z
        .object({
          start: z.string().min(1).describe("起始时间，ISO 8601 或 unix 秒"),
          end: z.string().min(1).describe("结束时间，ISO 8601 或 unix 秒"),
          step: z
            .string()
            .min(1)
            .optional()
            .describe(`步长，例如 60s / 5m，默认 ${PROMETHEUS_TOOL.DEFAULT_STEP}`),
        })
        .optional()
        .describe("提供时执行 range query，否则执行 instant query"),
    }),
    outputSchema: z.object({
      status: z.enum(["success", "error"]),
      results: z.array(
        z.object({
          metric: z.record(z.string(), z.string()),
          value: z.number().optional(),
          timestamp: z.number().optional(),
          values: z
            .array(z.object({ timestamp: z.number(), value: z.number() }))
            .optional(),
          unit: z.string(),
        }),
      ),
      error: z.string().optional(),
    }),
    execute: async ({ query, time, range }) => {
      try {
        const base = endpoint.endsWith("/") ? endpoint.slice(0, -1) : endpoint;
        const path = range
          ? PROMETHEUS_TOOL.API_PATH.QUERY_RANGE
          : PROMETHEUS_TOOL.API_PATH.QUERY;
        const url = new URL(`${base}${path}`);
        url.searchParams.set("query", query);
        if (range) {
          url.searchParams.set("start", isoOrUnix(range.start));
          url.searchParams.set("end", isoOrUnix(range.end));
          url.searchParams.set("step", range.step ?? PROMETHEUS_TOOL.DEFAULT_STEP);
        } else if (time) {
          url.searchParams.set("time", isoOrUnix(time));
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        let response: Response;
        try {
          response = await fetchImpl(url.toString(), {
            method: "GET",
            signal: controller.signal,
            headers: { Accept: "application/json" },
          });
        } finally {
          clearTimeout(timer);
        }

        if (!response.ok) {
          const text = await response.text().catch(() => "");
          return {
            status: "error" as const,
            results: [],
            error: `${PROMETHEUS_TOOL.ERROR.FETCH_FAILED}: HTTP ${response.status} ${text}`.trim(),
          };
        }

        const body = (await response.json()) as PrometheusResponse;
        if (body.status !== "success" || !body.data) {
          return {
            status: "error" as const,
            results: [],
            error: `${PROMETHEUS_TOOL.ERROR.PROMETHEUS_ERROR}: ${body.errorType ?? "unknown"} ${body.error ?? ""}`.trim(),
          };
        }

        const { resultType, result } = body.data;
        if (resultType === "vector" && Array.isArray(result)) {
          return {
            status: "success" as const,
            results: (result as PrometheusVectorResult[]).map((series) => {
              const metricName = series.metric.__name__;
              const [ts, val] = series.value ?? [0, "0"];
              return {
                metric: series.metric,
                timestamp: ts,
                value: Number(val),
                unit: inferUnit(metricName),
              };
            }),
          };
        }

        if (resultType === "matrix" && Array.isArray(result)) {
          return {
            status: "success" as const,
            results: (result as PrometheusVectorResult[]).map((series) => {
              const metricName = series.metric.__name__;
              return {
                metric: series.metric,
                values: (series.values ?? []).map(([ts, val]) => ({
                  timestamp: ts,
                  value: Number(val),
                })),
                unit: inferUnit(metricName),
              };
            }),
          };
        }

        if (resultType === "scalar" || resultType === "string") {
          const tuple = result as [number, string];
          const [ts, val] = tuple;
          return {
            status: "success" as const,
            results: [
              {
                metric: {},
                timestamp: ts,
                value: Number(val),
                unit: PROMETHEUS_TOOL.UNIT.UNKNOWN,
              },
            ],
          };
        }

        return {
          status: "success" as const,
          results: [],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        const code = /aborted/i.test(message)
          ? PROMETHEUS_TOOL.ERROR.FETCH_FAILED
          : PROMETHEUS_TOOL.ERROR.FETCH_FAILED;
        return {
          status: "error" as const,
          results: [],
          error: `${code}: ${message}`,
        };
      }
    },
  });
}
