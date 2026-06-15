# M4 Phase A 复盘：Sentry 接入教训

日期：2026-06-14
状态：`done`（提交 `ccbd985`）
负责人：ai-agent-team + frontend-team
关联里程碑：M4-Phase-A（前端错误采集）

---

## 1. 执行结果

Phase A 跑通了 Sentry SaaS 端到端：Vite 构建生成 source map → SDK 初始化 → 事件上报 → Sentry Dashboard 可见 Issue。但过程中暴露了**工程规范**和**知识管理**两类问题，后者影响更深远。

## 2. 工程规范类教训（5 条）

### 2.1 环境变量绕过了 `@opsagent/env`

**现象**：`apps/frontend/src/lib/sentry.ts` 直接用 `import.meta.env.VITE_SENTRY_DSN`，没走 `@opsagent/env`。

**问题**：
- 失去 Zod schema 校验（DSN 写错不会在启动时报错）
- 破坏了 AGENTS.md 的"禁止领域字符串硬编码"精神（env 键名是典型的"跨模块复用字符串"）
- `VITE_ERROR_TRACKING_PROVIDER` 用 enum 约束（sentry / glitchtip / custom）时，硬编码字符串容易打错

**根因**：`@opsagent/env` 目前只有 `server` 端 schema，**没有暴露 client 端 schema**，前端没有"统一拿 env"的入口。

**修复方向**：
- 给 `packages/env/src/` 新增 `client.ts`，用 `createEnv({ clientPrefix: "VITE_", client: {...}, runtimeEnv: import.meta.env })` 暴露 `clientEnv`
- 前端代码统一 `import { clientEnv } from "@opsagent/env"`，禁止直接用 `import.meta.env.VITE_*`
- `import.meta.env.MODE` / `DEV` / `PROD` 这类 Vite 内建状态量除外

**行动项**：给 `@opsagent/env` 补 `clientEnv` schema（P0，待建 ADR）

### 2.2 临时探针脚本污染根目录

**现象**：为了验证 Sentry ingest 可达，在根目录创建了 `_sentry_probe.mjs`。

**问题**：
- 根目录是项目源码区，不该被一次性脚本污染
- 文件用了 `.mjs` 后缀，但项目是 ESM-only（`"type": "module"`），后缀多余
- 第一次 `rm` 在 zsh 下 `no matches found` 不报错，导致没真删干净（幸好第二次发现并清理）

**正确做法**：
- 临时验证脚本一律放 `/tmp/`，不进项目
- 跑完立即删除，并在 commit 前 `git status` 确认无残留
- 优先用 `curl` / 浏览器 DevTools 等"无侵入"方式验证

### 2.3 DSN 硬编码进探针文件

**现象**：`_sentry_probe.mjs` 里把 Sentry DSN 字符串直接写死。

**问题**：
- 安全：即使 `.env` 在 `.gitignore`，探针文件如果在 git 未追踪前被截屏 / IDE 历史 / 共享，DSN 就泄了（攻击者能用它往项目灌水事件打爆配额）
- DRY：DSN 出现两处，未来换 DSN 容易漏改

**正确做法**：
- 用 `dotenv/config` preload + `process.env.VITE_SENTRY_DSN`
- 或通过 shell 注入：`VITE_SENTRY_DSN=$(grep '^VITE_SENTRY_DSN=' .env | cut -d= -f2) node -e "..."`
- 最根本的：根本不该写探针（`curl` ingest 端点就够了）

### 2.4 `@sentry/node` 没被 pnpm 链接到根 `node_modules`

**现象**：根 `package.json` 声明了 `@sentry/node: "catalog:"`，但 `node_modules/@sentry/` 下只有 `react` 和 `vite-plugin`，没有 `node`。

**问题**：根代码里直接 `import "@sentry/node"` 会报 `MODULE_NOT_FOUND`，必须用 `createRequire` 绕过。

**根因**：从 `apps/backend/package.json` 移除 `@sentry/node` 时，pnpm 顺带清理了根目录的链接（因为那时根也声明了它，但 pnpm 认为没有实际依赖方）。

**修复方向**：
- 如果根真的要用 `@sentry/node`（比如未来写共享工具包），需要在 `packages/*` 里至少有一个包声明依赖
- 否则根 `package.json` 不该声明 `@sentry/node`，只在 `apps/backend/package.json` 里声明

