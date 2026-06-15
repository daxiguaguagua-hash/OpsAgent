import { Agent } from "@mastra/core/agent";
import type { Tool } from "@mastra/core/tools";

export interface AgentConfig {
  model: any;
  tools?: Record<string, Tool>;
}

export function createOpsAgent(config: AgentConfig) {
  return new Agent({
    id: "ops-agent",
    name: "ops-agent",
    instructions:
      "You are an AI Ops agent that analyzes observability data and generates incident reports.",
    model: config.model,
    tools: config.tools,
  });
}
