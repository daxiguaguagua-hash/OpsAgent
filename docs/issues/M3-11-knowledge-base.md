# M3-11 整理 Agent Knowledge Base 文档

日期：2026-06-10
状态：`planned`
前置任务：M2 验收
负责人：docs-team + ai-agent-team

## 1. 目标

将项目现有文档按"稳定知识 / 过程记录 / 历史归档"三层边界重新梳理，使后续 GBrain RAG 检索时不会把过期的工作流草案或 devlog 当作权威知识返回。

## 2. 目录边界

| 目录 | 内容 | 检索权重 |
|---|---|---|
| `docs/architecture/` | 已冻结的架构决策 | 高 |
| `docs/decisions/` | ADR（架构决策记录） | 高 |
| `docs/knowledge/` | 稳定技术知识（教学用） | 中 |
| `docs/devlog/` | 过程记录与探索笔记 | 低，仅做时间回溯 |
| `docs/issues/` | 任务卡（事实来源） | 由 PostgreSQL 任务表替代 |
| `docs/workflows/` | 当前生效的工作流 | 高 |
| `docs/archive/` | 已废弃的方案草案 | 不检索 |

## 3. 交付物

| 文件 | 说明 |
|---|---|
| `docs/architecture/README.md` | 架构文档索引 |
| `docs/decisions/README.md` | ADR 索引 |
| `docs/knowledge/README.md` | 稳定知识索引 |
| 归档迁移 | 将 `workflow-v2-design.md` 等过期草案移入 `docs/archive/` |

## 4. 验收标准

| 验收项 | 标准 |
|---|---|
| 目录存在 | 上述 6 个目录均存在并有 README |
| 过期文档归档 | `workflow-v2-*` 等草案不再出现在默认检索路径 |
| 索引明确 | 每个 README 列出该目录下文档清单 |

## 5. 不做的事（边界）

- 不做文档全文检索（M3-12 / M3-13）。
- 不重写文档内容（仅迁移与补 README）。
