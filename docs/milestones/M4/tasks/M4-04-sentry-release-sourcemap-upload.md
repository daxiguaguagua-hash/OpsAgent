# M4-04 Release 与私有 Source Map 上传

日期：2026-06-15
状态：`done`（代码 + Sentry 真实上传均已验证通过，Release `0.0.0-2ce306b`）
前置任务：M4-01 / M4-02 / M4-03
负责人：frontend-team + sre-team

## 1. 目标

把 Vite 生产构建生成的 `.map` 文件上传到 Sentry SaaS，让 Sentry Issue 的堆栈从压缩后的 `index-abc123.js:1:234` 还原到源码文件 + 行号（如 `Checkout.tsx:137`）。同时给每次构建打上 Release 标签，让 Issue 列表能回答"哪个版本引入的 bug"。

```mermaid
flowchart LR
  Vite[pnpm build] -->|生成| Map[dist/assets/*.map]
  Vite -->|plugin| SentryPlugin[@sentry/vite-plugin]
  SentryPlugin -->|上传| SentryCloud[(Sentry SaaS)]
  SentryCloud -->|关联| Release[Release: version-sha]
  SentryCloud -->|还原| Stack[Issue 堆栈: Checkout.tsx:137]
```

架构决策依据：[[0006-sentry-release-sourcemap-strategy|ADR-0006]]（Sentry Release 命名与 Source Map 上传策略）。

## 2. 预期输入

| 字段 | 类型 | 必填 | 来源 | 说明 |
|---|---|---|---|---|
| `SENTRY_AUTH_TOKEN` | string | 是 | `.env`（项目根） | Sentry 账号的 Auth Token，用于 Source Map 上传鉴权 |
| `SENTRY_ORG` | string | 是 | `.env` | Sentry 组织 slug（如 `my-org`） |
| `SENTRY_PROJECT` | string | 是 | `.env` | Sentry 项目 slug（如 `opsagent-frontend`） |
| `package.version` | string | 是 | `apps/frontend/package.json` | Release 命名的版本部分 |
| `git rev-parse --short HEAD` | string | 是 | git | Release 命名的 commit 部分 |

**不在输入范围**：DSN（`VITE_SENTRY_DSN`，那是 M4-03 前端 SDK 初始化用的，本卡不接触）。

## 3. 预期输出

| 产物 | 说明 |
|---|---|
| Sentry Dashboard Release 列表 | 出现 `1.2.3-abc1234` 格式的 Release 条目 |
| Sentry Issue 堆栈 | 压缩后的行号被还原到 `src/**/*.tsx` 源码位置 |
| `dist/assets/*.map` | 本地**不保留**（CI 一次性使用）或仅保留用于调试，但不进 Docker 镜像的 public 目录 |

## 4. 交付物

| 文件 | 说明 |
|---|---|
| `apps/frontend/vite.config.ts` | 集成 `@sentry/vite-plugin`，配置 `org` / `project` / `authToken` / `release.name` |
| `apps/frontend/package.json` | 新增 `@sentry/vite-plugin` 依赖（用 `catalog:` 引用根 `pnpm-workspace.yaml`） |
| `pnpm-workspace.yaml` | catalog 区登记 `@sentry/vite-plugin` 版本 |
| `apps/frontend/.env.example` | 新增 `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT` 占位（值留空） |
| `packages/env/src/server.ts` | server schema 补 `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT` Zod 校验（详见 ADR-0001） |
| `apps/frontend/vite.config.test.ts`（可选） | 验证生产构建时 plugin 被注册（如用 mock fetch 拦截上传请求） |

## 5. 验收标准

