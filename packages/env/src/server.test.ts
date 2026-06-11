import assert from "node:assert/strict";
import { describe, test } from "node:test";

// 导入 server.ts 会触发 dotenv.config（副作用：修改 process.env）
import { env } from "./server.ts";

// 这些变量必须出现在 .env 文件中（通过 dotenv.config 加载到 process.env）
// NODE_ENV 不在此列：它不在 .env 文件中，由 createEnv 的 default("development") 提供
const REQUIRED_ENV_KEYS = [
  "DATABASE_URL",
  "REDIS_URL",
  "CORS_ORIGIN",
  "PORT",
  "MODEL_PROVIDER",
  "OLLAMA_MODEL",
] as const;

describe("dotenv 加载（server.ts 导入时自动执行 dotenv.config）", () => {
  test("process.env 中应有从 .env 文件加载的必要变量", () => {
    for (const key of REQUIRED_ENV_KEYS) {
      assert.ok(
        process.env[key],
        `process.env.${key} 应为非空字符串，但得到: ${JSON.stringify(process.env[key])}`,
      );
    }
  });

  test("OTEL 相关变量应被加载", () => {
    assert.ok(process.env.OTEL_TRACES_ENABLED, "OTEL_TRACES_ENABLED 应存在");
    assert.ok(
      process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
      "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT 应存在",
    );
  });

  test("LOG_FILE_PATH 应被加载", () => {
    assert.ok(process.env.LOG_FILE_PATH, "LOG_FILE_PATH 应存在");
    assert.ok(
      process.env.LOG_FILE_PATH!.endsWith(".jsonl"),
      `LOG_FILE_PATH 应以 .jsonl 结尾，实际: ${process.env.LOG_FILE_PATH}`,
    );
    assert.ok(
      true,
      `LOG_FILE_PATH 存在且格式正确: ${process.env.LOG_FILE_PATH}`,
    ); // 仅验证存在和格式，不检查路径有效性
  });
});

describe("env 对象（createEnv 解析后的值）", () => {
  test("PORT 应为正整数", () => {
    assert.equal(typeof env.PORT, "number");
    assert.ok(
      env.PORT > 0 && env.PORT < 65536,
      `PORT 应在 1-65535，实际: ${env.PORT}`,
    );
    assert.ok(Number.isInteger(env.PORT), `PORT 应为整数，实际: ${env.PORT}`);
  });

  test("DATABASE_URL 应为 postgresql 连接字符串", () => {
    assert.ok(
      env.DATABASE_URL.startsWith("postgresql://"),
      `DATABASE_URL 应以 postgresql:// 开头，实际: ${env.DATABASE_URL}`,
    );
  });

  test("REDIS_URL 应为有效 URL", () => {
    assert.ok(
      env.REDIS_URL.startsWith("redis://"),
      `REDIS_URL 应以 redis:// 开头，实际: ${env.REDIS_URL}`,
    );
  });

  test("CORS_ORIGIN 应为 http URL", () => {
    assert.ok(
      env.CORS_ORIGIN.startsWith("http"),
      `CORS_ORIGIN 应以 http 开头，实际: ${env.CORS_ORIGIN}`,
    );
  });

  test("MODEL_PROVIDER 应为 openai | ollama | mock 之一", () => {
    assert.ok(
      ["openai", "ollama", "mock"].includes(env.MODEL_PROVIDER),
      `MODEL_PROVIDER 应为 openai|ollama|mock，实际: ${env.MODEL_PROVIDER}`,
    );
  });

  test("OTEL_TRACES_ENABLED 应为 boolean", () => {
    assert.equal(typeof env.OTEL_TRACES_ENABLED, "boolean");
  });

  test("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT 应为 http URL", () => {
    assert.ok(
      env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT.startsWith("http://"),
      `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT 应以 http:// 开头，实际: ${env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT}`,
    );
  });

  test("NODE_ENV 应为 development | production | test 之一", () => {
    assert.ok(
      ["development", "production", "test"].includes(env.NODE_ENV),
      `NODE_ENV 应为 development|production|test，实际: ${env.NODE_ENV}`,
    );
  });

  test("CLOUD_MODEL 应为非空字符串", () => {
    assert.equal(typeof env.CLOUD_MODEL, "string");
    assert.ok(
      env.CLOUD_MODEL.length > 0,
      "CLOUD_MODEL 应有非空默认值（env 是模型名的唯一数据源）",
    );
  });

  test("TEMPO_ENDPOINT 应为 http URL", () => {
    assert.ok(
      env.TEMPO_ENDPOINT.startsWith("http://"),
      `TEMPO_ENDPOINT 应以 http:// 开头，实际: ${env.TEMPO_ENDPOINT}`,
    );
  });
});

describe("schema 完整性护栏", () => {
  // 与 server.ts 中 createEnv({ server: {...} }) 的键保持同步
  const ALL_SCHEMA_KEYS = [
    "DATABASE_URL",
    "REDIS_URL",
    "CORS_ORIGIN",
    "PORT",
    "MODEL_PROVIDER",
    "OLLAMA_MODEL",
    "CLOUD_MODEL",
    "NODE_ENV",
    "LOG_FILE_PATH",
    "OTEL_TRACES_ENABLED",
    "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT",
    "TEMPO_ENDPOINT",
  ] as const;

  test("env 对象应包含 server.ts schema 中定义的所有字段", () => {
    for (const key of ALL_SCHEMA_KEYS) {
      assert.ok(
        key in env,
        `env.${key} 应在 env 对象中存在（可能缺少 schema 定义或未加载）`,
      );
    }
  });
});

describe("默认值", () => {
  test("PORT 默认 8000", () => {
    assert.equal(env.PORT, 8000);
  });

  test("MODEL_PROVIDER 默认 mock", () => {
    assert.equal(env.MODEL_PROVIDER, "mock");
  });

  test("CLOUD_MODEL 默认 gpt-4o", () => {
    assert.equal(env.CLOUD_MODEL, "gpt-4o");
  });

  test("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT 默认 localhost:4318", () => {
    assert.equal(
      env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
      "http://localhost:4318/v1/traces",
    );
  });
});
