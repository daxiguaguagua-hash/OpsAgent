export const OPS_API_ROUTE = {
  ORDERS: "/api/orders",
  ORDER_HEALTH: "/api/orders/health",
  DEMO_FAIL_500: "/api/demo/fail-500",
  DEMO_SLOW: "/api/demo/slow",
} as const;

export const OPS_HTTP_METHOD = {
  GET: "GET",
  POST: "POST",
  OPTIONS: "OPTIONS",
} as const;

export const OPS_HTTP_HEADER = {
  CONTENT_TYPE: "content-type",
  APPLICATION_JSON: "application/json",
  TRACE_ID: "x-trace-id",
} as const;

export const OPS_SERVICE_STATUS = {
  OK: "ok",
  CONNECTED: "connected",
  COMPLETED: "completed",
} as const;

export interface OrderDto {
  id: number;
  reference: string;
  customerName: string;
  status: string;
  totalCents: number;
  createdAt: string;
  updatedAt: string;
}

export interface OrderHealthDto {
  status: typeof OPS_SERVICE_STATUS.OK;
  services: {
    database: typeof OPS_SERVICE_STATUS.CONNECTED;
    cache: typeof OPS_SERVICE_STATUS.CONNECTED;
  };
  orderCount: number;
}

export interface SlowDemoDto {
  status: typeof OPS_SERVICE_STATUS.COMPLETED;
  configuredDelayMs: number;
  thresholdMs: number;
}

export interface ApiErrorDto {
  error: {
    code: string;
    message: string;
  };
}
