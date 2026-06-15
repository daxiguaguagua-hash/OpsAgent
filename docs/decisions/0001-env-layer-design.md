# ADR-0001: 环境变量默认值由 `@opsagent/env` 单一持有

- **日期**：2026-06-10
- **状态**：`accepted`
- **决策者**：项目维护者 + AI agent
- **关联**：
  - [[AGENTS|AGENTS.md]]：§禁止领域字符串硬编码
  - [[0000-adopt-adr|ADR-0000]]：知识库结构

## Context

配置默认值曾经散落在两个包里，同一个值写两份：

| 值 | `packages/env/server.ts` | `apps/agent/constants.ts` |
|---|---|---|
| `"gpt-4o"` | `CLOUD_MODEL` 默认 `""` | `DEFAULT_MODEL_NAME.OPENAI` |
| `"qwen2.5-coder:14b"` | `OLLAMA_MODEL` 默认值 | `DEFAULT_MODEL_NAME.OLLAMA` |
| `"mock"` | `MODEL_PROVIDER` 默认值 | `MODEL_PROVIDER.MOCK` |

`packages/env` 是下层包（定义 zod schema），`apps/agent` 是上层包（业务逻辑）。上层无法把常量"喂回"给下层的 zod schema，导致同一个默认值各写各的。`"qwen2.5-coder:14b"` 是最典型的违规——改一处漏一处，违反 AGENTS.md 的"禁止领域字符串硬编码"原则。

## Decision

**env 做唯一数据源**。模型名是配置而非业务逻辑，env 的职责就是"定义配置的默认值"。

具体改动：

1. `packages/env/server.ts`：`CLOUD_MODEL` 的 `z.string().default("")` → `z.string().default("gpt-4o")`
2. `apps/agent/src/constants.ts`：删除 `DEFAULT_MODEL_NAME`，只保留 `MODEL_PROVIDER` 枚举
3. `apps/agent/src/model-provider.ts`：`DEFAULT_MODEL_NAME.OPENAI` → 直接用 `env.CLOUD_MODEL`
4. `apps/agent/src/model-provider.test.ts`：同步更新引用
5. `packages/env/src/server.test.ts`：更新 `ALL_SCHEMA_KEYS` 注释和 `CLOUD_MODEL` 测试断言

**未被采纳的方案**：

- **方案 B：shared 做唯一数据源**。在 `packages/shared` 建 `model-constants.ts`，env 和 agent 都从 shared 导入。放弃原因：env 的 zod schema 里 `z.string().default(...)` 需要一个字符串值，从 shared 导入后传给 zod 可行但绕了一圈；`z.enum(["openai", "ollama", "mock"])` 里的值也要从 shared 导入，zod enum 对数组类型有要求，增加复杂度。
- **方案 C：接受现状 + 测试护栏**。承认 env 和 agent 各管各的默认值，在测试中断言两者一致。放弃原因：治标不治本，值还是写了两份。

## Consequences

### 正面

- **单一数据源**：模型名在 env 里只定义一次，没有"改一处漏一处"的风险
- **职责清晰**：env 管配置，agent 管业务逻辑，符合"分层治理"原则
- **符合 AGENTS.md**：消除字符串硬编码，符合"禁止领域字符串硬编码"纪律

### 负面

- **env 包职责扩张**：env 不只定义 schema 形状，也开始定义业务相关的具体默认值（如 `"gpt-4o"`）
- **未来迁移成本**：如果后续需要把模型名做成动态配置（如从数据库读），env 的默认值机制需要重新设计

### 风险

- **z.enum() 和 as const 对象的张力未解决**：`z.enum(["openai", "ollama", "mock"])` 和 `MODEL_PROVIDER` 常量值重复，但 zod 的 `z.enum()` 要求字符串数组字面量，不能直接引用 TS 常量（除非用 `Object.values()` 转型）。这是 zod 和 TS 类型系统的天然张力，暂不处理，接受 enum 字面量和 `as const` 对象并存，详见 [[0003-zod-schema-governance|ADR-0003]]

## 反向引用

暂无
