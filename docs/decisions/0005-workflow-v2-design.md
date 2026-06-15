# ADR-0005: 测试策略师角色从 Codex 解耦到 claude-code-new-context

- **日期**：2026-06-08
- **状态**：`accepted`
- **决策者**：项目维护者 + AI agent
- **关联**：
  - [[0000-adopt-adr|ADR-0000]]：知识库结构
  - [[0004-hook-bootstrap-strategy|ADR-0004]]：工作流门禁设计

## Context

Codex 因额度限制暂时不可用。Codex 在当前系统中承担 `test-strategist` 角色（测试影响分析、用例设计、测试修改审批）。这不是"少了一个 CLI 工具"的问题——依赖分散在三层：

| 层 | 位置 | 耦合方式 |
|---|---|---|
| 角色-actor 映射 | `role-policy.json:18` | `"actor": "codex"` 写死 |
| 默认值 | `taskState.ts:56` | `rationale` 默认文本写死 "Pending Codex test impact analysis" |
| Hook 门禁 | `rolePolicy.ts:117-122` | `reviewedBy` 必须等于 `task.testStrategist`，consensus 必须 `approved`，错误消息写死 "Codex consensus" |

需要排查依赖链，评估 Codex 下线的真实影响，并给出解耦方案。

## Decision

### 关键发现

审计揭示了 4 个结构性事实：

1. **Codex 三层硬耦合**：替换 Codex 不能只改一个配置文件。但第三层（hook 门禁）最关键——它不关心 actor 是谁，只校验 `reviewedBy === task.testStrategist` 和 `consensus === "approved"`。**把 test-strategist 的 actor 从 `codex` 换成其他值，hook 不会报错**。
2. **消息总线与编排引擎不互通**：`messageBus.ts` 实现了完整的异步消息系统，但 `orchestration.ts` 完全不碰消息总线。编排引擎的输出是**给人看的 CLI 命令**（`pnpm task:handoff -- tester`），而不是通过消息总线自动发送。消息总线目前的作用等同于**结构化的审计日志**，而不是 Agent 间通信通道。
3. **actorRuntime 单后端**：`ActorAdapter` 类型定义为 `"claude-code" | "manual"`，但 `manual` 直接抛异常。无论 role-policy 里配置什么 actor，运行时都调 `claude` CLI。Codex 和 gpt5.5 标为 "Manual" 并不是因为它们有独立适配器，而是因为它们根本没有适配器——靠人在终端手动操作。**Codex 下线对系统自动化能力的影响是零**——它从来就没被自动化过。
4. **独立审查的价值不在工具而在角色**：`orchestration.ts` 为每个角色设计了不同的提示词（implementer / tester / test-strategist），确保**认知多样性**。即使三者跑在同一个模型上，不同的提示词和不同的会话上下文（tester 要求 freshSession + 禁用 Edit/Write）已经提供了实质性的独立视角。

### 决策

**把 test-strategist 的 actor 从 `codex` 换成 `claude-code-new-context`**（已存在于 actor-registry，freshSession + 受限权限）。这不是退化为"自己审自己"，而是在同一模型上通过**角色提示词隔离**和**会话上下文隔离**维持独立审查的有效性。

### 具体改动

**第一步（立即，5 分钟，零风险）**

修改三个文件：

1. `.agent/role-policy.json`：`"actor": "codex"` → `"actor": "claude-code-new-context"`
2. `packages/workflow-gates/src/taskState.ts:56`：默认文本 `"Pending Codex test impact analysis"` → `"Pending test-strategist impact analysis"`
3. `packages/workflow-gates/src/rolePolicy.ts:122`：错误消息中的 "Codex consensus" → "test-strategist consensus"

同步更新相关文档中的 Codex 引用。

**第二步（中期，需讨论优先级）**

让消息总线和编排引擎真正互通：

- `orchestration.ts` 的 `buildExecutionBrief` 在生成指令时，自动通过消息总线发送 `task_assignment`
- `task:execute` 在实际调用模型前，读取当前 actor 的未读消息并注入 prompt
- 这是 M0-16 issue 里已经设计好但未实现的能力

**第三步（远期，需讨论优先级）**

actorRuntime 支持 DeepSeek API 作为独立 adapter：

- 新增 `deepseek-api` adapter，通过 OpenAI 兼容接口调用
- test-strategist 可以跑在不同模型上，获得真正的模型多样性
- 成本极低（DeepSeek API 定价远低于 OpenAI）

## Consequences

### 正面

- **Codex 解耦**：test-strategist 角色不再依赖特定工具，可移植到其他模型/工具
- **独立审查保留**：freshSession + 受限权限 + 不同提示词维持了实质性独立视角
- **零风险改动**：第一步改动只涉及字符串替换，不影响 hook 逻辑

### 负面

- **模型多样性丢失**：test-strategist 和 implementer 都跑在 claude-code 上（虽然是不同 context），理论上不如"跑在不同模型上"的独立性
- **消息总线未启用**：第二步（编排引擎 ↔ 消息总线互通）是更大的架构改造，暂未执行

### 风险

- **架构方向变更**：2026-06-09 项目架构方向转向 V3（放弃 v2 自研，收敛到 OpenHands + Mastra 三层架构）。本 ADR 的"第二步"和"第三步"在 V3 中可能需要重新评估
- **纪律成本**：开发者需要理解"角色 = 提示词 + 会话上下文"的隔离机制，避免误以为"actor 是 claude-code 就等同于自己审自己"

## 反向引用

暂无
