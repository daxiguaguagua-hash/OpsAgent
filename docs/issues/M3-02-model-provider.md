# M3-02 模型 Provider 抽象

日期：2026-06-10
状态：`done`
前置任务：M3-01
负责人：ai-agent-team

## 1. 目标

抽象 LLM 提供方（Provider），通过环境变量 `MODEL_PROVIDER` 在 `openai` / `deepseek` / `alibaba` / `ollama` / `mock` 之间切换，避免业务代码直接依赖具体 SDK。

```mermaid
flowchart LR
  Env[MODEL_PROVIDER] --> Switch{createModel}
  Switch --> OpenAI[@ai-sdk/openai]
  Switch --> DeepSeek[@ai-sdk/deepseek]
  Switch --> Alibaba[@ai-sdk/alibaba]
  Switch --> Ollama[@ai-sdk/ollama]
  Switch --> Mock[createMockModel]
```

## 2. 常量合同

`apps/agent/src/constants.ts`：

```typescript
export const MODEL_PROVIDER = {
  OPENAI: "openai",
  DEEPSEEK: "deepseek",
  ALIBABA: "alibaba",
  OLLAMA: "ollama",
  MOCK: "mock",
} as const;
```

业务代码禁止直接书写 `"openai"` / `"deepseek"` 等字面量，必须使用 `MODEL_PROVIDER.*`。

## 3. 默认模型映射

| Provider | 默认 `modelId` |
|---|---|
| `openai` | `env.CLOUD_MODEL` |
| `deepseek` | `deepseek-chat` |
| `alibaba` | `qwen-max` |
| `ollama` | `env.OLLAMA_MODEL`（需额外安装 `@ai-sdk/ollama`） |
| `mock` | `mock-model` |

`modelName` 非空时覆盖默认值，便于切换 `deepseek-reasoner` 或 `qwen-plus`。

## 4. 交付物

| 文件 | 说明 |
|---|---|
| `apps/agent/src/constants.ts` | `MODEL_PROVIDER` `as const` 对象与 `ModelProvider` 联合类型 |
| `apps/agent/src/model-provider.ts` | `createModel` / `getModelConfigFromEnv` 工厂 |
| `apps/agent/src/model-provider.test.ts` | 覆盖 5 个 provider 与环境变量解析 |

## 5. 验收标准

| 验收项 | 标准 |
|---|---|
| 常量约束 | `MODEL_PROVIDER` 使用 `as const`，类型与值统一 |
| 环境变量切换 | `MODEL_PROVIDER=deepseek` 可创建 deepseek 模型实例 |
| 默认值兜底 | `modelName` 为空时使用上表默认值 |
| 未知 provider | 抛出 `Unknown model provider: ...` 错误 |
| ollama 未安装 | 抛出明确的提示错误，不静默失败 |

## 6. 测试证据

| 验证项 | 结果 |
|---|---|
| mock provider 返回标准 v2 模型对象 | 通过 |
| mock `doGenerate` 返回 content / finishReason / usage | 通过 |
| mock `doStream` 返回 `ReadableStream` | 通过 |
| unknown provider 抛错 | 通过 |
| ollama 抛"需要安装额外包"错误 | 通过 |
| deepseek 默认 `deepseek-chat`，支持自定义 | 通过 |
| alibaba 默认 `qwen-max`，支持自定义 | 通过 |
| `getModelConfigFromEnv` 返回合法枚举值 | 通过 |

## 7. 不做的事（边界）

- 不实现 `ollama` 的实际调用（留给后续按需接入）。
- 不引入 Provider 级别的重试或超时（M6 稳定性工程）。
