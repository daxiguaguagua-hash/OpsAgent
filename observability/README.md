# Observability 可观测性

## 组件

| 目录 | 组件 | 端口 | 用途 |
|---|---|---|---|
| `prometheus/` | Prometheus | 9090 | 指标抓取与存储 |
| `loki/` | Loki | 3100 | 日志聚合与查询 |
| `alloy/` | Grafana Alloy | — | 日志采集（替代已 EOL 的 Promtail） |
| `grafana/` | Grafana | 3000 | 统一可视化看板，自动 provisioning 注册 Prometheus 和 Loki 数据源 |
| `otel/` | OpenTelemetry | — | 采集标准配置（M2-05） |

Grafana 默认语言由 `GRAFANA_DEFAULT_LANGUAGE` 控制，演示配置使用 `zh-Hans`（简体中文）。个人 Profile（个人资料）语言设置优先于全局默认值。

## Loki + Alloy 日志采集

Backend 配置 `LOG_FILE_PATH=../../logs/backend.jsonl` 后，同时输出控制台和仓库根目录的 JSONL 文件；未配置时只输出控制台。Turbo 在 `apps/backend` 工作目录运行后端，因此相对路径以该目录为基准。Grafana Alloy 容器挂载根目录 `./logs` 并 tail（持续追踪）日志文件，推送到 Loki。

### 查询示例

Loki 运行在 `http://localhost:3100`，使用 LogQL 查询：

```logql
{service_name="opsagent-backend"} | json | statusCode = 500
```

按 traceId 查询：

```logql
{service_name="opsagent-backend"} | json | traceId = "opsagent-xxx"
```
