# M4-11 GlitchTip 平替 Sentry 可行性 Spike

日期：2026-06-16
状态：`planned`
前置任务：M4-04（Source Map 上传路径已实现）/ M4-09（sentry-tool 已实现）
负责人：sre-team + ai-agent-team
性质：spike（15–60 分钟验证，产出 ADR-0007 草稿）

## 1. 触发背景

2026-06-16 项目维护者的"梯子"（HTTP 代理）突然失效，连梯子官网都无法访问。Sentry SaaS（`sentry.io`）在大陆直连不可达，导致：

- **M4-04 闭环断裂**：`pnpm --filter frontend build` 无法上传 Source Map，Release `0.0.0-2ce306b` 之后无法再生成新 Release
- **M4-09 闭环断裂**：sentry-tool 调 `https://sentry.io/api/0/...` 无法拉 issue/event
- **前端 SDK 初始化失败**：`VITE_SENTRY_DSN` 指向 `o4511561514418176.ingest.us.sentry.io`，浏览器直连失败

M4 planning §3.1 早就规划了"三层方案"：Sentry SaaS / GlitchTip 自建 / 自研 SDK。**现在是把 GlitchTip 从"兜底"推到"主力"的时候了**。

## 2. Spike 目标

**15–60 分钟内回答 3 个关键技术风险**，产出"是否可行 + 后续怎么做"的结论，给 ADR-0007 提供数据支撑：

| # | 风险 | 验证手段 | 判定标准 |
|---|---|---|---|
| R1 | `@sentry/vite-plugin` 能否上传 Source Map 到 GlitchTip | 起 GlitchTip → 配 frontend `SENTRY_ORG/PROJECT/AUTH_TOKEN` 指向 GlitchTip → `pnpm --filter frontend build` | build 日志出现 "Successfully uploaded source maps" + GlitchTip Release 列表出现条目 |
| R2 | Sentry REST API（`/api/0/projects/...`）在 GlitchTip 是否兼容 | sentry-tool 配 `endpoint: http://localhost:8000/api/0`，调 list issues + get latest event | 返回结构化 issue + event（stacktrace 已 symbolicated） |
| R3 | 前端 SDK 必须 `autoSessionTracking: false`（GlitchTip 不支持 sessions） | `apps/frontend/src/lib/sentry.ts` 加 `autoSessionTracking: false` → 触发前端异常 → GlitchTip UI 可见 Issue | Issue 出现 + 不报 "unsupported session" 错误 |

## 3. 资源盘点（全部已就绪）

| 资源 | 状态 |
|---|---|
| Docker 镜像 `glitchtip/glitchtip:latest` | ✅ 已下载（250 MB） |
| PostgreSQL 16（`opsagent-postgres`） | ✅ 运行中（复用，新建独立 DB `glitchtip` + user） |
| Redis 7（`opsagent-redis`） | ✅ 运行中（复用） |
| 端口 8000 | ✅ 当前无冲突 |
| 前端 `ERROR_TRACKING_PROVIDER` 切换 | ✅ 已实现（ADR-0006 / M4 planning §3.1） |

## 4. 预期交付物

| 文件 | 说明 |
|---|---|
| `docker-compose.yml` | 追加 `glitchtip` service，**`profiles: ["glitchtip"]`**（不污染默认 `docker compose up`） |
| `packages/db/glitchtip-init.sql`（或 `.sh`） | 新建独立 DB `glitchtip` + user `glitchtip`（与现有 `opsagent` DB 隔离） |
| `.env.example` | 追加 `GLITCHTIP_SECRET_KEY` / `GLITCHTIP_DB_PASSWORD` 占位 |
| `apps/frontend/src/lib/sentry.ts` | 加 `autoSessionTracking: false`（M4 planning §3.1 已约定） |
| `docs/decisions/0007-glitchtip-as-sentry-fallback.md`（草稿） | ADR-0007：固化 GlitchTip 作为 Sentry SaaS 不可达时的主力 |
| 本任务卡 §7 测试证据 | 3 个风险的实测结果（成功 / 失败 / 限制） |

## 5. 验收标准

| 验收项 | 标准 |
|---|---|
| docker-compose profile 模式 | `docker compose up -d` 默认仍 8 服务；`docker compose --profile glitchtip up -d` 追加 GlitchTip |
| GlitchTip Web UI 可达 | `http://localhost:8000` 能看到 GlitchTip 登录页 |
| 账号注册 + Project 创建 | 注册 demo 账号 → 创建 "javascript-react" project → 拿到 DSN |
| R1 Source Map 上传 | `pnpm --filter frontend build` 日志 "Successfully uploaded" + GlitchTip Release 列表出现条目 |
| R2 Sentry API 兼容 | `sentry-tool`（endpoint 改到 localhost:8000）能 list issues + get latest event + 拿到 symbolicated stacktrace |
| R3 前端 SDK 无 session 报错 | 触发前端异常 → GlitchTip UI 出现 Issue + 不报 session 相关错误 |
| 前端代码零改动 | 只换 `VITE_SENTRY_DSN` 指向 GlitchTip（M4 planning §3.1 约定） |
| 资源增量可控 | `docker stats` 显示 GlitchTip 容器 < 512 MB RAM |
| ADR-0007 草稿 | 含 3 个风险实测结果 + 决策 + Consequences |

## 6. 不做的事（边界）

- **不做** GlitchTip 生产部署配置（SSL / 备份 / 持久化策略）——本机 demo 即可
- **不做** GlitchTip 邮件通知（`EMAIL_URL=consolemail://`，开发期足够）
- **不做** 切换 Sentry SaaS ↔ GlitchTip 的自动化脚本——`.env` 手动切换即可
- **不做** 自研 symbolication 集成（那是 M4-07 的范围）

## 7. 测试证据（spike 完成后填写）

### R1：Source Map 上传

> 实施阶段补：`pnpm --filter frontend build` 日志 + GlitchTip Release 截图

### R2：Sentry API 兼容

> 实施阶段补：`sentry-tool` 实测请求/响应 + symbolicated stacktrace 截图

### R3：前端 SDK 无 session 报错

> 实施阶段补：浏览器 console 截图 + GlitchTip Issue 截图

### 资源增量

> 实施阶段补：`docker stats` 输出

## 8. 工作流记录（spike 完成后填写）

> 实施阶段补：每步 commit sha、遇到的意外、决策变更。

## 9. 后续行动（取决于 spike 结果）

| spike 结果 | 后续 |
|---|---|
| 全部兼容 ✅ | ADR-0007 固化"GlitchTip 本地主力 + Sentry SaaS 梯子通时回切"；M4-04 / M4-09 凭证切到 GlitchTip |
| `@sentry/vite-plugin` 不兼容 ⚠️ | ADR-0007 改为"GlitchTip 用 glitchtip-cli 上传"；补 M4-04 上传脚本 |
| Sentry API 不兼容 ⚠️ | ADR-0007 注明"sentry-tool 加 endpoint 适配"；扩 M4-09 支持 endpoint 切换 |
| 多个不兼容 ❌ | 重新评估 GlitchTip 版本（换最新版 / 看 Sentry 协议兼容层）；极端情况下考虑自研 symbolication（M4-07）作为主力 |

## 反向引用

- [[0006-sentry-release-sourcemap-strategy|ADR-0006]]：§3 Source Map 上传路径（本 spike 验证 GlitchTip 兼容度）
- [[planning|M4 规划]]：§3.1 三层方案（GlitchTip 作为 P1 兜底）
- [[2026-06-16-Sentry的TOKEN配置|Sentry Token 配置]]：凭证管理（GlitchTip 复用同一套 Personal Token 概念）
