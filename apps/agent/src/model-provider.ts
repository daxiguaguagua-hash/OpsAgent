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

export function createModel(config: ModelConfig) {
  switch (config.provider) {
    case MODEL_PROVIDER.OPENAI:
      return openai(config.modelName || env.CLOUD_MODEL);
    case MODEL_PROVIDER.DEEPSEEK:
      return deepseek(config.modelName || "deepseek-chat");
    case MODEL_PROVIDER.ALIBABA:
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
