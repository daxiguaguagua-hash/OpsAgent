# 知识库重构收尾记录（M4-PhaseA 分支）

**日期**：2026-06-15
**分支**：`m4-phaseA`
**范围**：ADR 模式落地 + 批次 2（devlog 分流）+ 批次 3（任务卡迁移）+ 收尾清理
**性质**：事后记录（重构发生在 M4 Phase A 已完工之后，是"后来才做的"）

## 关联

- [[0000-adopt-adr|ADR-0000]]：采用 ADR 模式管理知识库
- [[2026-06-14-m4-phaseA-retrospective|M4 Phase A 复盘]]：触发重构的源头
- [[2026-06-14-wiki-structure-blueprint|Wiki 结构蓝图]]：最初的 9 大主题提案（已被 ADR 模式替代）

## 1. 背景（为什么是"后来才改"）

M4 Phase A 的核心交付是 **Sentry 前端错误采集**（commit `ccbd985`，2026-06-14 晚）。Phase A 跑通后，AI 在复盘时识别出"散点式知识库"是项目的一个深层问题——这触发了后续的 ADR 模式引入和大规模重构。

**时间线**：
- 2026-06-14 晚：M4 Phase A 完工（Sentry Dashboard 可见事件）
- 2026-06-14 深夜：ADR-0000 落盘（决定采用 ADR 模式）
- 2026-06-15 凌晨：批次 2（M4 迁移 + 5 篇 devlog 分流为 ADR-0001~0005）
- 2026-06-15 上午：批次 3（M0-M3 任务卡迁移 + 6 篇 M2/M3 devlog 迁移 + lessons 建立）
- 2026-06-15 上午：收尾清理（孤立文件 + acceptance 文件位置标准化 + 引用修复）

**为什么要明确写出"后来才改"**：
1. 避免未来的 AI 误以为 M4 Phase A 包含了知识库重构（其实两者是两件事）
2. 给 git 历史一个清晰的叙事：Phase A 是技术交付，重构是知识治理
3. 方便后续复盘"为什么在 M4 期间做了一件 M4 范围外的事"

## 2. 完整提交清单（按倒序）

```
4123086 docs: 收尾补丁（acceptance 文件移到里程碑根 + 引用更新）
bef5bd5 docs: 清理 docs/ 根目录孤立文件（批次 3 收尾）
bc9d522 docs: 批次 3.4 给 M1/M2/M3 补 planning + retrospective stub
ba4e42a docs: 批次 3.3 补丁（修复失效路径 + README stub）
6f8160d docs: 批次 3.3 迁移 M0/M1/M2/M3 任务卡到 milestones/M{N}/tasks/
330b259 docs: 批次 3.2 处理 2 篇跨里程碑 devlog（迁入 lessons/）
a6cc6db docs: 批次 3.1 迁移 6 篇 M2/M3 devlog（git mv 保留 blame）
f1bad76 docs(lessons): 补充 monorepo env 治理的真实项目洞察 + 面试升级表达
30420c3 docs: 新增 lessons/2026-06-15-monorepo-env-governance.md（经验教训）
b5bd6d4 docs: ADR 批次 2 完成（M4 迁移 + 5 篇 devlog 分流）
3a3d356 chore: 清理 Obsidian vault 状态 + gitignore workspace.json
21e978d docs: ADR 索引补 2 处内部链接改纯 `[[]]`
fb3f24e docs: ADR 模板与试点改用纯 Obsidian `[[]]` 格式
3a004b4 决定使用 Obsidian 的反向链接
941e485 chore: AGENTS.md 格式修正（pre-commit hook 副产物）
ad43a1e docs: ADR 索引完整化 + AGENTS.md 加必读约定 + handoff 交接
779e6ea docs: ADR 模板加反向引用节，建立双向链接纪律
c8ddfc8 docs: M4-PhaseA 复盘 + 知识库重构蓝图 + ADR-0000
39a2ac7 feat(frontend): envDir 指向 monorepo root 读 .env
ccbd985 m4-phaseA 完成（Sentry 框架搭建，DSN 接入）
```

