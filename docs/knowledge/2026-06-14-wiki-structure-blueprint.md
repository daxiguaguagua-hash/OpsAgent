# 知识库设计缺陷与 Wiki 结构蓝图

日期：2026-06-14
状态：`draft`（提案阶段，待团队讨论）
负责人：docs-team
关联：`docs/devlog/2026-06-14-m4-phaseA-retrospective.md` §3

---

## 1. 现状盘点：散点式知识库

```
docs/
├── AI-Ops-Demo-清单.md         ← 产品 demo 清单（孤立）
├── M2-06-tempo-testing-guide.md ← 测试指南（孤立，应在 testing/ 下）
├── architecture/
│   ├── README.md               ← 空目录占位
│   └── architecture-v3-candidacy.md
├── decisions/
│   └── README.md               ← 空目录，应该有 ADR
├── devlog/                     ← 成了"垃圾桶"，10+ 篇流水账
│   ├── 2026-06-05-hook-bootstrap-decision.md
│   ├── 2026-06-06-observability-and-sentry.md
│   ├── 2026-06-10-env-default-ownership.md
│   ├── 2026-06-14-m4-handoff.md
│   └── ...
├── issues/                     ← 任务卡（按里程碑组织，结构合理）
│   ├── M0-*.md
│   ├── M1-*.md
│   └── ...
├── knowledge/
│   └── README.md               ← 空目录，应该有手册
├── templates/
├── workflows/
├── task-breakdown.md
├── team-ownership.md
└── testing-guide.md            ← 测试指南（孤立）
```

### 1.1 三类问题

| 类型 | 例子 | 影响 |
|---|---|---|
| **空目录** | `decisions/`、`knowledge/` | 约定俗成的"知识归口"没启用，内容全挤到 `devlog/` |
| **孤立文件** | `M2-06-tempo-testing-guide.md`、`testing-guide.md` | 同一个主题（测试）分散两处，人/AI 都难发现 |
| **垃圾桶化** | `devlog/` 塞了 10+ 篇不同主题（hook、env、observability、TDD、workflow、gbrain…） | 按"哪天写的"组织，不按"讲什么"组织，查"env 怎么管"要翻 10+ 篇 |

### 1.2 对 AI 的具体影响

M4-Phase-A 复盘中已经看到：

- AI 写 `sentry.ts` 时直接用 `import.meta.env.VITE_SENTRY_DSN`，绕过了 `@opsagent/env`
- 如果 `docs/knowledge/env-layer.md` 存在并写明"前端也走 `@opsagent/env`，用 `clientEnv`"，AI 会在动手前看到
- CodeGraph 能告诉 AI "`env` 符号在哪"，但不能告诉 AI"env **应该**怎么用"——后者是元知识，必须靠文档

## 2. CodeGraph 解决什么、不解决什么

| 维度 | CodeGraph 能 | CodeGraph 不能 |
|---|---|---|
| **代码符号定位** | ✅ `env` 在 `packages/env/src/index.ts` | — |
| **调用链追踪** | ✅ 谁调了 `env.DATABASE_URL` | — |
| **架构决策** | — | ❌ 为什么不用 MinIO |
| **踩坑教训** | — | ❌ 临时脚本不该污染根目录 |
| **框架约束** | — | ❌ 前后端 env 都要走 `@opsagent/env` |
| **未来规划** | — | ❌ GlitchTip 接入时机 |
| **设计原则** | — | ❌ 三层方案切换机制 |

**结论**：CodeGraph 是"代码索引"，不是"知识库"。两者必须并存。

## 3. Confluence/Notion 风格蓝图

### 3.1 推荐目录结构

