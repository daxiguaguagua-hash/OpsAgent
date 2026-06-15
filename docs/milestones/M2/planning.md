# M2 规划：可观测性基础闭环

**状态**：`done`（已验收，详见 [[M2-milestone-acceptance|M2-milestone-acceptance.md]]）
**时间范围**：2026-06 上旬
**主题**：建立 Prometheus + Loki + Tempo + Grafana 开源可观测性栈

## 里程碑目标

实现完整的开源可观测性闭环：
- Metrics（Prometheus）
- Logs（Loki + Alloy）
- Traces（Tempo + OpenTelemetry Collector）
- 统一可视化（Grafana Dashboard）

Sentry 推迟到 M4 作为"前端生产错误定位"的企业方案。

详见 [[0002-error-tracking-strategy|ADR-0002]]（错误监控分层栈决策）。

## 任务卡清单

详见 [[M2/tasks/|M2/tasks/]] 目录：

- [[M2-01-structured-logging|M2-01 结构化日志]]
- [[M2-02-prometheus-metrics|M2-02 Prometheus 指标]]
- [[M2-03-loki-alloy-logging|M2-03 Loki + Alloy 日志]]
- [[M2-04-grafana-datasources|M2-04 Grafana 数据源]]
- [[M2-05-opentelemetry-collector|M2-05 OpenTelemetry Collector]]
- [[M2-06-jaeger-tempo|M2-06 Jaeger + Tempo 链路]]
- [[M2-07-grafana-dashboard|M2-07 Grafana Dashboard]]
- [[M2-08-slo-config|M2-08 SLO 配置]]

## 验收标准

见 [[M2-milestone-acceptance|M2-milestone-acceptance.md]]。

## 反向引用

暂无（历史里程碑 stub 文档）
