# M3-10 Incident Lifecycle 字段

日期：2026-06-10
状态：`planned`
前置任务：M3-08
负责人：ai-agent-team

## 1. 目标

在 Incident Report 中区分故障生命周期的四个阶段，使报告不只是"根因 + 建议"，还能描述故障从发现到复盘的完整时间线。

## 2. 生命周期阶段

| 阶段 | 常量 | 说明 |
|---|---|---|
| 发现 | `INCIDENT_PHASE.DETECTED` | 第一次感知异常（指标/日志/用户反馈） |
| 诊断 | `INCIDENT_PHASE.DIAGNOSED` | 定位到根因或可疑组件 |
| 缓解 | `INCIDENT_PHASE.MITIGATED` | 采取措施降低影响 |
| 复盘 | `INCIDENT_PHASE.REVIEWED` | 形成改进建议与 Action Item |

常量必须定义在 `apps/agent/src/constants.ts`，业务代码禁止字符串字面量。

## 3. 交付物

| 文件 | 说明 |
|---|---|
| `apps/agent/src/constants.ts` | 新增 `INCIDENT_PHASE` |
| `apps/agent/src/report/lifecycle.ts` | 字段类型与解析 |
| `apps/agent/src/report/lifecycle.test.ts` | 阶段映射测试 |

## 4. 验收标准

| 验收项 | 标准 |
|---|---|
| 四阶段齐全 | `DETECTED` / `DIAGNOSED` / `MITIGATED` / `REVIEWED` 均存在 |
| 常量约束 | 使用 `as const`，禁止业务代码硬编码字符串 |
| Agent 输出结构化 | 报告 JSON 包含 `phases[]` 字段 |

## 5. 不做的事（边界）

- 不做阶段自动识别（Agent 显式填写）。
- 不做阶段持久化（M6）。
