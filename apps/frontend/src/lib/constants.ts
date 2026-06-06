export const OPS_SCENARIO = {
  CREATE_ORDER: "create-order",
  FAIL_500: "fail-500",
  SLOW: "slow",
  FRONTEND_ERROR: "frontend-error",
} as const;

export type OpsScenario = typeof OPS_SCENARIO[keyof typeof OPS_SCENARIO];

export const EXECUTION_STATUS = {
  IDLE: "idle",
  RUNNING: "running",
  SUCCESS: "success",
  FAILURE: "failure",
} as const;

export type ExecutionStatus =
  typeof EXECUTION_STATUS[keyof typeof EXECUTION_STATUS];

export const UI_CONFIG = {
  MAX_EVENTS: 8,
  DEFAULT_ORDER_CUSTOMER: "Ops Demo",
  DEFAULT_ORDER_TOTAL_CENTS: 9900,
} as const;

export const FRONTEND_ERROR = {
  EVENT_TYPE: "error",
  CODE: "FRONTEND_DEMO_ERROR",
  MESSAGE: "A controlled frontend exception was triggered.",
} as const;