**共 19 个 commit**，1 个技术交付（Sentry Phase A）+ 18 个知识治理。

## 3. 最终 `docs/` 结构

```
docs/
├── README.md              ← 知识库总入口
├── task-breakdown.md      ← 里程碑任务总览
├── team-ownership.md      ← 团队所有权
├── testing-guide.md       ← 通用测试指南
├── codegraph.md           ← CodeGraph 使用指南
│
├── decisions/             ← 6 篇 ADR + 索引（ADR-0000 ~ ADR-0005）
├── milestones/
│   ├── M0/                ← 项目脚手架（8 张任务卡 + acceptance）
│   ├── M1/                ← 技术栈基线（planning + retrospective + 2 张卡 + acceptance）
│   ├── M2/                ← 可观测性（planning + retro + 9 张卡 + acceptance + tempo 测试手册）
│   ├── M3/                ← AI Agent（planning + retro + handoff + closure + verification + 17 张卡）
│   └── M4/                ← 前端错误定位（planning + handoff + retro + tasks/）（进行中）
├── lessons/               ← 3 篇跨里程碑方法论
│   ├── tdd-and-test-governance.md
│   ├── gbrain-rag-and-document-governance.md
│   └── 2026-06-15-monorepo-env-governance.md（含面试表达 3 层次）
├── runbooks/              ← AI Ops Demo 清单
├── workflows/             ← 工作流文档
├── architecture/          ← 架构文档
├── knowledge/             ← 知识库重构蓝图（提案原文，已被 ADR 模式替代）
├── templates/             ← 文档模板
├── archive/               ← 归档
└── issues/                ← 重定向 stub（指向 milestones/M{N}/tasks/）
```

**81 个 .md 文件**，按概念组织，Karpathy wiki 风格 + Obsidian `[[]]` 双向链接。

## 4. 明确未做的事（留给后续会话）

### 4.1 P0：`@opsagent/env` 的 clientEnv schema

M4 Phase A 复盘 §2.1 已识别：`apps/frontend/src/lib/sentry.ts` 直接用 `import.meta.env.VITE_*`，绕过了 `@opsagent/env`。需要给 env 包补 `client.ts`（client schema），让前端走 `clientEnv`。

**决策未定**：是否沿用"中央 env 包"模式，还是采用 Turborepo 模式（每个包独立 schema）。详见 [[2026-06-15-monorepo-env-governance|lessons/monorepo env 治理]]。

### 4.2 P1：M4 Phase B（Source Map 上传 + Sentry Vite 插件）

- 给 `vite.config.ts` 加 `@sentry/vite-plugin`
- 配置 `SENTRY_AUTH_TOKEN`（用户需要在 sentry.io 拿）
- 跑 `pnpm build` 验证 `.map` 上传到 Sentry
- M4-04 任务卡完工

### 4.3 P1：M4 Phase C（Agent sentry-tool）

- 给 `apps/agent` 加 `sentry-tool`（调 Sentry API 拉最近 error event）
- 更新 Agent instructions（分析前端错误时先查 Sentry）
- 端到端验证：前端抛错 → Sentry 捕获 → Agent 调 sentry-tool → 生成 Incident Report
- M4-09 任务卡完工

### 4.4 P2：M3 milestone-acceptance 缺失

M3 已完工（commit `1855138`），但还没写 milestone-acceptance.md。M0/M1/M2 都有 acceptance，M3 缺。建议在 M4 Phase C 完工后补一份（回顾 M3 的成果 + 给 M4 的准入结论）。

### 4.5 P3：task-breakdown.md 任务卡引用全面审计

批次 3.3 用 sed 批量替换了 `issues/M{N}-*` → `milestones/M{N}/tasks/M{N}-*`，但没逐卡验证每个链接都能点开。建议后续会话抽查 5-10 个任务卡的引用正确性。

### 4.6 P3：批次 3 没做"验收测试"

批次 3 的迁移是结构性的（git mv + sed 替换），没做端到端的验收测试（如：用 Obsidian 打开 `docs/` 看所有 backlinks 是否都能点开；用脚本扫描所有 `.md` 文件找死链）。建议后续会话补一次验收。

