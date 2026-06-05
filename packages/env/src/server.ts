import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    CORS_ORIGIN: z.url(),
    PORT: z.coerce.number().int().positive().default(8000),
    MODEL_PROVIDER: z.enum(["openai", "ollama", "mock"]).default("mock"),
    OLLAMA_MODEL: z.string().default("qwen2.5-coder:14b"),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
