import type {
  ApiErrorDto,
  OrderDto,
  OrderHealthDto,
  SlowDemoDto,
} from "@opsagent/shared";
import {
  OPS_API_ROUTE,
  OPS_HTTP_HEADER,
  OPS_HTTP_METHOD,
} from "@opsagent/shared";

type Fetcher = typeof fetch;

export class OpsApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(
  serverUrl: string,
  path: string,
  init: RequestInit,
  fetcher: Fetcher = fetch,
): Promise<T> {
  const response = await fetcher(`${serverUrl}${path}`, init);
  const body = await response.json() as T | ApiErrorDto;

  if (!response.ok) {
    const error = body as ApiErrorDto;
    throw new OpsApiError(
      response.status,
      error.error.code,
      error.error.message,
    );
  }

  return body as T;
}

export function getOrderHealth(serverUrl: string, fetcher?: Fetcher) {
  return request<OrderHealthDto>(
    serverUrl,
    OPS_API_ROUTE.ORDER_HEALTH,
    { method: OPS_HTTP_METHOD.GET },
    fetcher,
  );
}

export function createOrder(
  serverUrl: string,
  input: {
    customerName: string;
    totalCents: number;
  },
  fetcher?: Fetcher,
) {
  return request<{ order: OrderDto }>(
    serverUrl,
    OPS_API_ROUTE.ORDERS,
    {
      method: OPS_HTTP_METHOD.POST,
      headers: {
        [OPS_HTTP_HEADER.CONTENT_TYPE]: OPS_HTTP_HEADER.APPLICATION_JSON,
      },
      body: JSON.stringify(input),
    },
    fetcher,
  );
}

export function triggerBackendFailure(serverUrl: string, fetcher?: Fetcher) {
  return request<never>(
    serverUrl,
    OPS_API_ROUTE.DEMO_FAIL_500,
    { method: OPS_HTTP_METHOD.POST },
    fetcher,
  );
}

export function triggerSlowRequest(serverUrl: string, fetcher?: Fetcher) {
  return request<SlowDemoDto>(
    serverUrl,
    OPS_API_ROUTE.DEMO_SLOW,
    { method: OPS_HTTP_METHOD.GET },
    fetcher,
  );
}
