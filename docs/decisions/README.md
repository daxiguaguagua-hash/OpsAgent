# Decisions（架构决策记录，ADR）

本目录收纳项目的 Architecture Decision Records（架构决策记录，ADR）。
每条 ADR 记录一次决策的背景、选项、结论与理由，作为团队长期共识。

## 当前文档

（暂无；首条 ADR 将在 M3-13 之后产生。）

## ADR 模板

```markdown
# ADR-<编号>: <标题>

- **状态**：`proposed` / `accepted` / `deprecated` / `superseded`
- **日期**：<YYYY-MM-DD>
- **作者**：<team>

## Context（背景）

<为什么需要这条决策>

## Options（候选方案）

- A：
- B：
- C：

## Decision（结论）

<选择哪个方案，理由是什么>

## Consequences（后果）

<采用后会带来哪些变化>
```

## 边界

- 每条 ADR 一经 accepted，视为稳定知识，不轻改。
- 被取代时改为 `superseded by ADR-<n>` 并新建一条 ADR。
- 草案阶段放在 `docs/devlog/` 讨论。

## 检索权重

高 — GBrain 把本目录视为权威决策来源。
