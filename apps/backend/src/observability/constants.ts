import { OPS_HTTP_HEADER } from "@opsagent/shared";

export const OBSERVABILITY = {
  TRACE_ID_HEADER: OPS_HTTP_HEADER.TRACE_ID,
  TRACE_ID_PREFIX: "opsagent",
  TRACE_ID_MAX_LENGTH: 128,
} as const;

export const LOG_LEVEL = {
  INFO: "INFO",
  ERROR: "ERROR",
} as const;

export const TRACE_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;
