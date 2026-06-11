import dotenv from "dotenv";
import { existsSync } from "node:fs";
import path from "node:path";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import { getRepoRoot, resolveFromRoot } from "./repo-root.js";

function collectEnvFiles(): string[] {
  const repoRoot = getRepoRoot();
  const files: string[] = [];
  let dir = process.cwd();

  while (true) {
    const envPath = path.join(dir, ".env");
    if (existsSync(envPath)) files.push(envPath);
    if (path.resolve(dir) === path.resolve(repoRoot)) break;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  // dotenv v17: 后面的文件覆盖前面的，反转使 root .env 在前（低优先），包级 .env 在后（高优先）
  return files.reverse();
}

dotenv.config({ override: true, path: collectEnvFiles() });

if (process.env.LOG_FILE_PATH) {
  process.env.LOG_FILE_PATH = resolveFromRoot(process.env.LOG_FILE_PATH);
}

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.url().default("redis://localhost:6379"),
    CORS_ORIGIN: z.url(),
    PORT: z.coerce.number().int().positive().default(8000),
    MODEL_PROVIDER: z.enum(["openai", "deepseek", "alibaba", "ollama", "mock"]).default("mock"),
    OLLAMA_MODEL: z
      .string()
      .default(process.env.OLLAMA_MODEL || "qwen2.5-coder:14b"),
    CLOUD_MODEL: z.string().default("gpt-4o"),
    DEEPSEEK_API_KEY: z.string().optional(),
    ALIBABA_API_KEY: z.string().optional(),
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
    PROMETHEUS_URL: z.url().default("http://localhost:9090"),
    LOKI_URL: z.url().default("http://localhost:3100"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