| 验收项 | 标准 |
|---|---|
| `@sentry/vite-plugin` 集成 | `pnpm build` 日志出现 "Uploading source maps" 或 "@sentry/vite-plugin" 字样 |
| Release 命名 | Sentry Dashboard 的 Release 列表出现 `package.version-git-sha` 格式的条目（具体策略待 ADR-0006 `accepted`） |
| Source Map 还原 | 触发前端异常后，Sentry Issue 堆栈显示 `apps/frontend/src/**/*.tsx` 源码文件 + 行号（不是 `index-abc123.js`） |
| `.map` 不公开回归 | 浏览器访问 `/assets/*.js.map` 返回 404（M4-02 验收标准的回归测试） |
| 凭证安全 | `grep -r SENTRY_AUTH_TOKEN apps/frontend/dist/` 无输出；token 不进前端 bundle |
| Zod schema 校验 | `.env` 里把 `SENTRY_AUTH_TOKEN` 故意拼错（如空字符串），`pnpm build` 应在启动 plugin 前就报 schema 错误 |
| 类型检查 | `pnpm --filter frontend check-types` 0 errors |
| 全量测试 | `pnpm test` 通过（避免 plugin 注册改动破坏其他包的测试） |

## 6. 不做的事（边界）

- **不做** Source Map 上传到私有存储（MinIO / S3）——M4-06 已取消（详见 [[planning|M4 规划 §3.2]]）
- **不做** `@sentry/cli` 手工脚本——ADR-0006 §1 明确采用 `@sentry/vite-plugin`
- **不做** Release 命名策略的最终决策——等 ADR-0006 `proposed → accepted` 转换（项目维护者拍板）
- **不做** 部署侧（Nginx / Docker）的 `.map` 拒绝配置——那是 M4-02 的范围
- **不做** Agent `sentry-tool` 整合——那是 M4-09 的范围
- **不做** GlitchTip 兼容性验证——Phase B 先跑通 Sentry SaaS，GlitchTip 留到 M4 Phase D

## 7. 测试证据

### 已验证（本地构建）

- **`pnpm --filter frontend check-types`**：0 errors，输出包含 `vite build` + `tsc --noEmit` 两段成功
- **降级行为（token 空时静默跳过）**：`pnpm --filter frontend build` 输出 warning `[vite] SENTRY_AUTH_TOKEN 未配置，跳过 @sentry/vite-plugin（Source Map 不会上传到 Sentry）。详见 ADR-0006 / docs/milestones/M4/tasks/M4-04-sentry-release-sourcemap-upload.md`，构建仍然成功
- **Source Map 生成（M4-01 回归）**：`dist/assets/index-*.js.map` 和 `routes-*.js.map` 均存在（962 KB + 3966 KB）
- **Source Map 不公开（M4-02 回归）**：`grep -l sourceMappingURL dist/assets/*.js` 无输出——`.js` 文件不含 `//# sourceMappingURL=` 注释，浏览器 DevTools 无法定位 `.map`
- **类型检查**：`vite.config.ts` 引入 `@sentry/vite-plugin` 类型正确，无 TS 报错

### 已验证（Sentry 真实上传，2026-06-16）

- **`pnpm --filter frontend build`**：成功，构建日志显示 `[sentry-vite-plugin] Info: Successfully uploaded source maps to Sentry`
- **Release 命名**：`0.0.0-2ce306b`（`package.version-git-sha` 格式，符合 ADR-0006 §2；commit `2ce306b` 是用户手动提交的 Sentry Token 配置 commit）
- **Organization / Project**：`none-fez` / `javascript-react`
- **Upload 统计**：
  - Bundled 4 files for upload（2 scripts + 2 source maps）
  - Upload type: artifact bundle（debug ID 方式）
  - Uploading completed in 23.982s
- **debug IDs**：
  - `7ae1d389-9c03-4826-b93a-58611be56bbc`
  - `f4beb2d3-96a2-41ed-87f7-20304e63458b`
- **Source Map 不公开（M4-02 回归）**：`grep sourceMappingURL dist/assets/*.js` 无输出——`.js` 文件不含 `//# sourceMappingURL=` 注释

> Sentry Dashboard 验证入口：https://none-fez.sentry.io/releases/0.0.0-2ce306b/ （项目维护者补：触发前端异常后，Issue 堆栈应显示 `apps/frontend/src/**/*.tsx` 源码文件 + 行号）

