# ADR-0000: 采用 ADR 模式管理知识库

- **日期**：2026-06-14
- **状态**：`accepted`
- **决策者**：项目维护者 + AI agent
- **关联**：`docs/knowledge/2026-06-14-wiki-structure-blueprint.md`（提案原文）

## Context

项目 `docs/` 当前是**散点式知识库**：
- `devlog/` 成了垃圾桶（10+ 篇不同主题混在一起）
- `decisions/` 和 `knowledge/` 目录存在但基本空（只有 README）
- AI 和人都无法按"概念"定位知识（只能按"哪天写的"）
- CodeGraph 是代码符号索引，不解决"概念可发现性"问题
- 已经造成实际损失：AI 绕过 `@opsagent/env`、DSN 硬编码、探针污染根目录

详见：`docs/devlog/2026-06-14-m4-phaseA-retrospective.md`

## Decision

采用 **ADR（Architecture Decision Records）模式** 作为知识库组织原则，结合 Karpathy LLM Wiki 的扁平精神：

### 目录结构

```
docs/
├── README.md                ← 总入口（AI 和人都从这里开始）
│
├── decisions/               ← ADR（关键决策，永久保留）
│   ├── README.md            ← 索引（按编号列出所有 ADR）
│   └── NNNN-<kebab-slug>.md ← 每篇自包含
│
├── milestones/              ← 里程碑归档（任务卡 + 交接 + 复盘）
│   └── M{N}/
│       ├── planning.md
│       ├── tasks/
│       ├── handoff.md
│       ├── retrospective.md
│       └── lessons.md
│
├── lessons/                 ← 跨里程碑的通用教训
│   └── NNNN-<kebab-slug>.md
│
├── packages/                ← 每个包一个手册页
│   └── <package-name>.md
│
└── runbooks/                ← 运维手册
    └── <topic>.md
```

### 设计原则

1. **扁平**：目录只一层深度，不嵌套（Karpathy 主张）
2. **描述性文件名**：靠文件名自带上下文
3. **自包含**：每篇能独立被读懂，不依赖"先读 A 再读 B"
4. **散文式写作**：有"为什么"不只是"是什么"（不是 bullet point 堆砌）
5. **编号前缀**：`decisions/` 和 `lessons/` 用 `NNNN-` 前缀，强制时间排序

### ADR 文件模板

每篇 ADR 必须包含：

```markdown
# ADR-NNNN: <简短标题>

- **日期**：YYYY-MM-DD
- **状态**：`proposed` / `accepted` / `deprecated` / `superseded by ADR-XXXX`
- **决策者**：<谁参与了决策>
- **关联**：<相关 ADR / 文档 / 任务卡>

## Context
<为什么需要做这个决策？当前痛点是什么？>

## Decision
<决定做什么？>

## Consequences
<这个决策带来的结果是什么？正面/负面都要写。>
```

## Consequences

### 正面

- **概念可发现**：AI 和人能按"主题"而不是"日期"定位知识
- **决策可追溯**：每个架构决策都有独立记录，新人/AI 能理解"为什么这样设计"
- **面试价值**：讲"我们用 ADR 管理架构决策"比"我们用 devlog 记东西"专业得多
- **成本可控**：5 个顶级目录，符合小型项目体量
- **行业标准**：ADR 是 Michael Nygard 2011 年提出的经典模式，Confluence/Notion 都支持

### 负面

- **迁移成本**：14 篇 devlog 需要分流、改写、删除（预计 2-3 个工作会话）
- **引用更新**：`AGENTS.md`、`CLAUDE.md`、`task-breakdown.md`、`taskCli.ts` 都要同步更新路径
- **git 历史**：用 `git mv` 保留 blame，但 blame 链会在删除处断裂
- **纪律成本**：每次新决策都要写 ADR，比随手写 devlog 更费时

### 风险

- **过度工程**：可能不自觉加太多目录（坚守 5 个顶级目录上限）
- **预创建空目录**：违反 Karpathy 扁平精神（新目录必须有内容才能建）
- **分流质量参差**：历史 devlog 改写为自包含散文需要投入（不能只摘抄要点）

## 执行计划（分三批）

### 批次 1（本次会话已完成）

- ✅ 写 ADR-0000（本文件）
- ✅ 写 `docs/devlog/2026-06-14-m4-phaseA-retrospective.md`（教训汇总）
- ✅ 写 `docs/knowledge/2026-06-14-wiki-structure-blueprint.md`（提案原文，待迁移）

### 批次 2（下次会话）

- [ ] 创建 `docs/README.md` 作为总入口
- [ ] 创建 `docs/decisions/README.md` 索引
- [ ] 把 M4 相关文档迁到 `docs/milestones/M4/`：
  - `docs/issues/M4-planning.md` → `docs/milestones/M4/planning.md`
  - `docs/devlog/2026-06-14-m4-handoff.md` → `docs/milestones/M4/handoff.md`
  - `docs/devlog/2026-06-14-m4-phaseA-retrospective.md` → `docs/milestones/M4/retrospective.md`
- [ ] 分流 5 篇高价值 devlog 到 ADR：
  - `2026-06-10-env-default-ownership.md` → `decisions/0001-env-layer-design.md`
  - `2026-06-06-observability-and-sentry.md` → `decisions/0002-error-tracking-strategy.md`
  - `2026-06-10-zod-usage-audit.md` → `decisions/0003-zod-schema-governance.md`
  - `2026-06-05-hook-bootstrap-decision.md` → `decisions/0004-hook-bootstrap-strategy.md`
  - `2026-06-08-workflow-system-audit.md` → `decisions/0005-workflow-v2-design.md`
- [ ] 分流后的 devlog 原文件删除
- [ ] 更新 `AGENTS.md` / `CLAUDE.md` 中的路径引用

### 批次 3（再下次）

- [ ] M0-M3 任务卡迁移到 `docs/milestones/M{N}/tasks/`
- [ ] 剩余 devlog（M2/M3 交接文档）迁到对应里程碑
- [ ] 写 `docs/packages/env.md`（首个包手册）
- [ ] 写 `docs/packages/workflow-gates.md`
- [ ] 评估是否需要 `docs/lessons/` 目录（如果教训不足 3 篇可暂缓）

## 验收标准

批次 2 完成时：

- [ ] `docs/README.md` 存在，作为总入口
- [ ] `docs/decisions/README.md` 存在，列出 5 篇 ADR
- [ ] `docs/milestones/M4/` 完整（planning + handoff + retrospective）
- [ ] 5 篇高价值 devlog 已分流为 ADR（不是摘抄，是改写为自包含散文）
- [ ] `AGENTS.md` / `CLAUDE.md` 中的 `docs/devlog/` 引用全部更新
- [ ] 分流后的 devlog 原文件已删除（git 历史保留）
- [ ] AI 接手 M5 时，能从 `docs/README.md` 出发，3 分钟内定位到所需上下文

批次 3 完成时：

- [ ] `docs/issues/` 清空（内容迁到 `milestones/`）
- [ ] `docs/devlog/` 清空（内容已分流或删除）
- [ ] 至少 2 个 `docs/packages/*.md` 存在
- [ ] gbrain 能按新目录结构索引（需要 gbrain 侧配合）

## 参考

- Michael Nygard, "Documenting architecture decisions", 2011-11-15
- [Karpathy LLM Wiki Pattern](https://www.mindstudio.ai/blog/karpathy-llm-wiki-knowledge-base-pattern/)
- [给 AI 一张地图，而不是一本手册——AGENTS.md 内容策略完全指南](https://blog.csdn.net/ID314846818/article/details/161839666)
