import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { TRACE_TOOL, type TraceSpanStatus } from "./constants.js";

export interface TraceDeps {
  endpoint?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

interface TempoAttr {
  key: string;
  value: {
    stringValue?: string;
    intValue?: string | number;
    boolValue?: boolean;
  };
}

interface TempoSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind?: string;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes?: TempoAttr[];
  status?: { code?: string; message?: string };
}

interface TempoBatch {
  resource?: { attributes?: TempoAttr[] };
  scopeSpans?: Array<{
    scope?: { name?: string };
    spans: TempoSpan[];
  }>;
}

interface TempoResponse {
  batches?: TempoBatch[];
}

function base64UrlToHex(b64: string): string {
  try {
    const padded = b64.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(padded);
    let hex = "";
    for (let i = 0; i < bin.length; i++) {
      hex += bin.charCodeAt(i).toString(16).padStart(2, "0");
    }
    return hex;
  } catch {
    return b64;
  }
}

function getStringAttr(attrs: TempoAttr[] | undefined, key: string): string | undefined {
  const found = attrs?.find((a) => a.key === key);
  return found?.value?.stringValue;
}

function mapStatus(code: string | undefined): TraceSpanStatus {
  if (!code) return TRACE_TOOL.STATUS.UNSET;
  if (code === "STATUS_CODE_OK" || code === "OK") return TRACE_TOOL.STATUS.OK;
  if (code === "STATUS_CODE_ERROR" || code === "ERROR") return TRACE_TOOL.STATUS.ERROR;
  return TRACE_TOOL.STATUS.UNSET;
}

function durationMs(startNano: string, endNano: string): number {
  const start = BigInt(startNano || "0");
  const end = BigInt(endNano || "0");
  const diff = end - start;
  return Number(diff / 1_000_000n);
}

function defaultEndpoint(): string {
  const raw = process.env.TEMPO_ENDPOINT?.trim();
  return raw && raw.length > 0 ? raw : TRACE_TOOL.DEFAULT_ENDPOINT;
}

export function createTraceTool(deps: TraceDeps = {}) {
  const endpoint = deps.endpoint ?? defaultEndpoint();
  const fetchImpl: typeof fetch = deps.fetch ?? globalThis.fetch;
  const timeoutMs = deps.timeoutMs ?? TRACE_TOOL.TIMEOUT_MS;

  return createTool({
    id: TRACE_TOOL.ID,
    description: TRACE_TOOL.DESCRIPTION,
    inputSchema: z.object({
      traceId: z
        .string()
        .min(1)
        .describe("Trace identifier (hex, base64, or opsagent-prefixed)"),
      includeSpans: z
        .boolean()
        .optional()
        .describe("是否返回原始 span 列表，默认 true"),
    }),
    outputSchema: z.object({
      status: z.enum(["success", "error"]),
      traceId: z.string(),
      rootService: z.string().optional(),
      durationMs: z.number().optional(),
      spans: z.array(
        z.object({
          spanId: z.string(),
          parentSpanId: z.string().optional(),
          operationName: z.string(),
          serviceName: z.string(),
          durationMs: z.number(),
          status: z.string(),
          attributes: z.record(z.string(), z.string()),
        }),
      ),
      error: z.string().optional(),
    }),
    execute: async ({ traceId, includeSpans }) => {
      const wantSpans = includeSpans !== false;
      if (!TRACE_TOOL.TRACE_ID_PATTERN.test(traceId)) {
        return {
          status: "error" as const,
          traceId,
          spans: [],
          error: `${TRACE_TOOL.ERROR.INVALID_TRACE_ID}: "${traceId}"`,
        };
      }

      try {
        const base = endpoint.endsWith("/") ? endpoint.slice(0, -1) : endpoint;
        const url = new URL(`${base}${TRACE_TOOL.API_PATH}/${encodeURIComponent(traceId)}`);

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

        if (response.status === 404) {
          return {
            status: "error" as const,
            traceId,
            spans: [],
            error: `${TRACE_TOOL.ERROR.TRACE_NOT_FOUND}: ${traceId}`,
          };
        }

        if (!response.ok) {
          const text = await response.text().catch(() => "");
          return {
            status: "error" as const,
            traceId,
            spans: [],
            error: `${TRACE_TOOL.ERROR.FETCH_FAILED}: HTTP ${response.status} ${text}`.trim(),
          };
        }

        const body = (await response.json()) as TempoResponse;
        if (!body.batches || !Array.isArray(body.batches)) {
          return {
            status: "success" as const,
            traceId,
            spans: [],
          };
        }

        const flat: Array<{
          spanId: string;
          parentSpanId?: string;
          operationName: string;
          serviceName: string;
          durationMs: number;
          status: TraceSpanStatus;
          attributes: Record<string, string>;
          startNano: string;
        }> = [];

        let rootService: string | undefined;
        let maxDurationMs = 0;

        for (const batch of body.batches) {
          const serviceName =
            getStringAttr(batch.resource?.attributes, "service.name") ??
            "unknown";
          if (!rootService) rootService = serviceName;
          for (const scope of batch.scopeSpans ?? []) {
            for (const span of scope.spans) {
              const spanDurationMs = durationMs(
                span.startTimeUnixNano,
                span.endTimeUnixNano,
              );
              if (spanDurationMs > maxDurationMs) maxDurationMs = spanDurationMs;
              const attrs: Record<string, string> = {};
              for (const a of span.attributes ?? []) {
                const v = a.value;
                const str =
                  v.stringValue ??
                  (v.intValue !== undefined ? String(v.intValue) : "") ??
                  (v.boolValue !== undefined ? String(v.boolValue) : "");
                if (str) attrs[a.key] = str;
              }
              flat.push({
                spanId: base64UrlToHex(span.spanId),
                parentSpanId: span.parentSpanId
                  ? base64UrlToHex(span.parentSpanId)
                  : undefined,
                operationName: span.name,
                serviceName,
                durationMs: spanDurationMs,
                status: mapStatus(span.status?.code),
                attributes: attrs,
                startNano: span.startTimeUnixNano,
              });
            }
          }
        }

        const spans = wantSpans
          ? flat.map(
              ({
                spanId,
                parentSpanId,
                operationName,
                serviceName,
                durationMs,
                status,
                attributes,
              }) => ({
                spanId,
                parentSpanId,
                operationName,
                serviceName,
                durationMs,
                status,
                attributes,
              }),
            )
          : [];

        return {
          status: "success" as const,
          traceId,
          rootService,
          durationMs: maxDurationMs,
          spans,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          status: "error" as const,
          traceId,
          spans: [],
          error: `${TRACE_TOOL.ERROR.FETCH_FAILED}: ${message}`,
        };
      }
    },
  });
}
