# M3-17 Analysis Pipeline 整合

日期：2026-06-12
状态：`implementing`
前置任务：M3-03 / M3-04 / M3-05 / M3-06 / M3-07 / M3-08
负责人：ai-agent-team

## 1. 背景与问题

当前 `apps/backend/src/business/analysis.ts` 存在严重的架构断裂：

| 问题 | 说明 |
|---|---|
| 两套系统未整合 | `apps/agent` 有完整的 Mastra Agent + 4 个观测工具 + LLM 调用能力，但 backend 完全没用上 |
| 重复实现 | backend 手写 `createHttpEvidenceCollector` 裸调 Prometheus/Loki，agent 已有封装好的 tools |
| Mock 占位 | `createMockReportRenderer` 输出固定模板，`AnalysisProvider` 接口声明但从未实现 |
| Schema 分裂 | agent 有完整的 `IncidentReportSchema`（结构化），backend 只有一个扁平 `AnalysisResponse` |

## 2. 目标

Backend 不再自行采集证据和渲染报告，而是将分析请求委派给 `apps/agent` 的 Mastra Agent Pipeline，实现：

1. Agent 调用 4 个 tools（Prometheus / Loki / Tempo / Git）采集证据
2. LLM 基于证据执行根因分析
3. 输出符合 `IncidentReportSchema` 的结构化报告
4. 渲染为 Markdown 返回前端

## 3. 架构变更

```
              Before（断裂）                          After（整合）
  Frontend → Backend ──fetch──→ Prometheus    Frontend → Backend → Agent Pipeline
                  └──→ mock 模板渲染                        │         ├── Prometheus tool
                                                            │         ├── Loki tool
                                                            │         ├── Tempo tool
                                                            │         ├── Git tool
                                                            │         ├── LLM 根因分析
                                                            │         └── Markdown 渲染
                                                            └──→ AnalysisResponse
```

## 4. 文件变更清单

| 文件 | 操作 | 说明 |
|---|---|---|
| `apps/agent/src/lib.ts` | 新增 | Library 入口，导出 pipeline 等公共 API |
| `apps/agent/src/analysis-pipeline.ts` | 新增 | Mastra Agent 分析管道 + Markdown 渲染器 |
| `apps/agent/src/cli.ts` | 新增 | CLI 入口（从 index.ts 拆出） |
| `apps/agent/src/index.ts` | 重写 | 改为 library 入口，不再有 CLI 副作用 |
| `apps/agent/package.json` | 修改 | main → src/lib.ts，scripts 引用 cli.ts |
| `apps/backend/src/business/analysis.ts` | 重写 | 瘦身为 agent pipeline 的薄代理 |
| `apps/backend/package.json` | 修改 | 添加 `@opsagent/agent: workspace:*` |

## 5. 关键设计决策

### 5.1 Agent Pipeline 使用 structuredOutput

Mastra Agent 的 `generate()` 支持 `structuredOutput` 选项，传入 Zod schema 后直接返回验证过的结构化对象。Pipeline 使用 `IncidentReportSchema` 作为输出 schema，确保 LLM 输出严格符合预定义结构。

### 5.2 Markdown 渲染在 Agent 侧

结构化报告由 Agent 产出后，在 Agent 侧渲染为 Markdown。这保证了数据与展示的一致性，且 backend 无需关心渲染逻辑。

### 5.3 CLI 与 Library 分离

`index.ts` 原为 CLI 入口（带 `main()` 副作用），改为纯 library 导出。CLI 逻辑移至 `cli.ts`，通过 `package.json` scripts 调用。Backend import 时不会触发 CLI 执行。

### 5.4 Backend 保持 DI 测试友好

`AnalysisService` 接口（`{ generate(): Promise<AnalysisResponse> }`）在 `app.ts` 中保持不变，测试时仍可注入 mock。

## 6. 降级策略

当 `MODEL_PROVIDER=mock` 时，Agent 使用 mock model（不触发真实 LLM 调用）。Pipeline 构造一份包含空证据的默认 IncidentReport 并通过 schema 校验，保证端到端链路可用。

## 7. 验收标准

| 验收项 | 标准 |
|---|---|
| Agent pipeline 可独立运行 | `createDefaultAnalysisPipeline().generate()` 返回有效 `AnalysisResponse` |
| Backend POST /api/analysis 正常 | 返回 201，body 含 incidentId / markdown / generatedAt / provider |
| Mock 模式可用 | `MODEL_PROVIDER=mock` 时端到端不报错 |
| 类型检查通过 | `pnpm check-types` 全量通过 |
| 现有测试通过 | `pnpm test` 全量通过 |

## 8. 不做的事（边界）

- 不做流式输出（SSE），留给后续迭代
- 不改前端组件（`AnalysisResponseDto` 结构不变）
- 不做 agent HTTP 服务（同进程 import，非独立部署）
- 不接入 GBrain RAG（后续 M4 整合）
