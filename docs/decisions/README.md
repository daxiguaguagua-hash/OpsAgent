# ADR（Architecture Decision Records）索引

> **本文件是项目知识库的核心锚点。每次会话开始时，AI 必须先读本文件，再开始任何代码工作。**
>
> —— 见 [根目录下的 AGENTS.md 文档](../../AGENTS.md) 的"文档阅读顺序"约定。
> 本结构采用的是 卡帕西的wiki 结构，打开双向链接请使用 Obsidian 软件。

---

## 1. 什么是 ADR

ADR（Architecture Decision Record）是记录**架构决策**的轻量级文档模式，由 Michael Nygard 在 2011 年提出。每篇 ADR 记录一个决策的：

- **Context**：为什么需要做这个决策（痛点）
- **Decision**：决定做什么
- **Consequences**：带来的结果（正/负/风险）

详见：[[0000-adopt-adr|ADR-0000（本项目的 ADR 采纳决策）]]

## 2. ADR 列表（按编号排序）

| 编号                                     | 标题                                         | 状态           | 日期         |
| -------------------------------------- | ------------------------------------------ | ------------ | ---------- |
| [[0000-adopt-adr\|0000]]               | 采用 ADR 模式管理知识库                             | `accepted`   | 2026-06-14 |
| [[0001-env-layer-design\|0001]]        | 环境变量默认值由 `@opsagent/env` 单一持有              | `accepted`   | 2026-06-10 |
| [[0002-error-tracking-strategy\|0002]] | 错误监控采用 Prometheus+Loki+Tempo+Sentry 分层栈    | `accepted`   | 2026-06-06 |
| [[0003-zod-schema-governance\|0003]]   | Zod 只在系统边界做运行时校验                           | `accepted`   | 2026-06-10 |
| [[0004-hook-bootstrap-strategy\|0004]] | 工作流门禁采用 shell 先行 + TypeScript 渐进接管         | `deprecated` | 2026-06-05 |
| [[0005-workflow-v2-design\|0005]]      | 测试策略师角色从 Codex 解耦到 claude-code-new-context | `deprecated` | 2026-06-08 |
| [[0006-sentry-release-sourcemap-strategy\|0006]] | Sentry Release 命名与 Source Map 上传策略 | `proposed` | 2026-06-15 |

## 3. ADR 文件模板（强制）

每篇 ADR **必须**包含以下 6 节：

```markdown
# ADR-NNNN: <简短标题>

- **日期**：YYYY-MM-DD
- **状态**：`proposed` / `accepted` / `deprecated` / `superseded by ADR-XXXX`
- **决策者**：<谁参与了决策>
- **关联**：
  - [[XXXX-slug|ADR-XXXX 标题]]
  - [[slug|其他文档 显示名]]
  若暂无，写"暂无"。
  格式说明：项目内文档一律用 Obsidian `[[slug|显示名]]` 语法；仅外部 URL 用 `[text](url)`。

## Context

<为什么需要做这个决策？当前痛点是什么？>

## Decision

<决定做什么？>

## Consequences

<这个决策带来的结果是什么？正面/负面都要写。>

## 反向引用

<哪些文档提到了本篇 ADR？每次新建文档引用本篇时，必须同步在这里追加一条。
格式（纯 Obsidian `[[]]`）：

- [[slug|显示名]]：<引用上下文>
  示例：
- [[2026-06-14-m4-phaseA-retrospective|M4 复盘]]：§2.1
- [[env|env 包手册]]：§设计原则
  若暂无，写"暂无"。>
```

## 4. 双向链接纪律（核心规则）

**每篇文档**（不限于 ADR）都要在文末维护两节。项目内文档链接**一律用 Obsidian `[[]]` 语法**；仅外部 URL（如博客、论文、官方文档）用 markdown `[]()`。

### `**关联**`（前向链接，写在文档顶部元数据区）

- 我依赖了哪些文档
- 我参考了哪些 ADR / 教训 / 包手册
- 格式：`[[slug|显示名]]`

### `## 反向引用`（后向链接，写在文档底部）

- 哪些文档提到了我
- 格式：`- [[slug|显示名]]：<引用上下文>`
- **每次新建文档引用本篇时，必须同步在被引用文档的反向引用区追加一条**

### 为什么纯 `[[]]`（不是双写，也不是纯 `[]()`）

- **Obsidian 是项目知识库的规范阅读器**：用 Obsidian 打开 `docs/` 才能看到完整的 backlinks 视图
- 双写会让文档显得臃肿（每条链接重复两次）
- 纯 `[]()` 没有反向链接能力
- GitHub / VS Code 预览虽然不渲染 `[[]]`，但**原始文本仍可阅读**；真正需要点击跳转的场景都在 Obsidian 里完成

## 5. 命名规则

- **目录**：`docs/decisions/`（ADR 专属，不混其他内容）
- **文件名**：`NNNN-<kebab-slug>.md`（4 位编号 + 短横线分隔的英文 slug）
- **编号**：从 `0000` 开始，顺序递增，不跳号
- **状态取值**：
  - `proposed`：讨论中，未决定
  - `accepted`：已决定，执行中
  - `deprecated`：已废弃，被新方案替代（必须写明"superseded by ADR-XXXX"）
  - `superseded by ADR-XXXX`：被新 ADR 替代

