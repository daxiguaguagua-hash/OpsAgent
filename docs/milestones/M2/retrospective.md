# M2 复盘

**状态**：`done`
**验收提交**：见 [[M2-milestone-acceptance|M2-milestone-acceptance.md]]

## 主要产出

- Prometheus + Loki + Tempo + Grafana 全套容器化（docker-compose）
- OpenTelemetry Collector 接入（OTLP HTTP/gRPC）
- Grafana Dashboard 模板（Metrics / Logs / Traces 三板斧）
- SLO 配置与告警规则

## 沉淀到 ADR 的决策

- [[0002-error-tracking-strategy|ADR-0002]]：错误监控分层栈（Prometheus+Loki+Tempo+Sentry）
  ——M2 期间确立了"开源栈 vs Sentry"的职责边界

## 沉淀到 lessons 的教训

- [[tdd-and-test-governance|TDD 与测试治理]]：M2 期间开始系统化测试治理方法论

## 对后续里程碑的影响

- 为 M3（AI Agent 整合）提供了"agent 可以调用的 observability 工具链"
- 为 M4（前端错误定位）留出了 Sentry 的清晰接入点（不与 M2 的开源栈重叠）

## 反向引用

暂无（历史里程碑 stub 文档）
