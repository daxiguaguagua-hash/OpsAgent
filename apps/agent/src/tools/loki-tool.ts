import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { LOKI_TOOL } from "./constants.js";

export interface LokiDeps {
  endpoint?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  now?: () => number;
}

interface LokiStreamResult {
  stream: Record<string, string>;
  values: Array<[string, string]>;
}

interface LokiResponse {
  status: string;
  data?: {
    resultType: "streams" | "vector" | "matrix";
    result: LokiStreamResult[];
  };
  message?: string;
}

function toUnixNano(value: string | undefined, fallbackMs: number): string {
  if (!value || value.length === 0) {
    return String(BigInt(fallbackMs) * 1_000_000n);
  }
  if (/^\d+$/.test(value)) {
    if (value.length >= 18) return value;
    if (value.length >= 13) return String(BigInt(value) * 1_000_000n);
    return String(BigInt(value) * 1_000_000_000n);
  }
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return value;
  return String(BigInt(ms) * 1_000_000n);
}

function nanoToIso(nano: string): string {
  const ms = Number(BigInt(nano) / 1_000_000n);
  return new Date(ms).toISOString();
}

function defaultEndpoint(): string {
  const raw = process.env.LOKI_URL?.trim();
  return raw && raw.length > 0 ? raw : LOKI_TOOL.DEFAULT_ENDPOINT;
}

export function createLokiTool(deps: LokiDeps = {}) {
  const endpoint = deps.endpoint ?? defaultEndpoint();
  const fetchImpl: typeof fetch = deps.fetch ?? globalThis.fetch;
  const timeoutMs = deps.timeoutMs ?? LOKI_TOOL.TIMEOUT_MS;
  const now = deps.now ?? (() => Date.now());

  return createTool({
    id: LOKI_TOOL.ID,
    description: LOKI_TOOL.DESCRIPTION,
    inputSchema: z.object({
      query: z.string().min(1).describe("LogQL 表达式，例如 {job=\"backend\"} | json | level=\"ERROR\""),
      start: z
        .string()
        .min(1)
        .optional()
        .describe("起始时间，ISO 8601 或 unix 秒/毫秒/纳秒，默认 1 小时前"),
      end: z
        .string()
        .min(1)
        .optional()
        .describe("结束时间，ISO 8601 或 unix 秒/毫秒/纳秒，默认当前"),
      limit: z
        .number()
        .int()
        .min(LOKI_TOOL.MIN_LIMIT)
        .max(LOKI_TOOL.MAX_LIMIT)
        .optional()
        .describe(`返回条数，默认 ${LOKI_TOOL.DEFAULT_LIMIT}，最大 ${LOKI_TOOL.MAX_LIMIT}`),
    }),
    outputSchema: z.object({
      status: z.enum(["success", "error"]),
      entries: z.array(
        z.object({
          timestamp: z.string(),
          line: z.string(),
          labels: z.record(z.string(), z.string()),
          detectedLevel: z.string().optional(),
        }),
      ),
      error: z.string().optional(),
    }),
    execute: async ({ query, start, end, limit }) => {
      try {
        const nowMs = now();
        const base = endpoint.endsWith("/") ? endpoint.slice(0, -1) : endpoint;
        const url = new URL(`${base}${LOKI_TOOL.API_PATH.QUERY_RANGE}`);
        url.searchParams.set("query", query);
        url.searchParams.set(
          "start",
          toUnixNano(start, nowMs - LOKI_TOOL.DEFAULT_LOOKBACK_SECONDS * 1000),
        );
        url.searchParams.set("end", toUnixNano(end, nowMs));
        url.searchParams.set(
          "limit",
          String(limit ?? LOKI_TOOL.DEFAULT_LIMIT),
        );

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
            entries: [],
            error: `${LOKI_TOOL.ERROR.FETCH_FAILED}: HTTP ${response.status} ${text}`.trim(),
          };
        }

        const body = (await response.json()) as LokiResponse;
        if (body.status !== "success" || !body.data) {
          return {
            status: "error" as const,
            entries: [],
            error: `${LOKI_TOOL.ERROR.LOKI_ERROR}: ${body.message ?? "unknown"}`,
          };
        }

        if (body.data.resultType !== "streams") {
          return {
            status: "success" as const,
            entries: [],
          };
        }

        const entries: Array<{
          timestamp: string;
          line: string;
          labels: Record<string, string>;
          detectedLevel?: string;
        }> = [];

        for (const stream of body.data.result) {
          const labels = { ...stream.stream };
          const detectedLevel =
            labels.detected_level ?? labels.level ?? labels.level_name;
          for (const [nano, line] of stream.values) {
            entries.push({
              timestamp: nanoToIso(nano),
              line,
              labels,
              detectedLevel,
            });
          }
        }

        entries.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));

        return {
          status: "success" as const,
          entries,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          status: "error" as const,
          entries: [],
          error: `${LOKI_TOOL.ERROR.FETCH_FAILED}: ${message}`,
        };
      }
    },
  });
}
