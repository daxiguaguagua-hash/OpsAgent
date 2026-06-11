# M3-08 Incident Report 模板

日期：2026-06-11
状态：`done`
前置任务：M3-04 / M3-05 / M3-06
负责人：docs-team

## 1. 目标

定义一份可被 Agent 填充、可被人类审核的 Incident Report Markdown 模板。模板字段与 M3-10 故障生命周期对齐。

## 2. 模板骨架

```markdown
# Incident Report: <incident-id>

## 1. 摘要
- **发现时间**：<ISO 8601>
- **影响范围**：<service / route / user-facing>
- **严重等级**：P0 / P1 / P2
- **缓解状态**：已缓解 / 未缓解

## 2. 证据
### 2.1 指标（M3-04 Prometheus Tool）
<查询语句与结果摘要>

### 2.2 日志（M3-05 Loki Tool）
<关键错误日志原文>

### 2.3 链路（M3-06 Trace Tool）
<span 树摘要与慢 span>

### 2.4 源码上下文（M3-07 Git Context Tool）
<最近 commit 与相关文件>

## 3. 根因分析
<基于证据的根因推理>

## 4. 建议
- 短期缓解：...
- 长期修复：...

## 5. 人类审核
- [ ] 审核人：
- [ ] 审核结论：采纳 / 部分采纳 / 不采纳
- [ ] 审核意见：
```

## 3. 交付物

| 文件 | 说明 |
|---|---|
| `docs/templates/incident-report.md` | 模板原文 |
| `docs/templates/incident-report.schema.json` | 字段 schema，供 Agent 输出校验 |

## 4. 验收标准

| 验收项 | 标准 |
|---|---|
| 字段完整 | 摘要、证据、根因、建议、审核五段齐全 |
| 可被 Agent 填充 | schema 与 Agent 输出结构对齐 |
| 可被人类审核 | 包含显式审核 checkbox |

## 5. 不做的事（边界）

- 不实现 PDF/HTML 渲染（保持 Markdown）。
- 不做审核工作流（M6 或手动流程）。
