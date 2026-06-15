# ADR-0002: 错误监控采用 Prometheus+Loki+Tempo+Sentry 分层栈

- **日期**：2026-06-06
- **状态**：`accepted`
- **决策者**：项目维护者 + AI agent
- **关联**：
  - [[0000-adopt-adr|ADR-0000]]：知识库结构
  - [[2026-06-14-m4-phaseA-retrospective|M4 Phase A 复盘]]：Sentry 接入实战

## Context

进入 M2（可观测性基础闭环）前，项目维护者提出了几个关键问题：

> M2 里的工具我都没有用过。完成之后能看到页面吗？到底怎么"可观测"？Grafana 是不是汇总系统？Sentry 是不是前端监控库？

这些问题触及了可观测性架构最重要的边界：应用负责产生数据，存储系统负责保存不同类型的数据，Grafana 负责统一查询和展示，Sentry 则专注于应用异常及其源码上下文。需要明确每个工具的职责，避免能力重叠导致的架构混乱。

## Decision

### 三信号基础（M2 实现）

Prometheus（指标）+ Loki（日志）+ Tempo（链路）构成开源可观测性底座，Grafana 作为统一查询与可视化平台：

| 信号 | 回答的问题 | 项目示例 |
|---|---|---|
| Metrics（指标） | 问题是否发生、影响多大 | 请求量、错误率、P95 延迟 |
| Logs（日志） | 某次请求具体发生了什么 | 路由、状态码、错误信息、`traceId` |
| Traces（链路追踪） | 请求慢或失败在哪个步骤 | HTTP、PostgreSQL、Redis 各自耗时 |

Grafana 本身通常不负责产生业务观测数据，也不是所有数据的唯一存储。它连接 Prometheus、Loki、Tempo 等 Data Source（数据源），提供 Dashboard（看板）、Explore（查询分析）和 Alerting（告警）。

### Sentry 的定位（M4 实现）

Sentry（应用性能与错误监控平台）最常见于前端，但也支持 Node.js 等后端运行环境。它特别擅长：

- 捕获浏览器未处理异常和 Promise rejection（异步拒绝）
- 聚合、去重并统计同类错误
- 记录 Release（发布版本）、浏览器和用户影响
- 使用私有 Source Map（源码映射）把压缩代码位置还原到源码文件和行号
- 提供 Breadcrumbs（异常前操作轨迹）和 Session Replay（会话回放）

### 工具选择矩阵

| 问题 | 首选工具 |
|---|---|
| 接口错误率是否升高 | Prometheus |
| 某个 `traceId` 对应哪些日志 | Loki |
| 请求慢在 HTTP、数据库还是缓存 | OpenTelemetry + Tempo |
| 浏览器异常对应哪一行源码 | Sentry + Source Map |
| 统一查看指标、日志和链路 | Grafana |

### 里程碑安排

1. **M2**：实现 Prometheus、Loki、Tempo 和 Grafana，学习完整的开源可观测性闭环
2. **M3**：AI 分析能力整合（基于 M2 的数据）
3. **M4**：Sentry 作为前端生产错误定位的真实企业方案；同时保留简化的自研 symbolication（源码反解）流程，用于展示 Source Map 的底层原理

## Consequences

### 正面

- **能力互补而非重叠**：开源栈解决"系统级可观测性"，Sentry 解决"应用级错误定位"，各司其职
- **面试价值**：能讲清楚"为什么不只用 Grafana"和"为什么不只用 Sentry"——这是企业级架构师的典型问题
- **学习路径清晰**：M2 学开源栈（行业基本功），M4 学 Sentry（企业方案实战）

### 负面

- **维护成本**：需要运行 4+ 个服务（Prometheus + Loki + Tempo + Grafana + Sentry SaaS），对单机环境有资源压力
- **能力边界模糊**：Sentry 也有 tracing 和 metrics 功能，与 Tempo 和 Prometheus 有部分重叠，需要明确"哪个信号走哪个系统"

### 风险

- **Sentry SaaS 锁定**：Sentry 14 天免费试用后需要付费；如果长期依赖，需要评估 GlitchTip（开源替代，Sentry 协议兼容）作为 fallback
- **自研反解的 ROI**：M4 的简化 symbolication 演示和 Sentry 自动反解能力重叠，价值主要在"讲清楚底层原理"，不是生产方案

## 反向引用

暂无