### 2.5 没用 CodeGraph 先查 `@opsagent/env` 设计

**现象**：开始写 `sentry.ts` 前没查"环境变量怎么管理"，导致直接用 `import.meta.env`。

**问题**：AGENTS.md 明确说"修改代码前先 CodeGraph"，我没严格执行。如果先用 `codegraph_context("环境变量管理")` 或 `codegraph_search("env")`，立刻能发现 `packages/env/src/index.ts`，就不会走弯路。

**修正**：在 AGENTS.md 的"代码探索"章节补一条强约束：

> **涉及 env / 状态 / 常量 / 字符串字面量的改动**，必须先查 `@opsagent/env` 包和 `constants/` 目录（`codegraph_context` 一次到位），确认现有模式后再写代码。

## 3. 知识管理类教训（核心问题）

详见独立文档：`docs/knowledge/2026-06-14-wiki-structure-blueprint.md`

核心论点：

1. `docs/decisions/` 和 `docs/knowledge/` 目录都有，但都是空的（只有 README），所有知识都堆到 `docs/devlog/` 里
2. devlog 是**线性流水账**，按"哪天做了什么"组织，AI 和人都无法按"概念"定位（比如找"env 怎么管理"要翻 10+ 篇）
3. CodeGraph 是**代码符号索引**，不解决"概念可发现性"问题（架构决策、踩坑教训、框架约束这些元知识，CodeGraph 找不到）
4. 推荐改用 Confluence/Notion 风格的**树形 wiki**，按概念组织，gbrain 才能正确索引

## 4. 设计失误归因（用户侧）

> 以下由用户自陈，作为团队反思材料归档。

- **没在 CLAUDE.md 明确"前后端 env 都走 `@opsagent/env`"**：导致 AI 默认用 Vite 的 `import.meta.env`，这在 Vite 项目里是常见做法，但不符合本项目"统一 env 治理"的意图。
- **没明确"用 Vite 还是其他框架"**：Vite 早就用了，但 CLAUDE.md 里没说死。AI 在做 env 设计时不敢假设前端构建工具，导致 `clientEnv` 的 `runtimeEnv: import.meta.env` 写法无法被自然推导出来。

## 5. 行动清单（按优先级）

| 优先级 | 行动 | 归属 | 卡片 |
|---:|---|---|---|
| P0 | 给 `@opsagent/env` 补 `client.ts`，暴露 `clientEnv` | backend-team | 待建 |
| P0 | 前端 `sentry.ts` 改用 `clientEnv` | frontend-team | 待建 |
| P1 | AGENTS.md 加"env/常量改动必须先查 `@opsagent/env`"强约束 | docs-team | 本卡已含 |
| P1 | 整理根 `package.json` 的 Sentry 依赖位置（解决 2.4） | sre-team | 待建 |
| P2 | 重构 `docs/` 为 wiki 树形结构（详见 blueprint） | docs-team | 待建 |
| P2 | CLAUDE.md 明确"前后端都走 `@opsagent/env`，前端构建工具是 Vite" | docs-team | 待建 |

## 6. 测试证据

- Sentry Dashboard 可见事件：`722b28297aaa4bc3a15455a97dac60cf`（probe）
- Vite 构建通过：`dist/assets/*.js` 无 `sourceMappingURL`（M4-02 验证通过）
- 类型检查通过：`pnpm --filter frontend check-types` 0 errors
- 浏览器实测：http://localhost:3001 → Sentry SDK 初始化成功（用户侧确认）

## 7. 工作流记录

| 步骤 | 结果 |
|---|---|
| 任务启动 | 基于 `docs/devlog/2026-06-14-m4-handoff.md` 接手 |
| Phase A 规划 | 基于 `docs/issues/M4-planning.md` 的 §5 执行顺序 |
| Sentry 依赖安装 | 用 `catalog:` 引用，根集中管控 |
| 探针验证 | 误用根目录 + 硬编码 DSN，**本次复盘重点** |
| Sentry 集成 | Vite `envDir: "../.."` + `lib/sentry.ts` + `ErrorBoundary` |
| Phase A 通过 | 用户确认 Sentry Dashboard 可见事件 |

## 反向引用

- [[0000-adopt-adr|ADR-0000]]：`Context` 节作为"知识库散点化的具体损失"证据
- [[2026-06-14-wiki-structure-blueprint|Wiki 结构蓝图]]：§1.2"对 AI 的具体影响"作为案例