### 4.7 暂不做：`@opsagent/env` 重构为 Turborepo 模式

项目维护者已有真实项目经验支持 Turborepo 模式（中央 .env 精简 + per-package schema），但当前项目规模还小（5 包），重构 ROI 不高。**等首次出现 env 名字冲突 或 团队扩张到 ≥ 3 人时再启动**。详见 [[2026-06-15-monorepo-env-governance|lessons/monorepo env 治理 §9.5]]。

## 5. 给下一个会话的 AI 的提示词

> 复制下面的内容作为新会话的开场消息：

````markdown
我是 OpsAgent 项目的维护者，当前在 `m4-phaseA` 分支。请严格按以下顺序读完这些文档（用 CodeGraph MCP 或 Read 工具），**不要跳过任何一篇**，读完再开始做任何代码改动：

1. `AGENTS.md`（项目根的 Agent 约束，含必读清单）
2. `docs/decisions/README.md`（ADR 索引，每次会话必读）
3. `docs/decisions/0000-adopt-adr.md`（为什么用 ADR 模式管理知识库）
4. `docs/milestones/M4/planning.md`（M4 的整体规划）
5. `docs/milestones/M4/handoff.md`（M4 的中途交接，含 Phase A 完成状态）
6. `docs/milestones/M4/retrospective.md`（M4 Phase A 的 5 条工程教训）
7. `docs/2026-06-15-knowledge-base-restructure-cleanup.md`（本 devlog，知识库重构的完整记录）
8. `git log --oneline -20`（看最近 20 个提交，理解上下文）

读完后，请：

1. **汇报**：用 3-5 句话总结你理解的"当前 M4 进度 + 下一步该做什么"
2. **不要立即动手**：先和我说清楚你打算做什么，等我拍板
3. **特别注意**：
   - 知识库重构是"后来才做的"（2026-06-15），不在 M4 Phase A 范围内
   - M4 的核心交付是 **前端错误定位闭环**（Sentry 接入 → Source Map 上传 → Agent sentry-tool）
   - Phase A 已完工（commit `ccbd985`），下一步是 **Phase B**（Source Map 上传）
   - `@opsagent/env` 的 clientEnv schema 是 P0（M4 Phase A 复盘 §2.1 识别），但**是否采用 Turborepo 模式**尚未决定，先不要动手
4. **使用 ADR 模式**：任何架构决策都要写 ADR（详见 `docs/decisions/README.md` §3 模板），用 Obsidian `[[]]` 双向链接
5. **CodeGraph 优先**：读代码用 CodeGraph MCP，不要 grep + Read 死磕

读完并汇报后，我会告诉你下一步。
````

## 6. 反思：M4 Phase A 期间做了范围外的事

这次重构的触发点是 **M4 Phase A 复盘时识别出"散点式知识库"问题**。按严格的项目管理纪律，这应该：

1. 在 M4 Phase A 复盘文档里**标记为 P0 待办**
2. 等 M4 Phase A 完全完工后，**开专门的会话**做重构
3. 或者**推迟到 M5**，作为 M5 的"知识库治理"任务

但我们选择了**在 M4 Phase A 的同一分支上连续做完**，理由：
- 重构的"痛感"来自 Phase A，立刻做的 ROI 最高
- 项目还小（81 个 .md 文件），重构成本可控
- 重构后的 ADR 模式能立刻服务于后续里程碑（M4 Phase B/C、M5+）

**风险**：
- 分支 `m4-phaseA` 的名字已经不准确（实际包含大量非 Phase A 的改动）
- 后续 PR review 时，19 个 commit 混杂了技术交付和知识治理，难以分离

**建议后续处理**：
- 给这个分支改名（如 `m4-phaseA-and-knowledge-restructure`），或在 PR 描述里明确分两段说明
- 未来类似情况：先完成里程碑核心交付 → 开专门的"知识治理"分支做重构 → 分别 PR

## 反向引用

暂无（这是收尾记录文档，未来不会被其他文档引用；如果未来有"知识库重构"主题的 ADR，应在 ADR 里反向引用本文件）
