# M3-03 Mock 报告模式

日期：2026-06-10
状态：`done`
前置任务：M3-02
负责人：ai-agent-team

## 1. 目标

在没有真实模型可用（离线开发、CI 环境、首次启动）时，Agent 仍能返回结构稳定的 Mock 报告，使前端展示、Tool 调用链路与工作流编排可以先行联调。

## 2. Mock 模型合同

`createMockModel()` 实现 `@ai-sdk/provider` 的 `LanguageModelV2` 接口：

| 字段 | 值 |
|---|---|
| `specificationVersion` | `v2` |
| `provider` | `mock` |
| `modelId` | `mock-model` |
| `doGenerate().content[0].type` | `text` |
| `doGenerate().content[0].text` | `Mock incident analysis: System is healthy, no issues detected.` |
| `doGenerate().finishReason` | `stop` |
| `doGenerate().usage` | `{ promptTokens: 0, completionTokens: 0 }` |
| `doStream()` | 返回 `ReadableStream`，至少一个 `text-delta` chunk |

这样 Mastra `Agent` 不感知"模型是真是假"，Tool 调用链路保持一致。

## 3. 交付物

| 文件 | 说明 |
|---|---|
| `apps/agent/src/model-provider.ts` | `createMockModel` 私有工厂，由 `createModel` 分发调用 |
| `apps/agent/src/model-provider.test.ts` | mock 生成与流式输出测试 |

## 4. 验收标准

| 验收项 | 标准 |
|---|---|
| 无 API key 可启动 | `MODEL_PROVIDER=mock pnpm start` 不报错并打印 Mock 回复 |
| 响应格式一致 | Mock 响应与真实 Provider 同结构，Agent 不区分 |
| 流式接口可用 | `doStream` 返回的 `ReadableStream` 至少有一个 chunk |

## 5. 测试证据

| 验证项 | 结果 |
|---|---|
| mock `doGenerate` 返回标准结构 | 通过 |
| mock `doStream` 返回 `ReadableStream` 且首 chunk 为 `text-delta` | 通过 |
| `MODEL_PROVIDER=mock` 可端到端运行 | 通过（提交 `23ee4ad`） |

## 6. 不做的事（边界）

- 不实现"模板化 Mock 报告"（如固定 Markdown 结构），留给 M3-08 Incident Report 模板。
- 不做 Mock Tool 调用（M3-04 ~ M3-07 的 Tool 在 mock 模式下不会被 Agent 触发）。
