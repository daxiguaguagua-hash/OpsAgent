# 环境变量默认值归属问题

日期：2026-06-10

## 问题

配置默认值散落在两个包中，同一个值写了两份：

| 值 | `packages/env/server.ts` | `apps/agent/constants.ts` |
|---|---|---|
| `"gpt-4o"` | 无（`CLOUD_MODEL` 默认 `""`） | `DEFAULT_MODEL_NAME.OPENAI` |
| `"qwen2.5-coder:14b"` | `OLLAMA_MODEL` 默认值 | `DEFAULT_MODEL_NAME.OLLAMA` |
| `"mock"` | `MODEL_PROVIDER` 默认值 | `MODEL_PROVIDER.MOCK` |

`packages/env` 是下层包，`apps/agent` 是上层包。上层无法把常量"喂回"给下层的 zod schema，导致同一个默认值各写各的。`"qwen2.5-coder:14b"` 是最典型的违规——改一处漏一处。

## 方案对比

### A. env 做唯一数据源（选定）

把默认模型名的定义权交给 env：
- `CLOUD_MODEL` 的 default 从 `""` 改为 `"gpt-4o"`
- `OLLAMA_MODEL` 已有 default `"qwen2.5-coder:14b"`，保持不变

agent 的 `getModelConfigFromEnv` 直接读 `env.CLOUD_MODEL` 和 `env.OLLAMA_MODEL`，不再需要自己的 fallback。`DEFAULT_MODEL_NAME` 常量删除。

理由：env 的职责就是"定义配置的默认值"，模型名是配置而非业务逻辑。

### B. shared 做唯一数据源（放弃）

在 `packages/shared` 建 `model-constants.ts`，env 和 agent 都从 shared 导入。

放弃原因：env 的 zod schema 里 `z.string().default(...)` 需要一个字符串值，从 shared 导入后传给 zod 可行但绕了一圈。`z.enum(["openai", "ollama", "mock"])` 里的值也要从 shared 导入，zod enum 对数组类型有要求，增加复杂度。

### C. 接受现状 + 测试护栏（放弃）

承认 env 和 agent 各管各的默认值，在测试中断言两者一致。

放弃原因：治标不治本，值还是写了两份。

## 落地计划

1. `packages/env/server.ts`：`CLOUD_MODEL` 的 `z.string().default("")` → `z.string().default("gpt-4o")`
2. `apps/agent/src/constants.ts`：删除 `DEFAULT_MODEL_NAME`，只保留 `MODEL_PROVIDER` 枚举
3. `apps/agent/src/model-provider.ts`：`DEFAULT_MODEL_NAME.OPENAI` → 直接用 `env.CLOUD_MODEL`
4. `apps/agent/src/model-provider.test.ts`：同步更新引用
5. `packages/env/src/server.test.ts`：更新 `ALL_SCHEMA_KEYS` 注释和 `CLOUD_MODEL` 测试断言

## 附带发现

`server.ts` 中 `z.enum(["openai", "ollama", "mock"])` 和 `MODEL_PROVIDER` 常量值重复。但 zod 的 `z.enum()` 要求字符串数组字面量，不能直接引用 TS 常量（除非用 `Object.values()` 转型）。这是 zod 和 TS 类型系统的天然张力，暂不处理，接受 enum 字面量和 `as const` 对象并存。
