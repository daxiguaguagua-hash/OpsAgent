/**
 * model-provider.ts 单元测试
 *
 * 覆盖范围：
 * - createModel：openai/mock provider 创建
 * - getModelConfigFromEnv：环境变量解析和默认值
 * - Mock model：doGenerate 和 doStream 接口
 *
 * 运行方式：pnpm --filter @opsagent/agent exec tsx --test src/model-provider.test.ts
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { createModel, getModelConfigFromEnv, type ModelConfig } from "./model-provider.js";
import { MODEL_PROVIDER } from "./constants.js";
import { env } from "@opsagent/env";

describe("createModel - 模型 Provider 工厂", () => {
  test("mock provider 返回可用的 mock 模型对象", () => {
    const config: ModelConfig = {
      provider: MODEL_PROVIDER.MOCK,
      modelName: "mock-model",
    };

    const model = createModel(config);

    assert.ok(model, "mock 模型应被创建");
    assert.equal(model.provider, MODEL_PROVIDER.MOCK, "provider 应为 mock");
    assert.equal(model.modelId, "mock-model", "modelId 应为 mock-model");
    assert.equal(model.specificationVersion, "v2", "specificationVersion 应为 v2");
  });

  test("mock 模型的 doGenerate 返回标准响应格式", async () => {
    const config: ModelConfig = {
      provider: MODEL_PROVIDER.MOCK,
      modelName: "mock-model",
    };

    const model = createModel(config);
    const result = await model.doGenerate({
      prompt: [{ role: "user", content: [{ type: "text", text: "test" }] }],
    });

    assert.ok(result.content, "响应应包含 content");
    assert.ok(Array.isArray(result.content), "content 应为数组");
    assert.equal(result.finishReason, "stop", "finishReason 应为 stop");
    assert.equal(result.usage.promptTokens, 0, "promptTokens 应为 0");
    assert.equal(result.usage.completionTokens, 0, "completionTokens 应为 0");
  });

  test("mock 模型的 doStream 返回可读流", async () => {
    const config: ModelConfig = {
      provider: MODEL_PROVIDER.MOCK,
      modelName: "mock-model",
    };

    const model = createModel(config);
    const result = await model.doStream({
      prompt: [{ role: "user", content: [{ type: "text", text: "test" }] }],
    });

    assert.ok(result.stream, "响应应包含 stream");
    assert.ok(result.stream instanceof ReadableStream, "stream 应为 ReadableStream");

    const reader = result.stream.getReader();
    const { value, done } = await reader.read();
    assert.ok(!done, "流应有数据");
    assert.equal(value?.type, "text-delta", "第一个 chunk 应为 text-delta");
    await reader.cancel();
  });

  test("unknown provider 抛出错误", () => {
    const config: ModelConfig = {
      provider: "unknown" as any,
      modelName: "test",
    };

    assert.throws(
      () => createModel(config),
      /Unknown model provider: unknown/,
      "未知 provider 应抛出错误",
    );
  });

  test("ollama provider 抛出未实现错误", () => {
    const config: ModelConfig = {
      provider: MODEL_PROVIDER.OLLAMA,
      modelName: env.OLLAMA_MODEL,
    };

    assert.throws(
      () => createModel(config),
      /Ollama provider requires @ai-sdk\/ollama package/,
      "ollama provider 应提示需要安装额外包",
    );
  });

  test("deepseek provider 返回 openai 兼容模型（使用自定义 baseURL）", () => {
    const config: ModelConfig = {
      provider: MODEL_PROVIDER.DEEPSEEK,
      modelName: "",
    };

    const model = createModel(config);

    assert.ok(model, "deepseek 模型应被创建");
    assert.equal(model.modelId, "deepseek-chat", "默认 modelId 应为 deepseek-chat");
  });

  test("deepseek provider 支持自定义 modelName", () => {
    const config: ModelConfig = {
      provider: MODEL_PROVIDER.DEEPSEEK,
      modelName: "deepseek-reasoner",
    };

    const model = createModel(config);

    assert.ok(model, "deepseek 模型应被创建");
    assert.equal(model.modelId, "deepseek-reasoner", "modelId 应为自定义值 deepseek-reasoner");
  });

  test("alibaba provider 返回通义千问模型（默认 qwen-max）", () => {
    const config: ModelConfig = {
      provider: MODEL_PROVIDER.ALIBABA,
      modelName: "",
    };

    const model = createModel(config);

    assert.ok(model, "alibaba 模型应被创建");
    assert.equal(model.modelId, "qwen-max", "默认 modelId 应为 qwen-max");
  });

  test("alibaba provider 支持自定义 modelName", () => {
    const config: ModelConfig = {
      provider: MODEL_PROVIDER.ALIBABA,
      modelName: "qwen-plus",
    };

    const model = createModel(config);

    assert.ok(model, "alibaba 模型应被创建");
    assert.equal(model.modelId, "qwen-plus", "modelId 应为自定义值 qwen-plus");
  });
});

describe("getModelConfigFromEnv - 环境变量解析", () => {
  test("返回当前环境下的配置（由 .env 文件决定）", () => {
    const config = getModelConfigFromEnv();

    assert.ok(config.provider, "provider 应存在");
    assert.ok(
      Object.values(MODEL_PROVIDER).includes(config.provider),
      `provider 应为 openai/deepseek/alibaba/ollama/mock 之一，实际: ${config.provider}`,
    );
    assert.ok(
      typeof config.modelName === "string",
      "modelName 应为字符串",
    );
  });

  test("mock provider 时使用默认 modelName", () => {
    const originalProvider = process.env.MODEL_PROVIDER;
    const originalModel = process.env.CLOUD_MODEL;

    const config = getModelConfigFromEnv();

    if (config.provider === MODEL_PROVIDER.MOCK) {
      assert.ok(
        config.modelName.length > 0,
        "mock provider 的 modelName 应有值（由 env.CLOUD_MODEL 提供默认值）",
      );
    }

    process.env.MODEL_PROVIDER = originalProvider;
    process.env.CLOUD_MODEL = originalModel;
  });
});
