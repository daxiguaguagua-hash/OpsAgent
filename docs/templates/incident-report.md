# Incident Report: <incident-id>

> 模板字段与 `INCIDENT_PHASE`（detected / diagnosed / mitigated / reviewed）对齐。
> Agent 填充 §1–§4，人类在 §5 完成审核闭环。

## 1. 摘要

- **Incident ID**：<YYYYMMDD-NNN>
- **发现时间**：<ISO 8601>
- **当前阶段**：`detected` | `diagnosed` | `mitigated` | `reviewed`
- **影响范围**：<service / route / user-facing>
- **严重等级**：`P0` | `P1` | `P2`
- **缓解状态**：`mitigated` | `unmitigated`

## 2. 证据

### 2.1 指标（M3-04 Prometheus Tool）

- 查询：`<PromQL>`
- 结果摘要：
  ```
  <instant / range query 输出，标准化后的 metric + value(s) + unit>
  ```
- 异常结论：<对指标偏离的解释>

### 2.2 日志（M3-05 Loki Tool）

- LogQL：`<query>`
- 关键条目：
  ```
  <timestamp> <level> <line 原文>
  <timestamp> <level> <line 原文>
  ```
- 关联 traceId：`<从日志中提取的 traceId 列表>`

### 2.3 链路（M3-06 Trace Tool）

- traceId：`<hex>`
- rootService：`<service>`
- 总耗时：`<durationMs>` ms
- 关键 span：
  | operationName | service | durationMs | status |
  |---|---|---:|---|
  | `<op>` | `<svc>` | `<ms>` | `ERROR` / `OK` |

### 2.4 源码上下文（M3-07 Git Context Tool）

- 相关文件：`<apps/backend/src/...>`
- 最近 commit：
  ```
  <hash> <author> <date> <message>
  ```
- 可疑改动：<对 commit 与故障的关联说明>

## 3. 根因分析

<基于 §2 证据的根因推理，包含因果链：触发条件 → 传播路径 → 故障表现>

## 4. 建议

- **短期缓解**：<立即可以采取的止血动作：回滚、限流、扩容>
- **长期修复**：<代码/配置/架构层面的修复>
- **预防改进**：<SLO / 监控 / 演练层面的加固>

## 5. 人类审核

- [ ] 审核人：
- [ ] 审核结论：`adopted` | `partially_adopted` | `rejected`
- [ ] 审核意见：
  ```
  <补充、修正或否决的理由>
  ```
