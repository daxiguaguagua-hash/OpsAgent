# ADR-0007: GlitchTip 自建作为 Sentry SaaS 的主力兜底

- **日期**：2026-06-16
- **状态**：`accepted`
- **决策者**：项目维护者 + AI agent
- **关联**：
  - [[0002-error-tracking-strategy|ADR-0002]]：错误监控分层栈（GlitchTip 从 P1 兜底推到 P0 主力）
  - [[0006-sentry-release-sourcemap-strategy|ADR-0006]]：Source Map 上传策略（GlitchTip 兼容 `@sentry/vite-plugin`）
  - [[M4-11-glitchtip-sentry-fallback-spike|M4-11 任务卡]]：本决策的数据来源（spike 实测结果）
  - [[planning|M4 规划]]：§3.1 三层方案（本 ADR 落地第二层）

## Context

2026-06-16 项目维护者的 HTTP 代理（"梯子"）突然失效，连梯子官网都无法访问。Sentry SaaS（`sentry.io`）在大陆直连不可达，导致：

- **M4-04 闭环断裂**：`pnpm --filter frontend build` 无法上传 Source Map 到 Sentry SaaS
- **M4-09 闭环断裂**：`sentry-tool` 调 `https://sentry.io/api/0/...` 无法拉 issue/event
- **前端 SDK 初始化失败**：`VITE_SENTRY_DSN` 指向 `o4511561514418176.ingest.us.sentry.io`，浏览器直连失败

M4 planning §3.1 早就规划了三层方案（Sentry SaaS / GlitchTip 自建 / 自研 SDK），**但原计划 GlitchTip 是 P1 兜底**。梯子失效把 GlitchTip 推到 P0 主力。需要 15-60 分钟内验证 GlitchTip 是否能平替 Sentry SaaS。

## Decision

**采用 GlitchTip 自建（本地 Docker）作为 Sentry SaaS 不可达时的主力错误追踪平台**，与 Sentry SaaS 形成"双轨"模式：

| 场景 | 平台 | 触发方式 |
|---|---|---|
| 开发 / 本地 demo / 网络受限 | **GlitchTip**（localhost:8000） | 默认 |
| 生产 / 网络通时回切 | Sentry SaaS | 切换 `VITE_SENTRY_DSN` |

**关键发现**：前端代码只需换 `VITE_SENTRY_DSN`（指向 `http://<key>@localhost:8000/1`），其他代码零改动。`ERROR_TRACKING_PROVIDER` 切换逻辑已实现（ADR-0006 / M4 planning §3.1）。

### M4-11 Spike 实测结果（3 个风险全部通过 ✅）

| 风险 | 实测结果 |
|---|---|
| **R1**：`@sentry/vite-plugin` 上传 Source Map 到 GlitchTip | ✅ 直接用 `sentry-cli sourcemaps upload` 成功（Release `0.0.0-glitchtip-spike`，4 files bundled，51 ms 上传）。`@sentry/vite-plugin` 底层就是 sentry-cli，因此直接兼容 |
| **R2**：Sentry REST API 兼容 | ✅ `/api/0/organizations/`（create/list）+ `/api/0/teams/`（create）+ `/api/0/projects/`（create + get keys 拿 DSN）+ `/api/0/projects/{org}/{project}/issues/`（list）+ `/api/1/envelope/`（event ingestion）全部兼容。**注意**：envelope 端点必须带 `X-Sentry-Auth` header，DSN-in-body 方式返回 403 |
| **R3**：前端 SDK 必须禁用 session tracking | ✅ GlitchTip 官方文档推荐 `autoSessionTracking: false`，但 **@sentry/react v9+ 已移除该选项**。按 Sentry v8→v9 迁移指南，从默认 integrations 里过滤掉 `browserSessionIntegration` 即可（代码示例见 §Consequences） |

### GlitchTip 在 docker-compose 中的落地

