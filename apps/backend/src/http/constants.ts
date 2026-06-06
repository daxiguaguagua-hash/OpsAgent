export const HTTP_ROUTE = {
  ROOT: "/",
  TRPC: "/trpc/*",
} as const;

export const HTTP_STATUS = {
  CREATED: 201,
  BAD_REQUEST: 400,
  INTERNAL_SERVER_ERROR: 500,
} as const;

export const SERVICE_STATUS = {
  OK: "ok",
  CONNECTED: "connected",
} as const;

export const API_ERROR_CODE = {
  INVALID_ORDER_INPUT: "INVALID_ORDER_INPUT",
  DEMO_FORCED_FAILURE: "DEMO_FORCED_FAILURE",
  INTERNAL_SERVER_ERROR: "INTERNAL_SERVER_ERROR",
} as const;

export const API_MESSAGE = {
  ROOT: "OpsAgent backend is running.",
  INVALID_ORDER_INPUT: "Order input is invalid.",
  DEMO_FORCED_FAILURE: "A controlled backend failure was triggered.",
  INTERNAL_SERVER_ERROR: "An unexpected server error occurred.",
} as const;
