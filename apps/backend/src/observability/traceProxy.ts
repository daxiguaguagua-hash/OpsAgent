import { env } from "@opsagent/env";
import type { Context } from "hono";
import {
  API_ERROR_CODE,
  API_MESSAGE,
  HTTP_STATUS,
} from "../http/constants";
import { TEMPO } from "./constants";

interface TraceProxy {
  fetchTrace(traceId: string): Promise<Response>;
}

function createTraceProxy(
  endpoint: string = env.TEMPO_ENDPOINT,
): TraceProxy {
  return {
    async fetchTrace(traceId: string) {
      const url = `${endpoint}${TEMPO.API_PATH}/${traceId}`;
      return fetch(url, {
        headers: { accept: TEMPO.ACCEPT_HEADER },
      });
    },
  };
}

function createTraceProxyHandler(proxy: TraceProxy = createTraceProxy()) {
  return async (c: Context) => {
    const traceId = c.req.param("traceId");

    if (!traceId) {
      c.set("errorCode", API_ERROR_CODE.TRACE_NOT_FOUND);
      return c.json(
        {
          error: {
            code: API_ERROR_CODE.TRACE_NOT_FOUND,
            message: API_MESSAGE.TRACE_NOT_FOUND,
          },
        },
        HTTP_STATUS.NOT_FOUND,
      );
    }

    let response: Response;
    try {
      response = await proxy.fetchTrace(traceId);
    } catch {
      c.set("errorCode", API_ERROR_CODE.TEMPO_UNAVAILABLE);
      return c.json(
        {
          error: {
            code: API_ERROR_CODE.TEMPO_UNAVAILABLE,
            message: API_MESSAGE.TEMPO_UNAVAILABLE,
          },
        },
        HTTP_STATUS.SERVICE_UNAVAILABLE,
      );
    }

    if (response.status === HTTP_STATUS.NOT_FOUND) {
      c.set("errorCode", API_ERROR_CODE.TRACE_NOT_FOUND);
      return c.json(
        {
          error: {
            code: API_ERROR_CODE.TRACE_NOT_FOUND,
            message: API_MESSAGE.TRACE_NOT_FOUND,
          },
        },
        HTTP_STATUS.NOT_FOUND,
      );
    }

    const body = await response.text();
    return c.body(body, response.status as 200, {
      "content-type": response.headers.get("content-type") ?? TEMPO.ACCEPT_HEADER,
    });
  };
}

export { createTraceProxy, createTraceProxyHandler };
export type { TraceProxy };
