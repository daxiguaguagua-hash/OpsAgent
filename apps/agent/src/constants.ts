export const MODEL_PROVIDER = {
  OPENAI: "openai",
  OLLAMA: "ollama",
  MOCK: "mock",
} as const;

export type ModelProvider = (typeof MODEL_PROVIDER)[keyof typeof MODEL_PROVIDER];
