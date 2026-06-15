# ADR-0006: Sentry Release 命名与 Source Map 上传策略

- **日期**：2026-06-15
- **状态**：`proposed`（§3 Release 命名策略待验证后改 `accepted`）
- **决策者**：项目维护者 + AI agent
- **关联**：
  - [[0002-error-tracking-strategy|ADR-0002]]：错误监控分层栈（Sentry 定位）
  - [[0001-env-layer-design|ADR-0001]]：`@opsagent/env` 单一持有默认值（SENTRY_AUTH_TOKEN 同样适用）
  - [[planning|M4 规划]]：§5 Phase B 执行顺序
  - [[M4-04-sentry-release-sourcemap-upload|M4-04 任务卡]]：本 ADR 的实施入口

## Context

M4 Phase A（commit `ccbd985`）跑通了 Sentry SaaS 端到端：Vite 构建生成 source map → `@sentry/react` 初始化 → 事件上报 → Sentry Dashboard 可见 Issue。但 Phase A **没有**做两件事：

1. **Source Map 没上传到 Sentry**：Sentry Dashboard 上的 Issue 堆栈仍然是压缩后的 `index-abc123.js:1:234`，没有还原到源码文件和行号。这是因为 Vite 生产构建虽然生成了 `.map` 文件（M4-01），但没有把它们传给 Sentry。
2. **Release 字段为空**：Sentry Issue 列表的"Release"列是空字符串，无法回答"哪个版本引入的 bug"。

M4 Phase B 的核心交付就是补齐这两个能力，对应任务卡 M4-04。

在动手前需要固化三个架构决策，避免实施时反复返工：

- 用什么工具上传 Source Map？（`@sentry/vite-plugin` vs `sentry-cli` 手工脚本 vs `webpack`/`rollup` 插件）
- Release 字符串怎么命名？（`git-sha` vs `package.version` vs `package.version-git-sha`）
- 如何保证 `.map` 文件不被浏览器公开访问？

## Decision

### 1. 上传工具：`@sentry/vite-plugin`（不用 `sentry-cli`）

| 候选 | 优劣 |
|---|---|
| **`@sentry/vite-plugin`** ✅ | Vite 原生集成，`pnpm build` 时自动上传；CI 友好（一个 plugin 配置搞定）；官方维护 |
| `sentry-cli` 脚本 | 需要手写 `postbuild` shell（`sentry-cli sourcemaps inject` + `sentry-cli sourcemaps upload`）；多一步 shell 就多一个失败点 |
| `@sentry/rollup-plugin` | Vite 底层是 Rollup，技术上可用，但 Sentry 官方推荐 Vite 项目用 vite-plugin |
| `@sentry/webpack-plugin` | Vite 不走 webpack，直接排除 |

**结论**：采用 `@sentry/vite-plugin`。在 `apps/frontend/vite.config.ts` 的 `plugins` 数组里注册，配置 `org` / `project` / `authToken` / `release.name`。

### 2. Release 命名策略：`package.version-git-sha`（候选，待验证）

| 候选                              | 示例                     | 优劣                                               |
| ------------------------------- | ---------------------- | ------------------------------------------------ |
| **`package.version-git-sha`** ✅ | `1.2.3-abc1234`        | 人能看懂版本，也能精确定位 commit；Sentry Release 列表按版本排序时自然有序 |
| `git-sha`                       | `abc1234`              | 简单但看不出"哪个版本引入的"                                  |
| `package.version`               | `1.2.3`                | 同一版本多次部署会覆盖 Source Map，热修复时定位不准                  |
| ISO 时间戳                         | `2026-06-15T10:30:00Z` | 语义弱，Sentry 排序不友好                                 |

**结论（待验证）**：采用 `package.version-git-sha`。实施时在 `vite.config.ts` 里用 Node.js `child_process.execSync("git rev-parse --short HEAD")` + `package.json` 的 `version` 字段拼接。

**状态说明**：本决策当前为 `proposed`，因为项目维护者明确说"Release 命名策略需要验证"。验证通过后改 `accepted`；如果被推翻，新建 ADR-NNNN 替代。

### 3. Source Map 不公开：Vite `sourcemap: "hidden"` + 部署侧兜底

- **Vite 配置**：`build.sourcemap: "hidden"`（Phase A 已配置，本次不改）——生成 `.map` 文件但不在 `.js` 文件里注入 `//# sourceMappingURL` 注释。这样浏览器 DevTools 拿不到 map 的线索。
- **部署侧兜底**：生产部署（Nginx / CDN / Docker）必须显式拒绝 `/assets/*.map` 的访问请求，返回 404。这是纵深防御：即使有人猜到 URL 也拿不到。
- **Sentry 上传路径**：`@sentry/vite-plugin` 在 `pnpm build` 时把 `dist/assets/*.map` 上传到 Sentry SaaS，上传后**本地不保留** map 文件（CI 环境一次性使用）。

**边界**：本 ADR 只管"上传策略 + 不公开策略"。M4-02（部署侧拒绝 `.map` 访问）是另一张卡，不在本决策范围。

### 4. 凭证管理：`SENTRY_AUTH_TOKEN` 走 `@opsagent/env`

按 ADR-0001（环境变量由 `@opsagent/env` 单一持有），`SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT` 必须：

- 存在于 `.env`（项目根），**不进 git**
- **不进前端 bundle**：`@sentry/vite-plugin` 在 Node.js 端（构建时）读取，不会被打进浏览器产物
- 通过 `@opsagent/env` 的 server schema 校验（避免 token 拼错导致上传失败时难以诊断）

**注意**：这与 M4 Phase A 复盘 §2.1 识别的 P0 问题（前端 `clientEnv` 缺失）是两件事。本 ADR 的 token 是 Node.js 构建时读取，不需要 client schema。

## Consequences

### 正面

- **Sentry Issue 堆栈还原到源码**：Phase B 完工后，前端报错在 Sentry 上直接看到 `Checkout.tsx:137` 而不是 `index-abc123.js:1:234`，调试效率提升一个数量级
- **Release 可追溯**：每个 Issue 能回答"哪个版本引入的 bug"，配合 git log 定位回归点
- **CI 友好**：`@sentry/vite-plugin` 是构建流程的一部分，不需要额外的 CI step
- **面试叙事完整**：能讲清楚"从 Source Map 生成 → 上传 → 还原 → 不公开"全链路，而不只是"我们用了 Sentry"

### 负面

- **构建时间增加**：每次 `pnpm build` 多一步上传（实测 Sentry 上传通常 5-15 秒，可接受）
- **`SENTRY_AUTH_TOKEN` 泄露风险**：token 泄露后攻击者能往项目上传假 Source Map（不能灌水事件，但能篡改堆栈还原结果）——缓解：`.env` 不进 git + 生产环境用 Secret Manager
- **依赖 `git` 命令**：Release 命名依赖 `git rev-parse`，无 git 环境（如某些 Docker 构建）会失败——缓解：fallback 到 `package.version`

### 风险

- **Sentry 免费额度**：Source Map 上传占用 Sentry 存储配额（免费版 5 GB），长期需要监控
- **网络依赖**：离线构建会失败（plugin 默认 `silent` 模式可降级为警告，但会丢失上传）

## 反向引用

暂无（新建时同步追加到 ADR-0002 的反向引用区）
