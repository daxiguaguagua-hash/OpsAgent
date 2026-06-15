# M3-04 Prometheus Tool

日期：2026-06-11
状态：`done`（提交 `c490ea8`）
前置任务：M3-01 / M2-02
负责人：ai-agent-team

## 1. 目标

为 Agent 提供查询 Prometheus 指标的 Tool，使智能体可以主动拉取错误率、延迟分位、请求速率等指标，作为 Incident Report 的证据来源。

```mermaid
flowchart LR
  Agent[OpsAgent] -->|tool call| Tool[Prometheus Tool]
  Tool -->|HTTP /api/v1/query| Prom[(Prometheus)]
  Tool --> Agent
```

## 2. 预期输入

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `query` | string | 是 | PromQL 表达式 |
| `time` | string | 否 | ISO 8601，默认当前时间 |
| `range` | object | 否 | `{ start, end, step }` 用于 range query |

## 3. 预期输出

标准化的指标结构（去掉 Prometheus 原生 `resultType` 噪音），包含：

- `metric`：标签集合
- `value` / `values`：瞬时或时间序列
- `unit`：从指标名推断的度量单位（可选）

## 4. 交付物

| 文件 | 说明 |
|---|---|
| `apps/agent/src/tools/prometheus-tool.ts` | Tool 实现，使用 `@mastra/core` Tool Schema |
| `apps/agent/src/tools/prometheus-tool.test.ts` | 用 MSW 或 mock fetch 覆盖请求与解析 |
| `apps/agent/src/tools/index.ts` | 注册到 Agent |

## 5. 验收标准

| 验收项 | 标准 |
|---|---|
| PromQL 可执行 | 查询 `sum(rate(http_requests_total[5m]))` 返回结果 |
| 错误处理 | Prometheus 不可达时返回结构化错误而非抛异常 |
| 端点可配置 | 通过 `PROMETHEUS_URL` 环境变量注入 |
| 单元测试 | 覆盖成功响应、空结果、网络错误 |

## 6. 不做的事（边界）

- 不实现查询结果缓存（留给 M6）。
- 不做权限校验（Prometheus 当前为内网服务）。
