export const DATABASE_TABLE = {
  ORDERS: "orders",
} as const;

export const ORDER_STATUS = {
  PENDING: "pending",
  PROCESSING: "processing",
  COMPLETED: "completed",
  FAILED: "failed",
} as const;

export const ORDER_STATUS_VALUES = [
  ORDER_STATUS.PENDING,
  ORDER_STATUS.PROCESSING,
  ORDER_STATUS.COMPLETED,
  ORDER_STATUS.FAILED,
] as const;

export const DATABASE_VERIFICATION = {
  REFERENCE_PREFIX: "db-verify",
  CUSTOMER_NAME: "Database Verification",
  TOTAL_CENTS: 100,
} as const;
