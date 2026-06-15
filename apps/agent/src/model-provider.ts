import { env } from "@opsagent/env";
import { openai } from "@ai-sdk/openai";
import { deepseek } from "@ai-sdk/deepseek";
import { alibaba } from "@ai-sdk/alibaba";
import {
  MODEL_PROVIDER,
  type ModelProvider,
} from "./constants.js";

export type { ModelProvider };

export interface ModelConfig {
  provider: ModelProvider;
  modelName: string;
}

/**
 * API Key 隐式约定（非显式传入）
 * ─────────────────────────────
 * 下列 SDK 默认实例在**发起请求时**自动从 process.env 读取对应密钥，
 * 无需手动传入 apiKey。packages/env 只做 env 完整性校验，不负责传递。
 *
 *   Provider SDK            自动读取的环境变量
 *   ──────────────────────  ─────────────────────────
 *   @ai-sdk/openai          OPENAI_API_KEY
 *   @ai-sdk/deepseek        DEEPSEEK_API_KEY
 *   @ai-sdk/alibaba         DASHSCOPE_API_KEY
 *
 * 【如何验证此机制是否仍然有效】
 *   Context7 查询：library = "/vercel/ai"
 *   查询语句：deepseek provider API key configuration how does it
 *             read DEEPSEEK_API_KEY from environment
 *   预期看到：createDeepSeek 内部调用 loadApiKey({ environmentVariableName: 'DEEPSEEK_API_KEY' })
 *
 * 最后验证时间：2026-06-11（若 SDK 升级，请重新查询确认）
 */
export function createModel(config: ModelConfig) {
  switch (config.provider) {
    case MODEL_PROVIDER.OPENAI:
      // OPENAI_API_KEY 由 @ai-sdk/openai 自动从 process.env 读取
      return openai(config.modelName || env.CLOUD_MODEL);
    case MODEL_PROVIDER.DEEPSEEK:
      // DEEPSEEK_API_KEY 由 @ai-sdk/deepseek 自动从 process.env 读取
      return deepseek(config.modelName || "deepseek-chat");
    case MODEL_PROVIDER.ALIBABA:
      // DASHSCOPE_API_KEY 由 @ai-sdk/alibaba 自动从 process.env 读取
      return alibaba(config.modelName || "qwen-max");
    case MODEL_PROVIDER.OLLAMA:
      throw new Error("Ollama provider requires @ai-sdk/ollama package");
    case MODEL_PROVIDER.MOCK:
      return createMockModel();
    default:
      throw new Error(`Unknown model provider: ${config.provider}`);
  }
}

function createMockModel() {
  return {
    specificationVersion: "v2" as const,
    provider: MODEL_PROVIDER.MOCK,
    modelId: "mock-model",
    supportsUrl: () => false,
    doGenerate: async () => ({
      content: [
        {
          type: "text" as const,
          text: "Mock incident analysis: System is healthy, no issues detected.",
        },
      ],
      finishReason: "stop" as const,
      usage: { promptTokens: 0, completionTokens: 0 },
      stream: undefined as any,
    }),
    doStream: async () => ({
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({
            type: "text-delta" as const,
            textDelta: "Mock streaming response",
          });
          controller.close();
        },
      }),
    }),
  };
}

export function getModelConfigFromEnv(): ModelConfig {
  const provider = (env.MODEL_PROVIDER as ModelProvider) || MODEL_PROVIDER.MOCK;
  const modelName =
    provider === MODEL_PROVIDER.OLLAMA
      ? env.OLLAMA_MODEL
      : provider === MODEL_PROVIDER.DEEPSEEK ||
          provider === MODEL_PROVIDER.ALIBABA
        ? ""
        : env.CLOUD_MODEL;

  return {
    provider,
    modelName,
  };
}
