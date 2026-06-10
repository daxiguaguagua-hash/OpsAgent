import { env } from "@opsagent/env/server";
import { openai } from "@ai-sdk/openai";

export type ModelProvider = "openai" | "ollama" | "mock";

export interface ModelConfig {
  provider: ModelProvider;
  modelName: string;
}

export function createModel(config: ModelConfig) {
  switch (config.provider) {
    case "openai":
      return openai(config.modelName || "gpt-4o");
    case "ollama":
      // TODO: Implement Ollama provider when needed
      throw new Error("Ollama provider requires @ai-sdk/ollama package");
    case "mock":
      return createMockModel();
    default:
      throw new Error(`Unknown model provider: ${config.provider}`);
  }
}

/**
 * Creates a mock language model for testing without API calls.
 * Returns fixed responses for agent analysis.
 */
function createMockModel() {
  return {
    specificationVersion: "v2" as const,
    provider: "mock",
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
  const provider = (env.MODEL_PROVIDER as ModelProvider) || "mock";
  const modelName = provider === "ollama" ? env.OLLAMA_MODEL : (env.OPENAI_MODEL || "gpt-4o");

  return {
    provider,
    modelName,
  };
}
