# Sentry Personal Token 配置（Source Map 上传所需权限）

日期：2026-06-16
状态：`accepted`
作者：项目维护者（Google 在线 AI 辅助）
关联里程碑：M4 Phase B

## 关联

- [[0006-sentry-release-sourcemap-strategy|ADR-0006]]：Sentry Release 命名与 Source Map 上传策略（§4 凭证管理引用本文）
- [[M4-04-sentry-release-sourcemap-upload|M4-04 任务卡]]：实施入口（`SENTRY_AUTH_TOKEN` 即本文产出）
- [[2026-06-16-Sentry和GitHub的配置|Sentry 与 GitHub 的配置]]：OAuth + organization 关联（本文的前置步骤）

## 1. 入口

在 Sentry UI：`Settings → Developer Settings → Personal Tokens`，新建一个 token。

## 2. 权限设置（Source Map 上传最小权限）

| 权限项 | 默认值 | 应设为 | 为什么 |
|---|---|---|---|
| **Project** | `Read` | **`Admin`** | plugin 需要向项目写入、关联调试文件（Debug Files = Source Map）的最高权限 |
| **Release** | `No Access` | **`Admin`** | `@sentry/vite-plugin` 底层先在 Sentry 创建 Release，再把 Source Map 塞进该 Release；必须有创建和管理 Release 的完整权限 |
| **Organization** | `No Access` | `Read` | plugin 需要读取并校验组织别名（如 `none-fez`），确保文件上传到正确位置 |
| Team / Issue & Event / Member / Alerts | `No Access` | 保持 `No Access` | 最小权限原则，Source Map 上传不需要 |

## 3. 产出

这个 Personal Token 就是 `.env` 里 `SENTRY_AUTH_TOKEN` 的值（`sntrys_...` 开头）。配合 `SENTRY_ORG` / `SENTRY_PROJECT` 一起填，`pnpm --filter frontend build` 即可触发 `@sentry/vite-plugin` 上传（详见 [[0006-sentry-release-sourcemap-strategy|ADR-0006 §4]]）。

## 4. 踩坑过程

配置过程中遇到的认证问题，详见 [[2026-06-16-Sentry和GitHub的配置|Sentry 与 GitHub 的配置]]。

## 反向引用

- [[0006-sentry-release-sourcemap-strategy|ADR-0006]]：§4 凭证管理（`SENTRY_AUTH_TOKEN` 的来源）
- [[M4-04-sentry-release-sourcemap-upload|M4-04 任务卡]]：§8 工作流记录（Sentry 配置修复）
