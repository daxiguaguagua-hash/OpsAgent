# M3-16 RAG Evaluation 与引用审计

日期：2026-06-10
状态：`planned`
前置任务：M3-14 / M3-15
负责人：qa-team + ai-agent-team

## 1. 目标

建立一套可复现的检索评估机制，验证 GBrain 对中文项目文档的召回质量，并对 Agent 报告中的每条引用做来源审计，防止"幻觉引用"。

## 2. 评估维度

| 维度 | 度量 |
|---|---|
| 命中率（Hit Rate） | 给定问题集，top-K 中包含相关文档的比例 |
| 来源引用（Citation） | Agent 报告中的每条结论都标注 `sourceId` |
| 可复现性 | 同一 query + 同一索引状态 → 相同结果 |

## 3. 交付物

| 文件 | 说明 |
|---|---|
| `apps/agent/src/rag/eval/questions.json` | 项目问题集（中文，覆盖架构/决策/故障） |
| `apps/agent/src/rag/eval/run-eval.ts` | 评估脚本 |
| `apps/agent/src/rag/citation-audit.ts` | 引用审计逻辑 |
| `apps/agent/src/rag/eval.test.ts` | 覆盖评估与审计 |

## 4. 验收标准

| 验收项 | 标准 |
|---|---|
| 问题集规模 | ≥ 20 条中文问题，覆盖 3 类文档 |
| 评估可跑 | `pnpm --filter @opsagent/agent gbrain:eval` 输出命中率 |
| 引用审计 | Agent 报告每条结论都有 `sourceId`，不存在的 sourceId 被标记 |
| 可复现 | 固定种子下两次运行结果一致 |

## 5. 不做的事（边界）

- 不做在线持续评估（仅离线跑）。
- 不做模型层优化（只评估检索层）。
