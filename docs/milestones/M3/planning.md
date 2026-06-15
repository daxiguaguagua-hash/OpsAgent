# M3 规划：AI Agent 整合

**状态**：`done`（已验收）
**时间范围**：2026-06 中旬
**主题**：把 Mastra AI Agent 整合进 monorepo，调用 M2 的 observability 工具

## 里程碑目标

- Mastra 框架引入（apps/agent + packages/agent）
- 4 个 observability 工具封装为 agent 可调用的 tool（prometheus / loki / trace / git-context）
- GBrain 知识库 MCP 接入
- Analysis Pipeline（DeepSeek + 4 tools 生成 Incident Report）

## 任务卡清单

详见 [[M3/tasks/|M3/tasks/]] 目录（共 17 张卡）：

**Agent 基础**：
- [[M3-01-mastra-project|M3-01 Mastra 项目]]
- [[M3-02-model-provider|M3-02 Model Provider]]
- [[M3-03-mock-report|M3-03 Mock Report]]

**Observability Tools**：
- [[M3-04-prometheus-tool|M3-04 Prometheus Tool]]
- [[M3-05-loki-tool|M3-05 Loki Tool]]
- [[M3-06-trace-tool|M3-06 Trace Tool]]
- [[M3-07-git-context-tool|M3-07 Git Context Tool]]

**报告与生命周期**：
- [[M3-08-incident-report-template|M3-08 Incident Report Template]]
- [[M3-09-frontend-report|M3-09 Frontend Report]]
- [[M3-10-incident-lifecycle|M3-10 Incident Lifecycle]]

**GBrain 知识库**：
- [[M3-11-knowledge-base|M3-11 Knowledge Base]]
- [[M3-12-gbrain-sources|M3-12 GBrain Sources]]
- [[M3-13-gbrain-mcp|M3-13 GBrain MCP]]
- [[M3-14-pre-execution-rag|M3-14 Pre-Execution RAG]]
- [[M3-15-knowledge-capture|M3-15 Knowledge Capture]]
- [[M3-16-rag-evaluation|M3-16 RAG Evaluation]]

**Pipeline 整合**：
- [[M3-17-analysis-pipeline-integration|M3-17 Analysis Pipeline Integration]]

## 验收标准

M3 完工提交：`1855138 docs: M3 全 16 卡 task-breakdown SHA 回填`

详见 [[M3/closure|M3/closure.md]] 和 [[M3/handoff|M3/handoff.md]]。

## 反向引用

暂无（历史里程碑 stub 文档）
