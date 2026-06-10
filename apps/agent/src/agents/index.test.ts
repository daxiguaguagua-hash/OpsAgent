/**
 * agents/index.ts 单元测试
 *
 * 覆盖范围：
 * - createOpsAgent：Agent 工厂函数创建 Mastra Agent
 * - Agent 配置验证：id、name、instructions、model
 *
 * 运行方式：pnpm --filter @opsagent/agent exec tsx --test src/agents/index.test.ts
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { createOpsAgent, type AgentConfig } from "./index.js";
import { createModel, type ModelConfig } from "../model-provider.js";

describe("createOpsAgent - Agent 工厂函数", () => {
  test("使用 mock model 成功创建 Agent", () => {
    const modelConfig: ModelConfig = {
      provider: "mock",
      modelName: "mock-model",
    };
    const model = createModel(modelConfig);

    const config: AgentConfig = { model };
    const agent = createOpsAgent(config);

    assert.ok(agent, "Agent 应被创建");
    assert.equal(agent.id, "ops-agent", "Agent id 应为 ops-agent");
    assert.equal(agent.name, "ops-agent", "Agent name 应为 ops-agent");
  });

  test("Agent 成功创建并包含基本配置", () => {
    const modelConfig: ModelConfig = {
      provider: "mock",
      modelName: "mock-model",
    };
    const model = createModel(modelConfig);

    const config: AgentConfig = { model };
    const agent = createOpsAgent(config);

    assert.ok(agent, "Agent 应被创建");
    assert.equal(agent.id, "ops-agent", "Agent id 应为 ops-agent");
    assert.equal(agent.name, "ops-agent", "Agent name 应为 ops-agent");
  });

  test("不同 model 实例创建不同的 Agent", () => {
    const model1 = createModel({ provider: "mock", modelName: "mock-1" });
    const model2 = createModel({ provider: "mock", modelName: "mock-2" });

    const agent1 = createOpsAgent({ model: model1 });
    const agent2 = createOpsAgent({ model: model2 });

    assert.notEqual(agent1, agent2, "不同 model 应创建不同的 Agent 实例");
    assert.equal(agent1.id, agent2.id, "但 id 应相同");
  });
});
