import { trpcServer } from "@hono/trpc-server";
import { createContext } from "@opsagent/api/context";
import { appRouter } from "@opsagent/api/routers/index";
import { env } from "@opsagent/env";
import {
  OPS_API_ROUTE,
  OPS_HTTP_METHOD,
  OPS_SERVICE_STATUS,
} from "@opsagent/shared";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Tracer } from "@opentelemetry/api";
import { PROMETHEUS } from "./observability/constants";
import { createStructuredLogger } from "./observability/logger";
import type { LogSink } from "./observability/logger";
import {
  createMetricsMiddleware,
  getMetricsContent,
  METRICS_ROUTE,
} from "./observability/metrics";
import { createTracingMiddleware } from "./observability/tracing";
import {
  createTraceProxy,
  createTraceProxyHandler,
} from "./observability/traceProxy";
import type { TraceProxy } from "./observability/traceProxy";

import {
  createOrderInputSchema,
  type OrderService,
  orderService,
} from "./business/orders";
import { DEMO_BUSINESS } from "./business/constants";
import {
  demoService,
  type DemoService,
} from "./business/demo";
import {
  createDefaultAnalysisService,
  type AnalysisResponse,
} from "./business/analysis";
import {
  API_ERROR_CODE,
  API_MESSAGE,
  HTTP_ROUTE,
  HTTP_STATUS,
} from "./http/constants";
import { DemoForcedFailureError } from "./http/errors";

export interface AnalysisService {
  generate(): Promise<AnalysisResponse>;
}

export function createApp(
  orders: OrderService = orderService,
  demo: DemoService = demoService,
  logSink: LogSink = console.log,
  tracer?: Tracer,
  traceProxy: TraceProxy = createTraceProxy(),
  analysis: AnalysisService = createDefaultAnalysisService(),
) {
  const app = new Hono();

  app.use(createTracingMiddleware(tracer));
  app.use(createStructuredLogger(logSink));
  app.use(createMetricsMiddleware());
  app.use(
    "/*",
    cors({
      origin: env.CORS_ORIGIN,
      allowMethods: [
        OPS_HTTP_METHOD.GET,
        OPS_HTTP_METHOD.POST,
        OPS_HTTP_METHOD.OPTIONS,
      ],
    }),
  );

  app.use(
    HTTP_ROUTE.TRPC,
    trpcServer({
      router: appRouter,
      createContext: (_opts, context) => createContext({ context }),
    }),
  );

  app.get(HTTP_ROUTE.ROOT, (context) => {
    return context.text(API_MESSAGE.ROOT);
  });

  app.get(METRICS_ROUTE, async () => {
    const body = await getMetricsContent();
    return new Response(body, {
      headers: { "content-type": PROMETHEUS.CONTENT_TYPE },
    });
  });

  app.get(OPS_API_ROUTE.ORDER_HEALTH, async (context) => {
    return context.json(await orders.checkHealth());
  });

  app.get(OPS_API_ROUTE.ORDERS, async (context) => {
    return context.json({ orders: await orders.list() });
  });

  app.post(OPS_API_ROUTE.ORDERS, async (context) => {
    const input = createOrderInputSchema.safeParse(await context.req.json());

    if (!input.success) {
      context.set("errorCode", API_ERROR_CODE.INVALID_ORDER_INPUT);
      return context.json(
        {
          error: {
            code: API_ERROR_CODE.INVALID_ORDER_INPUT,
            message: API_MESSAGE.INVALID_ORDER_INPUT,
          },
        },
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    return context.json(
      { order: await orders.create(input.data) },
      HTTP_STATUS.CREATED,
    );
  });

  app.post(OPS_API_ROUTE.DEMO_FAIL_500, () => {
    throw new DemoForcedFailureError();
  });

  app.get(OPS_API_ROUTE.DEMO_SLOW, async (context) => {
    await demo.delay(DEMO_BUSINESS.SLOW_DELAY_MS);

    return context.json({
      status: OPS_SERVICE_STATUS.COMPLETED,
      configuredDelayMs: DEMO_BUSINESS.SLOW_DELAY_MS,
      thresholdMs: DEMO_BUSINESS.SLOW_THRESHOLD_MS,
    });
  });

  app.get(`${OPS_API_ROUTE.TRACES}/:traceId`, createTraceProxyHandler(traceProxy));

  app.post(HTTP_ROUTE.ANALYSIS, async (context) => {
    try {
      const result = await analysis.generate();
      return context.json(result, HTTP_STATUS.CREATED);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      context.set("errorCode", API_ERROR_CODE.ANALYSIS_FAILED);
      return context.json(
        {
          error: {
            code: API_ERROR_CODE.ANALYSIS_FAILED,
            message: `${API_MESSAGE.ANALYSIS_FAILED} (${message})`,
          },
        },
        HTTP_STATUS.SERVICE_UNAVAILABLE,
      );
    }
  });

  app.onError((error, context) => {
    if (error instanceof DemoForcedFailureError) {
      context.set("errorCode", error.code);
      return context.json(
        {
          error: {
            code: error.code,
            message: error.message,
          },
        },
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
      );
    }

    context.set("errorCode", API_ERROR_CODE.INTERNAL_SERVER_ERROR);
    return context.json(
      {
        error: {
          code: API_ERROR_CODE.INTERNAL_SERVER_ERROR,
          message: API_MESSAGE.INTERNAL_SERVER_ERROR,
        },
      },
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
    );
  });

  return app;
}
