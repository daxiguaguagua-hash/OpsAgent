# M2-08 SLO 配置草案

日期：2026-06-09
状态：`done`
前置任务：M2-02 / M2-07

## 1. 目标

定义 OpsAgent v0.1 的服务等级目标（SLO），为 M6 稳定性工程增强提供度量基础。当前为草案，不强制执行 Error Budget 策略。

## 2. SLO 定义

| SLO | 目标 | 窗口 | PromQL |
|---|---|---|---|
| 可用性（availability） | 99.9% | 30 天 | `sum(rate(http_requests_total{status_code!~"5.."}[30d])) / sum(rate(http_requests_total[30d]))` |
| P95 延迟 | < 500ms | 5 分钟 | `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))` |
| P99 延迟 | < 2000ms | 5 分钟 | `histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))` |

## 3. 排除项

故障演示接口不纳入可用性 SLO：

- `/api/demo/fail-500`：设计为返回 500
- `/api/demo/slow`：设计为高延迟

## 4. Error Budget

| SLO | 每月允许 | 示例 |
|---|---|---|
| 99.9% 可用性 | 43.2 分钟 | 超过即触发告警 |
| P95 < 500ms | 5% 请求超标 | 超过即告警 |

## 5. 交付物

| 文件 | 说明 |
|---|---|
| `observability/slo.yml` | SLO 配置草案，包含指标定义、排除规则和告警预留 |

## 6. 验收标准

| 验收项 | 标准 |
|---|---|
| 配置存在 | `observability/slo.yml` 存在且格式正确 |
| 指标可查 | SLO 中引用的 PromQL 在 Prometheus 中可执行 |
| 排除规则 | 演示接口不被计入可用性计算 |

## 7. 不做的事（边界）

- 不配置 Prometheus alerting rules（M6）
- 不做 Error Budget 自动化策略（M6）
- 不做 SLO Dashboard 面板（可在 Grafana 手动添加）
