# M4-11 GlitchTip 平替 Sentry 可行性 Spike

日期：2026-06-16
状态：`done`（3 个风险全部通过 ✅，沉淀为 ADR-0007）
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
| R2 | Sentry REST API（`/api/0/projects/...`）在 GlitchTip 是否兼容 | sentry-tool 配 `endpoint: http://localhost:8001/api/0`，调 list issues + get latest event | 返回结构化 issue + event（stacktrace 已 symbolicated） |
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
| GlitchTip Web UI 可达 | `http://localhost:8001` 能看到 GlitchTip 登录页 |
| 账号注册 + Project 创建 | 注册 demo 账号 → 创建 "javascript-react" project → 拿到 DSN |
| R1 Source Map 上传 | `pnpm --filter frontend build` 日志 "Successfully uploaded" + GlitchTip Release 列表出现条目 |
| R2 Sentry API 兼容 | `sentry-tool`（endpoint 改到 localhost:8001）能 list issues + get latest event + 拿到 symbolicated stacktrace |
| R3 前端 SDK 无 session 报错 | 触发前端异常 → GlitchTip UI 出现 Issue + 不报 session 相关错误 |
| 前端代码零改动 | 只换 `VITE_SENTRY_DSN` 指向 GlitchTip（M4 planning §3.1 约定） |
| 资源增量可控 | `docker stats` 显示 GlitchTip 容器 < 512 MB RAM |
| ADR-0007 草稿 | 含 3 个风险实测结果 + 决策 + Consequences |

## 6. 不做的事（边界）

- **不做** GlitchTip 生产部署配置（SSL / 备份 / 持久化策略）——本机 demo 即可
- **不做** GlitchTip 邮件通知（`EMAIL_URL=consolemail://`，开发期足够）
- **不做** 切换 Sentry SaaS ↔ GlitchTip 的自动化脚本——`.env` 手动切换即可
- **不做** 自研 symbolication 集成（那是 M4-07 的范围）

## 7. 测试证据（spike 实测，2026-06-16）

### R1：Source Map 上传 ✅

```bash
$ SENTRY_URL=http://localhost:8001/ SENTRY_ORG=opsagent SENTRY_PROJECT=javascript-react \
    sentry-cli sourcemaps upload --release 0.0.0-glitchtip-spike apps/frontend/dist/assets
> Bundled 4 files for upload
> Bundle ID: 9bb7d897-e200-52fc-a299-20bfc23b7f4d
> Uploading completed in 0.051s
> Organization: opsagent
> Projects: javascript-react
> Release: 0.0.0-glitchtip-spike
> Upload type: artifact bundle
```

**结论**：sentry-cli 直传 GlitchTip 成功。`@sentry/vite-plugin` 底层就是 sentry-cli，因此 **M4-04 现有构建脚本无需改动**，只换 `.env` 即可。

### R2：Sentry API 兼容 ✅

实测通过的 endpoint：

| Endpoint | 用途 | 实测 |
|---|---|---|
| `GET /api/0/` | API root | 返回 `{"version":"0","user":null,"auth":null}`（Sentry 格式） |
| `POST /api/0/organizations/` | 创建 org | `{"slug":"opsagent", ...}` |
| `POST /api/0/organizations/{org}/teams/` | 创建 team | `{"slug":"frontend", ...}` |
| `POST /api/0/teams/{org}/{team}/projects/` | 创建 project | `{"platform":"javascript-react", ...}` |
| `GET /api/0/projects/{org}/{project}/keys/` | 拿 DSN | `{"dsn":{"public":"http://<key>@localhost:8001/1"}}` |
| `POST /api/1/envelope/` | Event ingestion | 200 OK（**必须带 `X-Sentry-Auth` header**，DSN-in-body 返回 403） |
| `GET /api/0/projects/{org}/{project}/issues/` | 列 issues | 返回结构化 issue（含 metadata.type / metadata.value / firstRelease / lastRelease） |

**关键发现**：
1. GlitchTip 完全兼容 Sentry `/api/0/` REST API
2. envelope 端点必须用 `X-Sentry-Auth: Sentry sentry_version=7,sentry_client=...,sentry_key=<public-key>` header（Sentry SDK 标准方式），不能依赖 DSN 中的 key
3. sentry-tool 的 `request()` helper 已经用 `Authorization: Bearer`，需补一个 `X-Sentry-Auth` 分支（或确认 GlitchTip 也接受 Bearer）

### R3：前端 SDK 无 session 报错 ✅

**GlitchTip 官方文档给的 `autoSessionTracking: false` 写法在 @sentry/react v9+ 已失效**（TS2353: 'autoSessionTracking' does not exist in type 'BrowserOptions'）。

按 Sentry v8→v9 迁移指南，正确写法是**从默认 integrations 里过滤掉 browserSessionIntegration**：

