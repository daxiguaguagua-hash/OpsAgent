# M3-06 Trace Tool

日期：2026-06-10
状态：`planned`
前置任务：M3-01 / M2-06
负责人：ai-agent-team

## 1. 目标

为 Agent 提供按 `traceId` 查询 Tempo 链路的 Tool，使智能体可以还原一次请求的完整 span 树，定位延迟瓶颈与错误位置。

## 2. 预期输入

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `traceId` | string | 是 | 链路标识（需符合 traceId 字符规则） |
| `includeSpans` | boolean | 否 | 是否返回原始 span 列表，默认 `true` |

## 3. 预期输出

```json
{
  "traceId": "...",
  "rootService": "backend",
  "durationMs": 1230,
  "spans": [
    { "spanId": "...", "operationName": "GET /api/orders", "durationMs": 1230, "status": "ERROR" }
  ]
}
```

## 4. 交付物

| 文件 | 说明 |
|---|---|
| `apps/agent/src/tools/trace-tool.ts` | 调用 `GET /api/traces/:traceId`（后端代理）或直连 Tempo |
| `apps/agent/src/tools/trace-tool.test.ts` | 覆盖成功、traceId 不存在、格式非法 |

## 5. 验收标准

| 验收项 | 标准 |
|---|---|
| traceId 合法 | 返回 span 列表与总耗时 |
| traceId 不存在 | 返回空结构而非抛异常 |
| traceId 非法字符 | 返回参数错误 |
| 端点可配置 | 通过 `TRACE_ENDPOINT` 环境变量注入 |

## 6. 不做的事（边界）

- 不缓存链路（Tempo 已有内部缓存）。
- 不渲染调用树（Agent 自己从 span 列表推理）。