## 6. 工作流

### 新建 ADR 时

1. 找当前最大编号 N，新编号 = N+1
2. 用上面模板创建 `docs/decisions/NNNN-<slug>.md`
3. 在本文件 §2 的表格追加一行
4. 如果引用了其他 ADR / 文档，去那些文档的 `## 反向引用` 区追加一条

### 修改 ADR 时

- 状态变更：更新 `**状态**` 字段
- 内容变更：保持原结构，不破坏反向引用链

### 引用 ADR 时

- 其他文档写 `详见 ADR-NNNN（<标题>）` 或 `[ADR-NNNN](../decisions/NNNN-<slug>.md)`
- **必须**在被引用 ADR 的 `## 反向引用` 区追加一条

## 7. 与项目其他文档的关系

| 文档类型       | 位置                                    | 与 ADR 的关系                   |
| -------------- | --------------------------------------- | ------------------------------- |
| **AGENTS.md**  | 项目根                                  | 必读约定，指向本 README         |
| **CLAUDE.md**  | 项目根                                  | 项目全貌，引用 ADR 但不重复     |
| **任务卡**     | `docs/issues/M{N}-*.md`                 | 实施细节，引用 ADR 作为决策依据 |
| **里程碑复盘** | `docs/milestones/M{N}/retrospective.md` | 教训可能沉淀为新 ADR            |
| **包手册**     | `docs/packages/*.md`                    | 实现细节，引用 ADR 作为设计依据 |
| **教训文档**   | `docs/lessons/*.md`                     | 跨里程碑通用教训，可能催生 ADR  |

## 8. 验收检查清单（每篇 ADR 提交前过一遍）

- [ ] 6 节结构完整（Context / Decision / Consequences / 反向引用）
- [ ] `**关联**` 字段列出了所有依赖的文档
- [ ] `## 反向引用` 字段已初始化（即使写"暂无"）
- [ ] 文件名符合 `NNNN-<slug>.md` 规则
- [ ] 本文件 §2 的表格已更新
- [ ] 所有被引用的文档，其 `## 反向引用` 区已追加本 ADR 的条目
- [ ] 状态字段为 `proposed` 或 `accepted`（不允许空白）

## 9. 反模式（不要做的事）

- ❌ **不要预创建空 ADR**：编号是"已有决策"的标记，不是占位符
- ❌ **不要在 ADR 里写实施细节**：实施属于任务卡 / 包手册
- ❌ **不要省略 Consequences 的负面/风险**：ADR 的价值在于"全面评估"，不是"为决策辩护"
- ❌ **不要在 devlog 里写决策**：决策必须进 ADR，devlog 是流水账（已被分流）
- ❌ **不要依赖自动化工具生成反向引用**：手动维护是思考过程，不是负担
- ❌ **不要跳过本 README 的 §2 表格更新**：这是全项目 ADR 的唯一索引

## 10. 边界与检索权重

- 每条 ADR 一经 `accepted`，视为稳定知识，不轻改
- 被取代时改为 `superseded by ADR-<n>` 并新建一条 ADR
- 草案阶段在 `docs/devlog/` 讨论，定型后再进 `docs/decisions/`
- **检索权重**：高 — GBrain 把本目录视为权威决策来源

## 11. 历史与迁移

### 已完成的迁移

- 2026-06-14：ADR-0000 落盘，确立 ADR 模式（替代原散点式 devlog 模式）
- 2026-06-14：ADR 模板加反向引用节（双向链接纪律）

### 待执行的迁移（批次 2）

- [ ] M4 相关文档迁到 `docs/milestones/M4/`：
  - `docs/issues/M4-planning.md` → `docs/milestones/M4/planning.md`
  - `docs/devlog/2026-06-14-m4-handoff.md` → `docs/milestones/M4/handoff.md`
  - `docs/devlog/2026-06-14-m4-phaseA-retrospective.md` → `docs/milestones/M4/retrospective.md`
- [ ] 5 篇高价值 devlog 分流为 ADR：
  - `2026-06-10-env-default-ownership.md` → `decisions/0001-env-layer-design.md`
  - `2026-06-06-observability-and-sentry.md` → `decisions/0002-error-tracking-strategy.md`
  - `2026-06-10-zod-usage-audit.md` → `decisions/0003-zod-schema-governance.md`
  - `2026-06-05-hook-bootstrap-decision.md` → `decisions/0004-hook-bootstrap-strategy.md`
  - `2026-06-08-workflow-system-audit.md` → `decisions/0005-workflow-v2-design.md`
- [ ] 分流后的 devlog 原文件删除（git 历史保留）
- [ ] `AGENTS.md` / `CLAUDE.md` 中的 `docs/devlog/` 引用全部更新

详见：`docs/devlog/2026-06-14-m4-handoff.md`（交接事项段）