```
docs/
├── README.md                              ← 总入口（给 AI 和人都看）
│
├── 00-quickstart/                         ← 上手指南
│   ├── README.md
│   ├── getting-started.md                 ← 首次运行
│   └── dev-workflow.md                    ← 日常开发流
│
├── 01-architecture/                       ← 架构决策
│   ├── README.md
│   ├── overview.md                        ← 全景图
│   ├── monorepo-structure.md              ← 为什么是 pnpm workspace + catalog
│   ├── env-layer.md                       ← @opsagent/env 设计 + 前后端用法
│   ├── error-tracking-strategy.md         ← Sentry / GlitchTip / 自研三层方案
│   └── observability-stack.md             ← Grafana + Prometheus + Loki + Tempo
│
├── 02-conventions/                        ← 开发约定（强制）
│   ├── README.md
│   ├── code-style.md                      ← ESM only / 扩展名 / import 规则
│   ├── string-literal-governance.md       ← 禁止硬编码领域字符串
│   ├── env-access-rules.md                ← 前后端 env 必须走 @opsagent/env
│   └── testing-rules.md                   ← node:test + 中文断言 + FIXTURE_
│
├── 03-packages/                           ← 每个包一个手册页
│   ├── README.md
│   ├── env.md
│   ├── db.md
│   ├── workflow-gates.md
│   ├── shared.md
│   └── api.md
│
├── 04-apps/                               ← 每个 app 一个手册页
│   ├── README.md
│   ├── frontend.md
│   ├── backend.md
│   └── agent.md
│
├── 05-infrastructure/                     ← 基础设施
│   ├── README.md
│   ├── docker-compose.md
│   ├── glitchtip-setup.md
│   └── grafana-dashboards.md
│
├── 06-operations/                         ← 运维手册
│   ├── README.md
│   ├── troubleshooting.md
│   └── runbooks/
│
├── 07-milestones/                         ← 里程碑规划（现有 issues/ 迁移过来）
│   ├── README.md
│   ├── M0/
│   │   ├── planning.md
│   │   ├── tasks/                         ← 任务卡
│   │   └── retrospective.md               ← 里程碑复盘
│   ├── M1/ ...
│   ├── M4/
│   │   ├── planning.md                    ← 现 docs/issues/M4-planning.md
│   │   ├── phase-A-retrospective.md       ← 现 docs/devlog/2026-06-14-...md
│   │   ├── tasks/
│   │   └── lessons-learned.md             ← 教训汇总（持续更新）
│   └── ...
│
├── 08-lessons/                            ← 教训独立归档（跨里程碑）
│   ├── README.md
│   ├── 2026-06-14-temp-script-pollution.md
│   ├── 2026-06-14-dsn-hardcoding.md
│   └── 2026-06-14-env-bypass.md
│
└── 09-meta/                               ← 知识库自身的元文档
    ├── README.md
    ├── knowledge-base-design.md           ← 本文档
    └── how-to-write-docs.md               ← 文档撰写规范
```

### 3.2 三大改进点

**① 把"决策"从 devlog 里捞出来，提到 `01-architecture/`**

现在 `devlog/2026-06-06-observability-and-sentry.md` 里的决策，本质是架构决策，应该在 `01-architecture/error-tracking-strategy.md`。

**② 教训和里程碑绑定，但也能跨里程碑聚合**

- `07-milestones/M4/lessons-learned.md`：M4 专属教训（上下文完整）
- `08-lessons/`：跨里程碑的通用教训（AI 一次读完就能避所有坑）

**③ 给 gbrain 一个"概念入口"**

现在 gbrain 只能索引文件名（`2026-06-10-env-default-ownership.md`），AI 不知道"env 所有权"是个概念。重构后 gbrain 可以按 `01-architecture/env-layer.md` 这种**语义化路径**索引，命中率显著提升。

## 4. 迁移路径（渐进式，不阻塞开发）

### 4.1 第一批（M4 期间完成）

- [ ] 新建 `01-architecture/env-layer.md`：把 `@opsagent/env` 的设计写清楚（前后端都走它、`clientEnv` schema、`import.meta.env` 的例外情况）
- [ ] 新建 `02-conventions/env-access-rules.md`：明确"前端也走 `@opsagent/env`"
- [ ] 把 `docs/issues/M4-planning.md` 迁到 `07-milestones/M4/planning.md`
- [ ] 把本次复盘 `docs/devlog/2026-06-14-m4-phaseA-retrospective.md` 迁到 `07-milestones/M4/phase-A-retrospective.md`