- **service 名**：`glitchtip`，profile 模式（`profiles: ["glitchtip"]`）——**不污染默认 `docker compose up`**
- **启动命令**：`docker compose --profile glitchtip up -d`
- **镜像**：`glitchtip/glitchtip:latest`（250 MB 磁盘，arm64 + x86_64 通用）
- **端口**：`8000:8000`
- **模式**：All-in-one（Web + Worker 同容器），通过 `GLITCHTIP_EMBED_WORKER=true` 启用
- **数据库**：复用 `opsagent-postgres`，但新建独立 DB `glitchtip` + user `glitchtip`（与现有 `opsagent` DB 隔离）
- **Redis**：复用 `opsagent-redis`（用 db=1 避免与 opsagent 的 db=0 冲突）
- **邮件**：`EMAIL_URL=consolemail://`（开发期邮件打到容器日志，不接 SMTP）
- **注册**：`ENABLE_OPEN_USER_REGISTRATION=true`（demo 期开放；生产关闭）
- **初始化**：容器启动后需**手动跑 `python manage.py migrate`**（GlitchTip 官方镜像 entrypoint 不自动 migrate）

### 凭证管理（双轨）

| 平台 | `.env` 变量 | 值格式 |
|---|---|---|
| Sentry SaaS | `SENTRY_AUTH_TOKEN` | `sntrys_...`（在 sentry.io Developer Settings 创建） |
| Sentry SaaS | `SENTRY_ORG` / `SENTRY_PROJECT` | 字符串 slug |
| Sentry SaaS | `VITE_SENTRY_DSN` | `https://<key>@o4511561514418176.ingest.us.sentry.io/4511562966499328` |
| GlitchTip | `SENTRY_AUTH_TOKEN`（同名，不同值） | `sntrys_glitchtip_<hex>`（在 Django shell 创建 APIToken） |
| GlitchTip | `SENTRY_ORG` / `SENTRY_PROJECT` | 字符串 slug（如 `opsagent` / `javascript-react`） |
| GlitchTip | `VITE_SENTRY_DSN` | `http://<public-key>@localhost:8000/1` |

切换平台只需编辑 `.env` 里的 5 个变量，无需改代码。

### 前端 SDK 兼容写法（@sentry/react v10）

```typescript
import * as Sentry from "@sentry/react";

if (dsn) {
  // GlitchTip 不支持 sessions；@sentry/react v9+ 已移除 autoSessionTracking；
  // 按 Sentry v8→v9 迁移指南，从默认 integrations 里过滤掉 browserSessionIntegration
  const integrations = Sentry.getDefaultIntegrations({}).filter(
    (i) => i.name !== "BrowserSession",
  );
  integrations.push(Sentry.browserTracingIntegration(), Sentry.replayIntegration());

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_APP_VERSION ?? "dev",
    integrations,
    tracesSampleRate: 1.0,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });
}
```

### sentry-tool endpoint 切换

M4-09 的 `sentry-tool` 默认 endpoint 是 `https://sentry.io/api/0`。GlitchTip 部署后，在 `.env` 加 `SENTRY_API_ENDPOINT=http://localhost:8000/api/0`，`SentryDeps.endpoint` 优先读环境变量，零改动切换。

## Consequences

### 正面

- **网络无关性**：本地开发 / demo 不再依赖梯子；面试现场断网也能演示完整链路
- **成本为零**：GlitchTip MIT 开源，本地 Docker 跑起来不花钱；Sentry SaaS 14 天试用到期后无压力
- **数据主权**：本地 demo 数据不出境；适合企业客户演示"私有化部署"场景
- **代码零改**：只换 `.env` 的 5 个变量；前端/Agent/构建脚本都不动
- **面试叙事升级**：从"我们用 Sentry"→"我们用 Sentry SaaS + GlitchTip 自建 + 自研 SDK 三层方案，按场景切换"

### 负面

