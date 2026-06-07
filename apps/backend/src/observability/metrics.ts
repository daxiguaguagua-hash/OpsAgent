import type { Context, Next } from "hono";
import { Counter, Histogram, Registry } from "prom-client";
import { PROMETHEUS } from "./constants";

export const METRICS_ROUTE = PROMETHEUS.ROUTE;

const registry = new Registry();
const metricLabelNames = [
  PROMETHEUS.LABEL.METHOD,
  PROMETHEUS.LABEL.ROUTE,
  PROMETHEUS.LABEL.STATUS_CODE,
];

export const httpRequestsTotal = new Counter({
  name: PROMETHEUS.METRIC_NAME.HTTP_REQUESTS_TOTAL,
  help: PROMETHEUS.METRIC_HELP.HTTP_REQUESTS_TOTAL,
  labelNames: metricLabelNames,
  registers: [registry],
});

export const httpRequestDurationSeconds = new Histogram({
  name: PROMETHEUS.METRIC_NAME.HTTP_REQUEST_DURATION_SECONDS,
  help: PROMETHEUS.METRIC_HELP.HTTP_REQUEST_DURATION_SECONDS,
  labelNames: metricLabelNames,
  registers: [registry],
});

export function createMetricsMiddleware() {
  return async (c: Context, next: Next) => {
    if (c.req.path === METRICS_ROUTE) {
      return next();
    }

    const start = process.hrtime.bigint();
    await next();
    const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;

    const labels = {
      [PROMETHEUS.LABEL.METHOD]: c.req.method,
      [PROMETHEUS.LABEL.ROUTE]: c.req.path,
      [PROMETHEUS.LABEL.STATUS_CODE]: String(c.res.status),
    };

    httpRequestsTotal.inc(labels);
    httpRequestDurationSeconds.observe(labels, durationSeconds);
  };
}

export async function getMetricsContent(): Promise<string> {
  return registry.metrics();
}
