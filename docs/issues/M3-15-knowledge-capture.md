# M3-15 任务完成后知识沉淀

日期：2026-06-10
状态：`planned`
前置任务：M3-14
负责人：ai-agent-team + docs-team

## 1. 目标

在任务完成（`completed`）或里程碑验收时，把有价值的结论写回 GBrain，形成"做任务 → 沉淀知识 → 下次任务能检索到"的正反馈闭环。

## 2. 沉淀策略

| 内容 | 沉淀方式 | 落点 |
|---|---|---|
| 任务摘要（结论 + 关键证据） | 自动 | `docs/knowledge/<task-id>.md` |
| 架构决策（ADR） | 人工审核后 | `docs/decisions/` |
| 故障经验（Incident Report） | 人工审核后 | `docs/knowledge/incidents/` |
| 原始聊天噪声 | 不沉淀 | — |

## 3. 交付物

| 文件 | 说明 |
|---|---|
| `apps/agent/src/rag/knowledge-writer.ts` | 写入 GBrain 的封装 |
| `packages/workflow-gates/src/knowledgeGate.ts` | 任务完成前检查沉淀是否触发 |
| `apps/agent/src/rag/knowledge-writer.test.ts` | 覆盖过滤与写入 |

## 4. 验收标准

| 验收项 | 标准 |
|---|---|
| 任务摘要自动写 | 任务 `completed` 后生成 `<task-id>.md` 草稿 |
| 噪声过滤 | 聊天记录不直接进入知识库 |
| 人工审核门禁 | ADR / Incident Report 必须人工确认才入库 |
| 检索可回溯 | 新写入内容能被 M3-14 检索到 |

## 5. 不做的事（边界）

- 不做自动知识去重。
- 不做知识版本管理（git 已覆盖）。
