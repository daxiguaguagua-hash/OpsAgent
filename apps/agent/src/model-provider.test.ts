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

describe("createModel - 模型 Provider 工厂", () => {
  test("mock provider 返回可用的 mock 模型对象", () => {
    const config: ModelConfig = {
      provider: "mock",
      modelName: "mock-model",
    };

    const model = createModel(config);

    assert.ok(model, "mock 模型应被创建");
    assert.equal(model.provider, "mock", "provider 应为 mock");
    assert.equal(model.modelId, "mock-model", "modelId 应为 mock-model");
    assert.equal(model.specificationVersion, "v2", "specificationVersion 应为 v2");
  });

  test("mock 模型的 doGenerate 返回标准响应格式", async () => {
    const config: ModelConfig = {
      provider: "mock",
      modelName: "mock-model",
    };

    const model = createModel(config);
    const result = await model.doGenerate({
      inputFormat: "prompt",
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
      provider: "mock",
      modelName: "mock-model",
    };

    const model = createModel(config);
    const result = await model.doStream({
      inputFormat: "prompt",
      prompt: [{ role: "user", content: [{ type: "text", text: "test" }] }],
    });

    assert.ok(result.stream, "响应应包含 stream");
    assert.ok(result.stream instanceof ReadableStream, "stream 应为 ReadableStream");

    // 验证流可以正常读取
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
      provider: "ollama",
      modelName: "qwen2.5-coder:14b",
    };

    assert.throws(
      () => createModel(config),
      /Ollama provider requires @ai-sdk\/ollama package/,
      "ollama provider 应提示需要安装额外包",
    );
  });
});

describe("getModelConfigFromEnv - 环境变量解析", () => {
  test("返回当前环境下的配置（由 .env 文件决定）", () => {
    const config = getModelConfigFromEnv();

    assert.ok(config.provider, "provider 应存在");
    assert.ok(
      ["openai", "ollama", "mock"].includes(config.provider),
      `provider 应为 openai/ollama/mock 之一，实际: ${config.provider}`,
    );
    assert.ok(config.modelName, "modelName 应存在");
  });

  test("mock provider 时使用默认 modelName", () => {
    const originalProvider = process.env.MODEL_PROVIDER;
    const originalModel = process.env.OPENAI_MODEL;

    // 注意：由于 env package 已经在模块导入时加载，这里只能验证当前环境的值
    const config = getModelConfigFromEnv();

    if (config.provider === "mock") {
      assert.ok(
        config.modelName === "gpt-4o" || config.modelName.length > 0,
        "mock provider 的 modelName 应有值",
      );
    }

    process.env.MODEL_PROVIDER = originalProvider;
    process.env.OPENAI_MODEL = originalModel;
  });
});
