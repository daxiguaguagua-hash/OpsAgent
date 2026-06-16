# ADR-0006: Sentry Release 命名与 Source Map 上传策略

- **日期**：2026-06-15
- **状态**：`accepted`
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

**结论**：采用 `package.version-git-sha`。实施时在 `vite.config.ts` 里用 Node.js `child_process.execSync("git rev-parse --short HEAD")` + `package.json` 的 `version` 字段拼接。

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

**Token 最小权限**：Sentry Personal Token 需要 `Project: Admin` + `Release: Admin` + `Organization: Read`，其他权限保持 `No Access`。详见 [[2026-06-16-Sentry的TOKEN配置|Sentry Token 配置]]。

**凭证加载实现注记**：`vite.config.ts` 实际用 `dotenv.config({ override: true, path: "apps/frontend/.env" })` 而非直接读 `process.env` 或 Vite `loadEnv`——因为父 shell 可能有同名空字符串（Vite `loadEnv` 默认 `override:false` 不覆盖），而 `@opsagent/env` 在 vite.config.ts 上下文中会触发 `repo-root.js` 模块解析错误。踩坑细节详见 [[2026-06-15-monorepo-env-governance|monorepo env 治理教训 §11]]。

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

## GlitchTip 兼容（2026-06-16 实施发现）

`@sentry/vite-plugin` 默认走 **debug-id artifact bundle** 上传路径：文件名是 `<uuid>.js`，服务端靠 stack frame 里嵌入的 `debug_id` 匹配 `.map`。Sentry SaaS 原生支持这条路径，但 **GlitchTip 服务端（截至 2026-06-16 版本）不支持**——它只走传统 URL 匹配：artifact name 必须与 stack frame 的 `absPath` 对得上（`~/assets/foo.js` 对应 `http://host/assets/foo.js`）。

### 失败症状

event 成功入库，`release` 字段正确，但 stack frame 的 `filename` / `function` 仍是压缩后的值，`context_line` / `context` 为空。

### 根因（3 个叠加）

1. **上传命名对不上**：plugin 默认上传成 `<uuid>.js`，frame 要的是 `/assets/index-<hash>.js`，两者不匹配。
2. **sourceMappingURL 注释缺失**：`build.sourcemap: "hidden"` 不在 JS 里写 `//# sourceMappingURL=…`，服务端即使拿到 JS artifact 也不知道去哪找对应的 `.map`。
3. **SDK release 不匹配**：前端 `Sentry.init({ release })` 读 `VITE_APP_VERSION`（未定义 → fallback `"dev"`），但上传时的 releaseName 是 `0.0.0-<gitSha>`，服务端按 release 找 artifact 时找不到。

### 修复（`apps/frontend/vite.config.ts`，2026-06-16 已落地）

```typescript
define: {
  // 让 SDK 上报的 release 与上传时的 releaseName 完全一致
  // （Sentry 官方文档明确要求二者严格相等，否则 stacktrace 不反解）
  "import.meta.env.VITE_APP_VERSION": JSON.stringify(releaseName),
},
build: {
  // 必须 true，不能 "hidden"：GlitchTip legacy 模式靠 JS 里的
  // sourceMappingURL 注释找到对应的 .map artifact
  sourcemap: true,
},
plugins: [
  sentryVitePlugin({
    // …
    release: {
      name: releaseName,
      // 改用 legacy 模式，每个 .js/.js.map 单独上传为
      // ~/assets/<hash>.js 风格的 URL 命名 artifact
      uploadLegacySourcemaps: {
        paths: ["./dist/assets"],
        urlPrefix: "~/assets",
      },
    },
  }),
],
```

### 范围说明

- 这是 **GlitchTip 特有的限制**；Sentry SaaS 不需要这些改动（但加了也不冲突，故统一配置）。
- `sourcemap: true` 会让 `.map` 内联到 JS，dist 体积翻倍（约 5 MB → 12 MB）。dist/ 目录本身不通过 web server 暴露给浏览器，只存在于 GlitchTip release artifact 里，不会泄漏到生产环境。
- `sentry-tool.ts`（M4-09）已扩展透传 `contextLine` / `context` / `origLineNo` / `origColNo` / `origFilename` / `origFunction`，Mastra agent 可直接消费反解后的源码上下文，不必再二次调 git-context。

## 反向引用

- [[M4-04-sentry-release-sourcemap-upload|M4-04 任务卡]]：§1 目标 / §6 边界
- [[planning|M4 规划]]：§3.1 上传工具决策
- [[2026-06-16-Sentry的TOKEN配置|Sentry Token 配置]]：§1 入口 / §3 产出
- [[2026-06-16-Sentry和GitHub的配置|Sentry 与 GitHub 的配置]]：§1 背景（OAuth 前提）
- [[2026-06-15-monorepo-env-governance|monorepo env 治理教训]]：§11 dotenv override 踩坑（引用 §4 凭证管理）
- [[0007-glitchtip-as-sentry-fallback|ADR-0007]]：GlitchTip 兼容 `@sentry/vite-plugin`（§R1 实测）+ 本节 GlitchTip 兼容章节
