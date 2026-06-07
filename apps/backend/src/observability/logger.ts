import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { Context, Next } from "hono";

import {
  LOG_LEVEL,
  OBSERVABILITY,
  TRACE_ID_PATTERN,
} from "./constants";

declare module "hono" {
  interface ContextVariableMap {
    traceId: string;
    errorCode?: string;
  }
}

interface LogEntry {
  timestamp: string;
  level: string;
  traceId: string;
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
  errorCode?: string;
}

type LogSink = (message: string) => void;

function generateTraceId(): string {
  return `${OBSERVABILITY.TRACE_ID_PREFIX}-${randomUUID()}`;
}

function resolveTraceId(candidate?: string): string {
  if (
    candidate
    && candidate.length <= OBSERVABILITY.TRACE_ID_MAX_LENGTH
    && TRACE_ID_PATTERN.test(candidate)
  ) {
    return candidate;
  }
  return generateTraceId();
}

function createStructuredLogger(sink: LogSink = console.log) {
  return async (c: Context, next: Next) => {
    const traceId = resolveTraceId(
      c.req.header(OBSERVABILITY.TRACE_ID_HEADER),
    );
    c.set("traceId", traceId);
    c.header(OBSERVABILITY.TRACE_ID_HEADER, traceId);

    const start = Date.now();
    await next();
    const durationMs = Date.now() - start;

    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: c.res.status >= 400 ? LOG_LEVEL.ERROR : LOG_LEVEL.INFO,
      traceId,
      method: c.req.method,
      route: c.req.path,
      statusCode: c.res.status,
      durationMs,
    };

    const errorCode = c.get("errorCode");
    if (errorCode) {
      logEntry.errorCode = errorCode;
    }

    sink(JSON.stringify(logEntry));
  };
}

function createFileLogSink(filePath: string): LogSink {
  mkdirSync(dirname(filePath), { recursive: true });
  return (message: string) => {
    appendFileSync(filePath, `${message}\n`);
  };
}

function createRuntimeLogSink(
  filePath?: string,
  consoleSink: LogSink = console.log,
  warningSink: LogSink = console.warn,
): LogSink {
  if (!filePath) {
    return consoleSink;
  }

  const fileSink = createFileLogSink(filePath);
  return (message: string) => {
    consoleSink(message);
    try {
      fileSink(message);
    } catch {
      warningSink(`Failed to write structured log to ${filePath}`);
    }
  };
}

export {
  createFileLogSink,
  createRuntimeLogSink,
  createStructuredLogger,
  generateTraceId,
  resolveTraceId,
};
export type { LogEntry, LogSink };