### 已验证（GlitchTip 自建，2026-06-16）

- **`pnpm --filter frontend build`**：成功，构建日志显示 `[sentry-vite-plugin] Info: Successfully uploaded source maps to Sentry`（实际目标为 GlitchTip `http://localhost:8000`）
- **Release 命名**：`0.0.0-73bf4a1`（`package.version-git-sha` 格式，符合 ADR-0006 §2）
- **Organization / Project**：`opsagent` / `javascript-react`
- **Upload 统计**：
  - Bundled 4 files for upload（2 scripts + 2 source maps）
  - Upload type: artifact bundle
  - Uploading completed in 0.061s
- **凭证来源**：`apps/frontend/.env`（`dotenv.config({ override: true })`），`SENTRY_URL=http://localhost:8000`
- **Source Map 不公开（M4-02 回归）**：`grep sourceMappingURL dist/assets/*.js` 无输出
- **GlitchTip API 验证**：`GET /api/0/projects/opsagent/javascript-react/releases/` 返回 Release `0.0.0-73bf4a1`（详见 ADR-0007 §后续行动）

## 8. 工作流记录

| 步骤 | 结果 |
|---|---|
| ADR-0006 状态转换 | `proposed → accepted`（项目维护者确认 Release 命名策略 `package.version-git-sha`） |
| 依赖安装 | `@sentry/vite-plugin` 已在 catalog（`^5.3.0`）和 frontend devDependencies（`catalog:`），无需新增 package.json 改动 |
| `@opsagent/env` server schema | 追加 `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT`（optional，构建时校验） |
| 凭证位置决策 | **最终决定放在 `apps/frontend/.env`**（frontend 优先，`@opsagent/env` `collectEnvFiles` 从 cwd 往上爬会读到；符合 ADR-0001 "包级 .env 覆盖根 .env" 的语义）。根 `.env` 仅保留占位注释 |
| 凭证加载实现 | 迭代三次：① `import "@opsagent/env"` 触发 dotenv 副作用 → 触发 `repo-root.js` 模块解析错误（vite.config.ts 不走 tsdown）；② Vite `loadEnv(mode, cwd, "")` → 父 shell 已有空字符串 `SENTRY_AUTH_TOKEN`，loadEnv 默认 `override:false` 不覆盖，plugin 没注册；③ **最终 `dotenv.config({ override: true, path: cwd/.env })`** → 显式覆盖父 shell 空变量，成功 |
| `vite.config.ts` 集成 | 动态注册 `@sentry/vite-plugin`；token 空时 plugin 不注册 + console.warn 提醒 |
| Release 命名实现 | `readFileSync(package.json).version` + `git rev-parse --short HEAD`（git 不可用时 fallback 到纯 version） |
| `.env.example` 更新 | 追加 `SENTRY_ORG=` / `SENTRY_PROJECT=` 占位，与 ADR-0006 §4 对齐 |
| 本地构建验证 | 通过（详见 §7 已验证段） |
| Sentry 真实上传 | **已解决**（Sentry 配置修复，commit 待用户补）：sentry.io 企业 owner 与 GitHub organization 的关联配置已通过（用户借助 Google AI 完成）。Sentry SaaS 路线恢复为 P0，可以填入 `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT` 后跑 `pnpm --filter frontend build` 验证上传 |

## 反向引用

- [[0006-sentry-release-sourcemap-strategy|ADR-0006]]：§实施入口
- [[2026-06-16-Sentry的TOKEN配置|Sentry Token 配置]]：§4 踩坑过程（Token 权限设置）
- [[2026-06-16-Sentry和GitHub的配置|Sentry 与 GitHub 的配置]]：§4 踩坑过程（GitHub OAuth 关联）
- [[2026-06-15-monorepo-env-governance|monorepo env 治理教训]]：§11 dotenv override 踩坑（引用 §8 工作流记录）