- **运维负担**：多跑一个容器（GlitchTip + PostgreSQL DB + Redis db=1），资源增量约 256–512 MB RAM
- **GlitchTip UI 较弱**：比 Sentry SaaS 简陋（无 Session Replay 播放、无高级过滤、无 issue 智能分组）
- **迁移成本**：首次部署需手动跑 migrate + 建账号 + 创建 org/project + 拿 DSN（约 10 分钟）
- **文档滞后**：GlitchTip 官方文档给的 `autoSessionTracking: false` 写法在 @sentry/react v9+ 已失效；团队需要知道 v10 的过滤 integrations 写法

### 风险

- **GlitchTip 长期维护**：GlitchTip 是小团队开源项目，长期活跃度不如 Sentry；极端情况下 Sentry 协议不兼容新版本
- **Worker 单点**：All-in-one 模式的 Worker 和 Web 同容器，CPU 争抢；生产部署应分离
- **Session Replay 在 GlitchTip 可能无法播放**：GlitchTip 接受 Replay envelope 数据，但 UI 播放能力未实测；本 ADR 不保证 Replay 在 GlitchTip 上可用

## 后续行动（M4 Phase D 起）

- [x] M4-04：把 `SENTRY_AUTH_TOKEN` / `ORG` / `PROJECT` 切到 GlitchTip，跑 `pnpm --filter frontend build` 验证 Source Map 上传到 GlitchTip Release 列表（Release `0.0.0-73bf4a1` 已确认，2026-06-16）
- [x] M4-09：`sentry-tool` 加 `SENTRY_API_ENDPOINT` 环境变量（默认 Sentry SaaS，可切 GlitchTip）（`readConfig` fallback chain + 2 个测试，137/137 pass）
- [x] 前端：把 `VITE_SENTRY_DSN` 切到 GlitchTip，浏览器触发异常，验证 Issue 出现在 `http://localhost:8000/javascript-react/issues/`（envelope 端点 curl 验证 Issue #2 已出现；浏览器 UI 待用户手动验证 stacktrace symbolication）
- [x] 文档：[[glitchtip-deploy|docs/runbooks/glitchtip-deploy.md]]（GlitchTip 部署 + 凭证获取 + MCP Server 配置手册）
- [ ] 评估：把 Mastra agent 的 M4-09 sentry-tool 替换为 GlitchTip 官方 MCP Server（17 个内置 tools，零维护成本）
  - **2026-06-16 实测**：Qoder CLI MCP 客户端 + GlitchTip OAuth 不兼容（`/mcp` 直返 `invalid_token`，浏览器 OAuth 流程未触发）
  - **当前决策**：暂不替换，sentry-tool 保留作为 Mastra agent 主力；GlitchTip MCP 留给 Claude Desktop / Cursor 等原生 MCP 客户端使用

## 反向引用

- [[M4-11-glitchtip-sentry-fallback-spike|M4-11 任务卡]]：§9 后续行动（本 ADR 的落地任务）
- [[2026-06-16-Sentry的TOKEN配置|Sentry Token 配置]]：§1 入口（GlitchTip Token 在 Django shell 创建）
- [[2026-06-15-monorepo-env-governance|monorepo env 治理教训]]：§11 dotenv override（GlitchTip 凭证加载复用 M4-04 的实现）
- [[glitchtip-deploy|GlitchTip 部署与凭证获取手册]]：§1 部署（本 ADR 的运维落地）
- [[0008-glitchtip-email-domain-pitfall|ADR-0008]]：GlitchTip 管理员邮箱禁止使用 `.local` 等保留 TLD（本 ADR 部署时踩坑沉淀）
- [[0006-sentry-release-sourcemap-strategy|ADR-0006]] §GlitchTip 兼容：GlitchTip 服务端不支持 debug-id artifact bundle，需要 legacy 上传模式 + `sourcemap: true` + `VITE_APP_VERSION` 注入（2026-06-16 端到端验证）