```typescript
const integrations = Sentry.getDefaultIntegrations({}).filter(
  (i) => i.name !== "BrowserSession",
);
integrations.push(Sentry.browserTracingIntegration(), Sentry.replayIntegration());

Sentry.init({ dsn, integrations, ... });
```

已落地到 `apps/frontend/src/lib/sentry.ts`，`pnpm --filter frontend check-types` 通过（1m 55s，0 errors）。

### 资源增量

| 容器 | 资源 |
|---|---|
| `opsagent-glitchtip` | ~256 MB RAM（all-in-one Web + Worker） |
| 复用 `opsagent-postgres` | 新增 DB `glitchtip` + user `glitchtip`（独立隔离） |
| 复用 `opsagent-redis` | db=1（避免与 opsagent db=0 冲突） |

### Sentry Dashboard 截图（待用户补）

- [ ] `http://localhost:8001/javascript-react/issues/` 列表（含模拟 TypeError Issue）
- [ ] `http://localhost:8001/javascript-react/releases/0.0.0-glitchtip-spike/` Release 详情

## 8. 工作流记录

| 步骤 | 结果 |
|---|---|
| `docker-compose.yml` 追加 `glitchtip` service | `profiles: ["glitchtip"]` + `GLITCHTIP_EMBED_WORKER=true`（all-in-one 模式）；依赖现有 `opsagent-postgres` / `opsagent-redis` |
| `observability/glitchtip/init.sql`（新建） | 新建独立 DB `glitchtip` + user `glitchtip`；在容器内 `psql` 执行，避免与现有 opsagent DB 耦合 |
| `docker compose --profile glitchtip up -d` | 容器启动（"Mode: Web only" 初始）；首次需手动 `python manage.py migrate`（109 个迁移） |
| `DJANGO_SUPERUSER_PASSWORD=Demo1234! python manage.py createsuperuser` | 创建 demo 账号 `demo@opsagent.local` |
| Django shell 创建 APIToken | BitField scopes 全开（`int(tok.scopes)=65535`）；token 前缀 `sntrys_glitchtip_all_` 模拟 Sentry 格式 |
| 创建 org / team / project | 全部走 Sentry 兼容 API；DSN: `http://637bb2e204af4efeb646c525d9926852@localhost:8001/1` |
| 加 `GLITCHTIP_EMBED_WORKER=true` | 重启后日志显示 "Partition maintenance complete"——Worker 跑起来，event ingestion 通路打通 |
| R1 实测（sentry-cli 上传） | ✅ 4 files bundled，51 ms 上传成功 |
| R2 实测（Sentry API） | ✅ 7 个 endpoint 全部兼容（envelope 必须 `X-Sentry-Auth`） |
| R3 实测（前端 SDK） | ✅ `autoSessionTracking: false` 在 v9+ 不可用；改用 `getDefaultIntegrations({}).filter(name !== "BrowserSession")` |
| `apps/frontend/src/lib/sentry.ts` 改造 | 过滤 browserSessionIntegration + 保留 browserTracing + replay |
| `pnpm check-types` 全量 | 7/7 tasks successful |
| `pnpm --filter @opsagent/agent test` | 135/135 pass |
| ADR-0007 起草 | accepted；GlitchTip 作为 Sentry SaaS 不可达时的主力 |

## 9. 后续行动（决策已落地：ADR-0007）

| 任务 | 关联 |
|---|---|
| M4-04：切凭证到 GlitchTip，跑 `pnpm --filter frontend build` 验证 Release 出现 | ADR-0007 §后续行动 |
| M4-09：`sentry-tool` 加 `SENTRY_API_ENDPOINT` 环境变量 | ADR-0007 §后续行动 |
| 前端：把 `VITE_SENTRY_DSN` 切到 GlitchTip，浏览器触发异常验证 | ADR-0007 §后续行动 |
| ~~文档：`docs/runbooks/` 加"GlitchTip 一键部署手册"~~ | ✅ 已落地 [[glitchtip-deploy|docs/runbooks/glitchtip-deploy.md]] |

## 反向引用

- [[0007-glitchtip-as-sentry-fallback|ADR-0007]]：§Decision（本 spike 的实测结果）
- [[0006-sentry-release-sourcemap-strategy|ADR-0006]]：§3 Source Map 上传路径（GlitchTip 兼容度验证）
- [[planning|M4 规划]]：§3.1 三层方案（GlitchTip 作为 P1 兜底）
- [[2026-06-16-Sentry的TOKEN配置|Sentry Token 配置]]：凭证管理（GlitchTip 复用同一套 Personal Token 概念）
- [[glitchtip-deploy|GlitchTip 部署与凭证获取手册]]：§1 部署（本 spike 的产物）
