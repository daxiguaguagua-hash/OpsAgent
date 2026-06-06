export const ORDER_BUSINESS = {
  REFERENCE_PREFIX: "order",
  LIST_LIMIT: 20,
  CACHE_TTL_SECONDS: 30,
} as const;

export const DEMO_BUSINESS = {
  SLOW_DELAY_MS: 2500,
  SLOW_THRESHOLD_MS: 2000,
} as const;
