# M3 人工验证指南

## 前置条件

```bash
pnpm infra:up        # PostgreSQL + Redis + Prometheus + Loki + Tempo + Grafana
```

## 第一步：启动业务系统

开两个终端：

```bash
pnpm dev:backend     # 后端 (Hono, 默认 8000)
pnpm dev:frontend    # 前端 (Vite, 端口 3001)
```

## 第二步：制造故障

打开 `http://localhost:3001`，页面提供 4 个场景入口：

| 场景 | 按钮 | 作用 |
|---|---|---|
| 正常订单 | 创建订单 | 写 PostgreSQL，验证正常链路 |
| Backend 500 | 触发 500 | 产生错误码 + 日志 + 指标上升 |
| 慢请求 | 触发慢请求 | 制造 >2s 延迟 |
| 前端异常 | 触发前端异常 | 浏览器端错误 |

**建议顺序**：先创建几个正常订单，再连续触发几次 500 和慢请求，让 Prometheus/Loki 有数据可查。

## 第三步：AI 分析

点击 **"AI 分析"** 按钮。页面调用 `POST /api/analysis`，后端执行：

1. 查询 Prometheus（5xx 错误率）
2. 查询 Loki（最近 1 小时的 ERROR 日志）
3. 组装 Evidence Bundle
4. 渲染 Markdown 格式的 Incident Report

报告包含 5 个章节：摘要 → 证据（指标/日志） → 根因分析 → 修复建议 → 人类审核清单。

## 第四步：交叉验证（Grafana）

打开 `http://localhost:3000`，用 Dashboard 交叉验证：

- Prometheus 中能看到 500 错误率变化
- Loki 中能按 traceId 查到对应的错误日志
- Tempo 中能看到请求链路

## 第五步（可选）：Agent 独立运行

```bash
pnpm dev:agent      # Mastra Agent 启动，输出自我介绍
```

通过 `.env` 中 `MODEL_PROVIDER` 切换模型（mock / openai / deepseek / ollama）。

## 第六步（可选）：RAG 知识检索

```bash
pnpm -F @opsagent/agent gbrain:sync    # 同步知识库
gbrain query "故障排查"                  # 语义搜索
```

## 验证要点速查

| 层级 | 验证内容 | 怎么验证 |
|---|---|---|
| 前端→后端 | 4 个场景按钮都能正常执行 | 点击后事件流有记录 |
| 后端→观测 | 500/慢请求产生日志和指标 | Grafana Explore 中可查 |
| Agent 分析 | 点击 AI 分析出报告 | 页面上渲染出 Markdown 报告 |
| Agent 切换 | 改 `.env` 的 `MODEL_PROVIDER` | 重启后端，报告 provider 字段变化 |
| RAG 检索 | gbrain 搜索命中项目文档 | `gbrain query "Incident Report"` |

## 最少验证路径

```
pnpm infra:up → pnpm dev:backend + pnpm dev:frontend → 打开浏览器触发几个 500 → 点 AI 分析 → 看到报告
```

报告出来即 M3 核心闭环通过。
