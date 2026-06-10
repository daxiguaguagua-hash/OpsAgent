import { Agent } from "@mastra/core/agent";

export interface AgentConfig {
  // Model will be typed from @ai-sdk providers (openai, ollama, etc.)
  model: any;
}

export function createOpsAgent(config: AgentConfig) {
  return new Agent({
    id: "ops-agent",
    name: "ops-agent",
    instructions: "You are an AI Ops agent that analyzes observability data and generates incident reports.",
    model: config.model,
  });
}
