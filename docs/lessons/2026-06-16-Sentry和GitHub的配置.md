# Sentry 与 GitHub 的配置（OAuth 认证 + Organization 关联踩坑）

日期：2026-06-16
状态：`accepted`
作者：项目维护者（Google 在线 AI 全程辅助）
关联里程碑：M4 Phase B

## 关联

- [[0006-sentry-release-sourcemap-strategy|ADR-0006]]：Sentry Release 命名与 Source Map 上传策略
- [[M4-04-sentry-release-sourcemap-upload|M4-04 任务卡]]：§8 工作流记录 commit `30ea64c`（Sentry 上传受阻，本文记录解决过程）
- [[2026-06-16-Sentry的TOKEN配置|Sentry Token 配置]]：本文解决 OAuth 后，下一步是 Token 权限配置

## 1. 背景

M4-04 实施阶段（commit `30ea64c`）Sentry SaaS 上传受阻：sentry.io 企业 owner 与 GitHub organization 的关联配置未通过，认证失败。本笔记记录解决过程。

> 外国的难题还得是外国的 AI 来治——全程用 Google 在线 AI 助手搞定。

## 2. GitHub 认证入口

Sentry UI：`Settings → Auth`。

- **未认证**：能看到 `Google` / `GitHub` 的 `Configure` 按钮
- **已认证**：界面大致如下（文字版，避免截图）

```text
### GitHub Authentication

Login URL
While Sentry will try to be clever about directing members to the appropriate
login form, you're safest just to hit up your organization-specific login
when visiting the app:
https://none-fez.sentry.io/issues/

### Organization
Users will be allowed to authenticate if they are a member of the
STJLEDU organization.

General Settings
  Require SSO    Require members use a valid linked SSO account to access this organization
  Enable SCIM    Enable SCIM to manage Memberships and Teams via your Provider
  Default Role   [Billing / Member / Admin / Manager / Owner]
                 The default role new members will receive when logging in for the first time.
```

> `https://none-fez.sentry.io/issues/` 就是 `Settings → General Settings` 界面。

## 3. 踩坑过程

### 3.1 初始误解

> 误以为"只有 Organization 里的 Member 成员才能上传 Source Map"，于是去 GitHub 创建了 Organization。

### 3.2 Google AI 给出的方案

1. 另建一个 GitHub 账号
2. 把其中一个账号设置为 **Owner**，另一个设置为 **Member**
3. 用 Owner 账号在 GitHub Organization 设置里完成 Sentry 的认证授权

### 3.3 最终账号结构

| GitHub 账号 | 角色 |
|---|---|
| `daxiguaguagua-hash` | **Member** |
| `daxiguaguagua-web` | **Owner** |

## 4. 复盘

- Sentry + GitHub OAuth 的文档对"Owner 账号必须在 GitHub 侧完成 Sentry App 授权"强调不足，导致首次配置走错路径
- 解决这类配置问题，直接在 Google Chrome 地址栏描述真实场景，在线 AI 就能给出可执行步骤
- 本笔记是"踩坑记录"性质，未来类似 Sentry/GitHub OAuth 的认证问题可以参考 §3.2 的账号分工思路

## 反向引用

- [[0006-sentry-release-sourcemap-strategy|ADR-0006]]：§4 凭证管理（OAuth 前提）
- [[M4-04-sentry-release-sourcemap-upload|M4-04 任务卡]]：§8 工作流记录（commit `30ea64c` Sentry 上传受阻）
- [[2026-06-16-Sentry的TOKEN配置|Sentry Token 配置]]：下一步配置
