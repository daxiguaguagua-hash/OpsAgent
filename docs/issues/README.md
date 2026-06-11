# 任务卡索引

本目录是 OpsAgent v0.1 各里程碑任务卡的唯一落盘位置。每张卡一个 Markdown 文件，命名规则 `<Milestone>-<编号>-<slug>.md`，例如 `M2-01-structured-logging.md`。

总览与正式拆分见 [task-breakdown.md](../task-breakdown.md)。

## 1. 状态字段约定

每张任务卡顶部必须包含：

```yaml
日期：<YYYY-MM-DD>
状态：<status>
前置任务：<依赖>
负责人：<team>
```

`<status>` 取值参考 `packages/workflow-gates/src/taskState.ts` 状态机，但在"完工"这一终态使用 `done` 而非状态机的 `completed`，便于在文本层面与运行中的 ActiveTask 区分：

| 状态 | 含义 |
|---|---|
| `planned` | 已建卡，未开始 |
| `implementing` | 实施中 |
| `testing` | 实施完成，测试中 |
| `ready_for_review` | 测试通过，等待复核 |
| `done` | 复核通过，已归档（普通任务卡终态） |
| `accepted` | 里程碑验收通过（仅用于 `*-milestone-acceptance.md`） |

任务卡完工后必须把 `状态` 字段就地更新为 `done`，并把完成提交号写在同一行（例如 `状态：\`done\`（提交 \`abc1234\`）`），便于后续索引扫描。

## 2. 里程碑总览

| Milestone | 验收卡 | 任务数 | 状态 |
|---|---|---:|---|
| M0 项目骨架与治理文件 | [M0-17-milestone-acceptance.md](M0-17-milestone-acceptance.md) | 17 | `accepted` |
| M1 最小业务系统 | [M1-milestone-acceptance.md](M1-milestone-acceptance.md) | 12 | `accepted` |
| M2 可观测性基础闭环 | [M2-milestone-acceptance.md](M2-milestone-acceptance.md) | 8 | `accepted` |
| M3 Mastra Agent 分析闭环 | 未验收 | 16 | `in progress` |
| M4 Source Map 前端源码定位 | 未验收 | — | `planned` |
| M5 GitLab 企业模拟模式 | 未验收 | — | `planned` |
| M6 稳定性工程增强 | 未验收 | — | `planned` |
| M7 面试展示材料 | 未验收 | — | `planned` |

## 3. M0 项目骨架与治理文件

M0-01 至 M0-10 合并记录在 M0 总卡 [M0-project-scaffold.md](M0-project-scaffold.md)，不再独立建卡。M0-11 至 M0-16 为独立任务卡。M0-17 为里程碑验收卡。

| 任务卡 | 说明 | 状态 |
|---|---|---|
| [M0-project-scaffold.md](M0-project-scaffold.md) | M0 总卡（目录结构、`.gitignore`、`.env.example`、monorepo、shared、docker-compose、CODEOWNERS 等），覆盖 M0-01 ~ M0-10 | `done`（M0-17 验收） |
| [M0-11-workflow-gates.md](M0-11-workflow-gates.md) | TypeScript 工作流门禁 | `done`（M0-17 验收） |
| [M0-12-role-test-governance.md](M0-12-role-test-governance.md) | 角色与测试治理 | `done`（M0-17 验收） |
| [M0-13-task-handoff-cli.md](M0-13-task-handoff-cli.md) | 任务交接 CLI | `done`（M0-17 验收） |
| [M0-14-orchestration-assistant.md](M0-14-orchestration-assistant.md) | 编排助手 | `done`（M0-17 验收） |
| [M0-15-actor-runtime.md](M0-15-actor-runtime.md) | Actor Runtime | `done`（M0-17 验收） |
| [M0-16-agent-message-bus.md](M0-16-agent-message-bus.md) | Agent Message Bus | `done`（M0-17 验收） |
| [M0-17-milestone-acceptance.md](M0-17-milestone-acceptance.md) | M0 里程碑验收 | `accepted` |

## 4. M1 最小业务系统

| 任务卡 | 说明 | 状态 |
|---|---|---|
| [M1-01-stack-baseline-audit.md](M1-01-stack-baseline-audit.md) | 技术栈基线审计 | `done`（M1 验收） |
| [M1-milestone-acceptance.md](M1-milestone-acceptance.md) | M1 里程碑验收（含 M1-11 双 Agent 冻结审计、M1-12 M1 治理门禁的一次性审计记录） | `accepted` |

