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

// 根目录中的 .env 最先加载，包目录中的 .env 后加载，覆盖前者。确保每个包都能有自己的环境变量，同时又能共享根目录的变量。
dotenv.config({ override: true, path: collectEnvFiles() });

// 这是一个临时的目录，最终会上传到docker中或者云端。
if (process.env.LOG_FILE_PATH) {
  process.env.LOG_FILE_PATH = resolveFromRoot(process.env.LOG_FILE_PATH);
}

/**
 * env 包的统一范围（当前）：
 *   - 中央 schema（本文件）：跨包复用的 server 端变量
 *   - client schema（web.ts）：前端 VITE_* 变量
 *
 * 包专属变量约定：
 *   - 用包名短形式作前缀（WG_* / AGENT_* / BACKEND_* / FRONTEND_*）
 *   - 详见 AGENTS.md §环境变量命名约定
 *
 * 已知未解决的架构张力：
 *   - 中央 schema 在 monorepo 规模扩张时会遇到天花板
 *   - 包专属变量（如 WG_ALLOW_DESTRUCTIVE）塞进中央 schema 会让 schema 膨胀
 *   - 演进策略（命名约定 → 注册表测试 → per-package schema 聚合）详见：
 *     docs/lessons/2026-06-15-monorepo-env-governance.md
 *
 * 关联 ADR：[[0001-env-layer-design|ADR-0001]]（env 做唯一数据源）
 */
export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.url().default("redis://localhost:6379"),
    CORS_ORIGIN: z.url(),
    PORT: z.coerce.number().int().positive().default(8000),
    MODEL_PROVIDER: z
      .enum(["openai", "deepseek", "alibaba", "ollama", "mock"])
      .default("mock"),
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
    // Sentry Source Map 上传（M4 Phase B / ADR-0006）
    // 三个字段均为 optional：本地开发未配置时 vite build 静默跳过上传；CI 环境由 CI 层做必填校验
    SENTRY_AUTH_TOKEN: z.string().min(1).optional(),
    SENTRY_ORG: z.string().min(1).optional(),
    SENTRY_PROJECT: z.string().min(1).optional(),
    SENTRY_API_ENDPOINT: z.string().min(1).optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
