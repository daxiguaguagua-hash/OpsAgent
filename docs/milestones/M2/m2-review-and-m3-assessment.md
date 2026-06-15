# 开发日记：M2 收官复盘 + M3 评估

日期：2026-06-10

## 今天的问题

### 问题 1：Tempo 里的 trace 突然消失了

手动触发 `POST /api/demo/fail-500` 后，一个小时内能在 Grafana Tempo 里看到错误 trace，过了一小时再查就返回 0 条结果。

**根因**：`observability/tempo/tempo.yml` 的 `block_retention: 1h`。Tempo compactor 每小时清理过期 block，超过保留期的 trace 数据不可恢复。

**修复**：改 `block_retention` 值（如 `24h`）后 `docker compose restart tempo`。注意只重启 tempo 容器即可，不需要全量重启。

### 问题 2：后端业务代码到底哪里注入了监控代码？

**结论：零侵入。** `orders.ts`、`demo.ts` 等业务文件中没有任何 `@opentelemetry`、`prom-client` 或日志 API 的直接调用。所有可观测性通过 `app.ts` 的三层 Hono middleware 统一注入：

```
createTracingMiddleware → OTel SDK → BatchSpanProcessor → OTLP HTTP → Collector → Tempo
createStructuredLogger → JSON 日志 → console/file → Alloy → Loki
createMetricsMiddleware → prom-client Counter/Histogram → /metrics → Prometheus
```

业务代码唯一的间接通道是 `c.set("errorCode", ...)` — 传递错误码给 middleware，不算"注入监控代码"。

### 问题 3：前端有没有可观测性注入？

**没有。** `opsApi.ts` 是纯 `fetch()` 调用，没有 OTel Web SDK、没有 Sentry、没有错误上报。后端响应头 `x-trace-id` 也没被前端捕获。

## 决策

### OTel Web SDK vs Sentry

| 工具 | 擅长 | 短板 |
|---|---|---|
| OTel Web SDK | 端到端链路追踪，和现有 Grafana 栈零成本打通 | 不擅长错误聚合、告警、session replay |
| Sentry | 前端错误追踪、堆栈还原、Source Map 反解 | 独立体系，和 Grafana 数据不互通 |

**结论**：两者不是替代关系。先用 OTel Web SDK 接端到端 tracing（基础设施成本为零），Sentry 放 M4 做错误追踪。建议 task-breakdown.md M4 增加 OTel Web SDK 任务。

### task-breakdown.md 评估

M3 不需要改——M3 是 Mastra Agent 分析闭环，不涉及前端。M4 应新增 M4-10 "前端 OTel Web SDK 端到端追踪"。

## M3 起点评估

**已完成的基础设施**：
- `packages/shared`：`IncidentReport`、`Evidence`、`Recommendation`、`IncidentSeverity` 类型已定义
- `packages/workflow-gates`：消息总线、Actor Registry、任务 CLI、执行者运行时全部就绪
- `apps/agent/src/index.ts`：仅有 smoke test，输出 mock IncidentReport

**M3 核心工作**：
1. 引入 Mastra 框架，搭建 Agent 项目结构（M3-01）
2. 模型 Provider 抽象：openai / ollama / mock（M3-02）
3. 三个观测数据 Tool：Prometheus Tool、Loki Tool、Trace Tool（M3-04 ~ M3-06）
4. Incident Report 生成：从 mock 升级为真实数据驱动（M3-08）
5. 前端展示 AI 分析结果（M3-09）

**风险**：
- M3-11 ~ M3-16（GBrain RAG、知识管理）依赖 gbrain + pgvector 环境，需确认本地 pgvector 可用
- 当前 message bus 基于文件系统，多 agent 协调靠定时器（见 06-09 note-myself.md 记录的架构问题），M3 暂不重构这个

## 面试说法更新

> OpsAgent 的后端可观测性采用零侵入架构——所有 tracing、metrics、logging 通过 Hono middleware 统一注入，业务代码完全不感知。前端计划分两步：先用 OTel Web SDK 实现端到端链路追踪（与现有 Grafana 栈无缝打通），再用 Sentry 做前端错误追踪和 Source Map 反解。