M1-02 ~ M1-10 的事实由 `M1-milestone-acceptance.md` §2 任务状态表统一承载，不再独立建卡。

## 5. M2 可观测性基础闭环

| 任务卡 | 说明 | 状态 |
|---|---|---|
| [M2-01-structured-logging.md](M2-01-structured-logging.md) | 后端结构化请求日志 | `done` |
| [M2-02-prometheus-metrics.md](M2-02-prometheus-metrics.md) | Prometheus 指标闭环 | `done` |
| [M2-03-loki-alloy-logging.md](M2-03-loki-alloy-logging.md) | Loki + Alloy 日志闭环 | `done` |
| [M2-04-grafana-datasources.md](M2-04-grafana-datasources.md) | Grafana 自动配置数据源 | `done` |
| [M2-05-opentelemetry-collector.md](M2-05-opentelemetry-collector.md) | OpenTelemetry Collector | `done` |
| [M2-06-jaeger-tempo.md](M2-06-jaeger-tempo.md) | Tempo 持久化 Trace | `done` |
| [M2-07-grafana-dashboard.md](M2-07-grafana-dashboard.md) | Grafana 基础 Dashboard | `done` |
| [M2-08-slo-config.md](M2-08-slo-config.md) | SLO 配置草案 | `done` |
| [M2-milestone-acceptance.md](M2-milestone-acceptance.md) | M2 里程碑验收 | `accepted` |

## 6. M3 Mastra Agent 分析闭环

| 任务卡 | 说明 | 负责人 | 状态 |
|---|---|---|---|
| [M3-01-mastra-project.md](M3-01-mastra-project.md) | 搭建 Mastra 项目 | ai-agent-team | `done` |
| [M3-02-model-provider.md](M3-02-model-provider.md) | 模型 Provider 抽象 | ai-agent-team | `done` |
| [M3-03-mock-report.md](M3-03-mock-report.md) | Mock 报告模式 | ai-agent-team | `done` |
| [M3-04-prometheus-tool.md](M3-04-prometheus-tool.md) | Prometheus Tool | ai-agent-team | `done` |
| [M3-05-loki-tool.md](M3-05-loki-tool.md) | Loki Tool | ai-agent-team | `planned` |
| [M3-06-trace-tool.md](M3-06-trace-tool.md) | Trace Tool | ai-agent-team | `planned` |
| [M3-07-git-context-tool.md](M3-07-git-context-tool.md) | Git Context Tool | ai-agent-team | `done` |
| [M3-08-incident-report-template.md](M3-08-incident-report-template.md) | Incident Report 模板 | docs-team | `planned` |
| [M3-09-frontend-report.md](M3-09-frontend-report.md) | 前端展示 AI 分析结果 | frontend-team | `planned` |
| [M3-10-incident-lifecycle.md](M3-10-incident-lifecycle.md) | Incident Lifecycle 字段 | ai-agent-team | `planned` |
| [M3-11-knowledge-base.md](M3-11-knowledge-base.md) | 整理 Agent 知识库文档 | docs-team + ai-agent-team | `planned` |
| [M3-12-gbrain-sources.md](M3-12-gbrain-sources.md) | 注册 GBrain Sources | ai-agent-team | `planned` |
| [M3-13-gbrain-mcp.md](M3-13-gbrain-mcp.md) | 接入 GBrain MCP | ai-agent-team | `planned` |
| [M3-14-pre-execution-rag.md](M3-14-pre-execution-rag.md) | Agent 执行前 RAG | ai-agent-team | `planned` |
| [M3-15-knowledge-capture.md](M3-15-knowledge-capture.md) | 任务完成后知识沉淀 | ai-agent-team + docs-team | `planned` |
| [M3-16-rag-evaluation.md](M3-16-rag-evaluation.md) | RAG Evaluation 与引用审计 | qa-team + ai-agent-team | `planned` |

## 7. 状态更新纪律

1. **单卡更新**：完工时立即把顶部 `状态` 字段改为 `done` 并附提交号。
2. **索引同步**：同一次提交里顺手更新本文件 §5/§6 表格的"状态"列。
3. **`task-breakdown.md` 同步**：里程碑内所有任务完工时，回去更新该文件的状态列与关联提交号。
4. **里程碑验收**：全部任务 `done` 后新建 `M<n>-milestone-acceptance.md`，状态填 `accepted`，并把下一里程碑的准入结论写清。
