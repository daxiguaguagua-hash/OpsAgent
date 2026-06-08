import {
  SpanKind,
  SpanStatusCode,
  trace,
  type Tracer,
} from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  BatchSpanProcessor,
  NodeTracerProvider,
} from "@opentelemetry/sdk-trace-node";
import {
  ATTR_HTTP_REQUEST_METHOD,
  ATTR_HTTP_RESPONSE_STATUS_CODE,
  ATTR_SERVICE_NAME,
  ATTR_URL_PATH,
} from "@opentelemetry/semantic-conventions";
import type { Context, Next } from "hono";

import { OPENTELEMETRY } from "./constants";

declare module "hono" {
  interface ContextVariableMap {
    traceId: string;
    errorCode?: string;
  }
}

interface TelemetryRuntime {
  shutdown(): Promise<void>;
}

function createTracingMiddleware(
  tracer: Tracer = trace.getTracer(OPENTELEMETRY.INSTRUMENTATION_NAME),
) {
  return async (c: Context, next: Next) => {
    return tracer.startActiveSpan(
      `${c.req.method} ${c.req.path}`,
      {
        kind: SpanKind.SERVER,
        attributes: {
          [ATTR_HTTP_REQUEST_METHOD]: c.req.method,
          [ATTR_URL_PATH]: c.req.path,
        },
      },
      async (span) => {
        const spanContext = span.spanContext();
        if (spanContext.traceId && !/^0+$/.test(spanContext.traceId)) {
          c.set("traceId", spanContext.traceId);
        }

        try {
          await next();
          span.setAttribute(ATTR_HTTP_RESPONSE_STATUS_CODE, c.res.status);

          const errorCode = c.get("errorCode");
          if (errorCode) {
            span.setAttribute(
              OPENTELEMETRY.SPAN_ATTRIBUTE.ERROR_CODE,
              errorCode,
            );
          }

          if (c.res.status >= 500) {
            span.setStatus({ code: SpanStatusCode.ERROR });
          }
        } catch (error) {
          span.recordException(
            error instanceof Error ? error : new Error(String(error)),
          );
          span.setStatus({ code: SpanStatusCode.ERROR });
          throw error;
        } finally {
          span.end();
        }
      },
    );
  };
}

function initializeTelemetry(
  endpoint: string,
  enabled = true,
): TelemetryRuntime {
  if (!enabled) {
    return {
      async shutdown() {},
    };
  }

  const exporter = new OTLPTraceExporter({ url: endpoint });
  const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: OPENTELEMETRY.SERVICE_NAME,
    }),
    spanProcessors: [new BatchSpanProcessor(exporter)],
  });
  provider.register();

  return {
    shutdown: () => provider.shutdown(),
  };
}

export { createTracingMiddleware, initializeTelemetry };
export type { TelemetryRuntime };
