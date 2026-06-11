import dotenv from "dotenv";
import path from "node:path";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import { getRepoRoot, resolveFromRoot } from "./repo-root.js";

// 环境变量继承：CWD .env 优先，根 .env 补充未设的变量
// dotenv path 数组默认行为：第一个文件的值优先
const repoRoot = getRepoRoot();
dotenv.config({
  path: [
    path.resolve(".env"), // ① CWD 包级 .env（最高优先）
    path.join(repoRoot, ".env"), // ② 根 .env（补充）
    path.join(repoRoot, ".env.example"), // ③ 根 .env.example（最后兜底）
  ],
});

// 相对路径 → 基于 repo root 的绝对路径，避免 CWD 不同导致写错文件
if (process.env.LOG_FILE_PATH) {
  process.env.LOG_FILE_PATH = resolveFromRoot(process.env.LOG_FILE_PATH);
}

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.url().default("redis://localhost:6379"),
    CORS_ORIGIN: z.url(),
    PORT: z.coerce.number().int().positive().default(8000),
    MODEL_PROVIDER: z.enum(["openai", "ollama", "mock"]).default("mock"),
    OLLAMA_MODEL: z
      .string()
      .default(process.env.OLLAMA_MODEL || "qwen2.5-coder:14b"),
    CLOUD_MODEL: z.string().default("gpt-4o"),
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    LOG_FILE_PATH: z.string().min(1).optional(),
    OTEL_TRACES_ENABLED: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .default(true),
    OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: z
      .url()
      .default("http://localhost:4318/v1/traces"),
    TEMPO_ENDPOINT: z.url().default("http://localhost:3200"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