### 4.2 第二批（M5 前）

- [ ] 把 `docs/devlog/` 里的历史决策按主题分流到 `01-architecture/`、`02-conventions/`、`08-lessons/`
- [ ] 建立 `docs/README.md` 作为总入口（AI 进 docs/ 时必读）
- [ ] 给 gbrain 配置"按目录索引"的规则

### 4.3 第三批（M6）

- [ ] 把 `AGENTS.md` 和 `CLAUDE.md` 的"代码探索"章节指向 `docs/01-architecture/` 的具体文件
- [ ] 把 `docs/knowledge/` 目录彻底清空（内容已分流到各主题目录）
- [ ] 写 `09-meta/how-to-write-docs.md`：规定以后新增文档必须放对目录

## 5. AI 协作场景下的具体收益

| 场景 | 当前 | 重构后 |
|---|---|---|
| AI 接手新里程碑 | 翻 10+ 篇 devlog 找线索 | 直接读 `07-milestones/M{N}/planning.md`，上下文完整 |
| AI 做 env 相关改动 | 不知道有 `@opsagent/env`，绕过它 | 读 `01-architecture/env-layer.md`，自然走 `clientEnv` |
| AI 做 Sentry 相关改动 | 不知道三层方案，可能直接写死 Sentry | 读 `01-architecture/error-tracking-strategy.md`，保留 GlitchTip/custom 切换能力 |
| AI 写验证脚本 | 不知道"别污染根目录"，在根目录创建 | 读 `08-lessons/2026-06-14-temp-script-pollution.md`，放 `/tmp/` |
| 新人 onboarding | 没人带就看不懂项目 | 读 `00-quickstart/getting-started.md` + `01-architecture/overview.md` 自通 |

## 6. 讨论项（待团队共识）

1. **是否真的迁移 `docs/issues/` 到 `07-milestones/`**：迁移成本低，但会破坏现有 commit 历史的可追溯性。或者保留 `issues/`，只把 `devlog/` 分流。
2. **`08-lessons/` 是否独立成目录**：教训也可以只放在对应里程碑下（如 `M4/lessons-learned.md`），不单独拎出来。但跨里程碑的"通用教训"就没地方聚合。
3. **gbrain 索引策略是否配合重构**：如果 gbrain 按文件名索引，重构后语义化路径对它没用；需要先确认 gbrain 支持目录语义索引。
4. **历史 devlog 是否保留**：分流后原 `devlog/*.md` 是删掉、还是保留作为"历史记录"？倾向：删掉（避免双源），重要内容全部迁到新位置。
5. **命名规则**：目录前缀 `01-`、`02-` 是否保留？好处是强制排序，坏处是加新目录时要重排。倾向：保留（Confluence 也这么做）。

## 7. 与 CodeGraph 的互补

重构后：

```
代码理解      → CodeGraph（符号、调用链、影响分析）
概念理解      → 树形 wiki（架构、约定、教训）
任务跟踪      → issues/（保持现有结构不变）
历史追溯      → git log（已有）
```

四者各司其职，不重叠、不遗漏。当前缺的就是"概念理解"这一层——本提案的核心价值。

## 8. 验收标准

当以下条件全部满足时，本次重构视为完成：

- [ ] `docs/README.md` 存在，作为总入口
- [ ] `docs/devlog/` 里的历史决策 100% 分流到对应主题目录
- [ ] `@opsagent/env` 的设计有独立文档（`01-architecture/env-layer.md`）
- [ ] "前后端 env 都走 `@opsagent/env`" 有独立约定文档（`02-conventions/env-access-rules.md`）
- [ ] M4 复盘文档在 `07-milestones/M4/phase-A-retrospective.md`
- [ ] gbrain 能按新目录结构索引（需要 gbrain 侧配合）
- [ ] AI 接手 M5 时，能直接从 `docs/README.md` 出发，3 分钟内定位到所需上下文

## 反向引用

- `docs/decisions/0000-adopt-adr.md`（采用 ADR 模式）：在 `Context` 节作为提案原文被引用；在 `Decision` 节作为决策依据被引用
