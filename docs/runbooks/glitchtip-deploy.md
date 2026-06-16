# GlitchTip 部署与凭证获取手册

**日期**：2026-06-16
**关联**：[[0007-glitchtip-as-sentry-fallback|ADR-0007]] / [[M4-11-glitchtip-sentry-fallback-spike|M4-11 spike]]
**性质**：运维手册（runbook）

## 1. 部署（首次安装）

### 1.1 启动容器

GlitchTip 在本项目以 docker-compose profile 模式运行，**默认 `docker compose up` 不会启动**，避免污染开发环境。

```bash
# 启动（首次约 30s）
docker compose --profile glitchtip up -d

# 验证
docker ps | grep glitchtip
# 期望：opsagent-glitchtip Up
```

配置位于 `docker-compose.yml` 的 `glitchtip` service：

| 配置项 | 值 | 说明 |
|---|---|---|
| `profiles: ["glitchtip"]` | profile 模式 | 默认不启动 |
| `GLITCHTIP_EMBED_WORKER` | `true` | All-in-one（Web + Worker 同容器）|
| `GLITCHTIP_ENABLE_MCP` | `True` | 启用官方 MCP Server（AI Agent 直连）|
| `ENABLE_OPEN_USER_REGISTRATION` | `true` | demo 期开放；生产关闭 |
| `EMAIL_URL` | `consolemail://` | 邮件打到容器日志 |
| `DATABASE_URL` | 复用 `opsagent-postgres`（独立 DB `glitchtip`） | 数据隔离 |
| `REDIS_URL` | 复用 `opsagent-redis`（db=1） | db=0 留给 opsagent |

### 1.2 初始化数据库（首次必做）

容器启动后，**首次必须手动建库 + 跑 migrate + 建账号**（GlitchTip 官方镜像不自动 migrate）。

```bash
# 1. 在 opsagent-postgres 容器内执行 init.sql
docker exec -i opsagent-postgres psql -U postgres -d opsagent \
  < observability/glitchtip/init.sql
# 期望：DO / CREATE DATABASE / GRANT

# 2. 跑 Django migrate（109 个迁移，约 30s）
docker exec opsagent-glitchtip sh -c "python manage.py migrate" 2>&1 | tail -5
# 期望：Applying users.0013_populate_user_and_token... OK

# 3. 创建 superuser（Web UI 登录用）
docker exec opsagent-glitchtip sh -c \
  "DJANGO_SUPERUSER_PASSWORD='Demo1234!' python manage.py createsuperuser \
   --noinput --email demo@opsagent.local"
# 期望：Superuser created successfully.
```

### 1.3 启动 Worker（生产分离场景才需要）

本项目用 `GLITCHTIP_EMBED_WORKER=true` 已让 Web + Worker 在同一容器。**生产环境建议分离**：

```yaml
# 生产 docker-compose.yml 示例
glitchtip-web:
  image: glitchtip/glitchtip:latest
  environment:
    SERVER_ROLE: web
glitchtip-worker:
  image: glitchtip/glitchtip:latest
  environment:
    SERVER_ROLE: worker
```

## 2. 获取凭证

### 2.1 DSN（前端 SDK 用）

**3 种方式（任一）**：

#### 方式 A：Web UI（最直观）

```
http://localhost:8001/
  → 登录 demo@opsagent.local / Demo1234!
  → 顶部 Projects 选 javascript-react
  → 左侧 Issues  →  页面顶部有 DSN 复制按钮
  或
  → Settings（项目级）→ Keys  →  看 Public / Secret / Security DSN
```

#### 方式 B：API（`/api/0/projects/{org}/{project}/keys/`）

```bash
curl -H "Authorization: Bearer $TOKEN" \
     http://localhost:8001/api/0/projects/opsagent/javascript-react/keys/
```

返回示例：

```json
[{
  "id": "637bb2e2-04af-4efe-b646-c525d9926852",
  "dsn": {
    "public":   "http://637bb2e204af4efeb646c525d9926852@localhost:8001/1",
    "secret":   "http://637bb2e204af4efeb646c525d9926852@localhost:8001/1",
    "security": "http://localhost:8001/api/1/security/?glitchtip_key=..."
  },
  "projectID": 1
}]
```

**DSN 格式解析**：`<protocol>://<public-key>@<host>:<port>/<project-id>`。本例 public-key `637bb2e204af4efeb646c525d9926852` + project-id `1`。

#### 方式 C：Django shell（API 不通时的 fallback）

```bash
docker exec opsagent-glitchtip sh -c "python manage.py shell -c \"
from projects.models import ProjectKey
for k in ProjectKey.objects.all():
    print('DSN:', k.get_dsn())
\""
```

### 2.2 Auth Token（CLI / MCP / sentry-tool 用）

**3 种方式（任一）**：

#### 方式 A：Web UI（推荐）

```
http://localhost:8001/
  → 右上角用户头像 → Profile / Settings
  → Auth Tokens（或 API Tokens）
  → Create New Token
  → 勾选 scopes（至少 org:read / project:read / project:write / project:releases）
  → Create
  → 立即复制（仅显示一次）
```

⚠️ Token 授予访问用户有权限的**所有 projects**，scopes 可按需裁剪。

#### 方式 B：Django shell（API 不通时的 fallback）

GlitchTip **没有暴露"创建 Token"的 REST API**（Sentry SaaS 有，但 GlitchTip 没实现）。只能在容器里跑 Django shell：

```bash
docker exec opsagent-glitchtip sh -c "python manage.py shell -c \"
from django.contrib.auth import get_user_model
from django.apps import apps
import secrets
U = get_user_model()
M = apps.get_model('api_tokens', 'APIToken')
user = U.objects.get(email='demo@opsagent.local')
tok = M(user=user, token='sntrys_glitchtip_' + secrets.token_hex(16), label='cli')
for flag in M._meta.get_field('scopes').flags:
    setattr(tok.scopes, flag, True)
tok.save()
print('TOKEN:', tok.token)
\""
```

Scopes 列表（BitField 16 个 flag）：

```
project:read / project:write / project:admin / project:releases
team:read    / team:write    / team:admin
event:read   / event:write   / event:admin
org:read     / org:write     / org:admin
member:read  / member:write  / member:admin
```

#### 方式 C：glitchtip-cli / sentry-cli 交互式登录

```bash
# 写到 ~/.sentryclirc
sentry-cli --url http://localhost:8001 login

# 或用环境变量（不写文件）
SENTRY_URL=http://localhost:8001 \
SENTRY_AUTH_TOKEN=sntrys_glitchtip_... \
SENTRY_ORG=opsagent \
SENTRY_PROJECT=javascript-react \
sentry-cli releases list
```

优先级：CLI flag > 环境变量 > 本地 rc > 全局 rc。

### 2.3 Org / Project slug

```bash
# 列 organizations
curl -H "Authorization: Bearer $TOKEN" http://localhost:8001/api/0/organizations/
# → [{"slug": "opsagent", ...}]

# 列 projects
curl -H "Authorization: Bearer $TOKEN" http://localhost:8001/api/0/projects/
# → [{"slug": "javascript-react", "organization": {"slug": "opsagent"}, ...}]
```

## 3. 当前已创建的凭证（本机可直接用）

| 项 | 值 |
|---|---|
| Web UI | http://localhost:8001/ |
| 用户 | `demo@opsagent.local` / `Demo1234!`（superuser） |
| Organization slug | `opsagent` |
| Team slug | `frontend` |
| Project slug | `javascript-react`（platform: javascript-react） |
| Project ID | `1` |
| **Public DSN** | `http://637bb2e204af4efeb646c525d9926852@localhost:8001/1` |
| **Auth Token** | `sntrys_glitchtip_all_d8fd4e65aa5cb13180ec01704f28587d`（全 scopes） |
| **MCP endpoint** | `http://localhost:8001/mcp`（OAuth flow） |

**DSN 来源**：API 调用 `GET /api/0/projects/opsagent/javascript-react/keys/`（2026-06-16 spike 实测）
**Token 来源**：容器内 Django shell 创建（GlitchTip 没暴露 Token 创建 REST API）

## 4. 切到 GlitchTip（前端 + Agent 配置）

### 4.1 `.env` 5 个变量

```bash
# Sentry SaaS（梯子通时）
VITE_SENTRY_DSN=https://0dfc4efdf997be117fa7de41a2effa2d@o4511561514418176.ingest.us.sentry.io/4511562966499328
SENTRY_AUTH_TOKEN=sntrys_7d1d9a395566...
SENTRY_ORG=none-fez
SENTRY_PROJECT=javascript-react
SENTRY_API_ENDPOINT=           # 默认 https://sentry.io/api/0

# GlitchTip 自建（梯子断时）
VITE_SENTRY_DSN=http://637bb2e204af4efeb646c525d9926852@localhost:8001/1
SENTRY_AUTH_TOKEN=sntrys_glitchtip_all_d8fd4e65aa5cb13180ec01704f28587d
SENTRY_ORG=opsagent
SENTRY_PROJECT=javascript-react
SENTRY_API_ENDPOINT=http://localhost:8001/api/0
```

### 4.2 切到 GlitchTip 不需要重装包

- `@sentry/react` 不用换（GlitchTip 完全兼容 Sentry 协议）
- `@sentry/vite-plugin` 不用换（底层是 sentry-cli，GlitchTip 兼容）
- 前端代码零改动（sentry.ts 已加 `browserSessionIntegration` 过滤，两端通用）

## 5. MCP Server（AI Agent 直连，推荐替代自建 sentry-tool）

### 5.1 启用

docker-compose.yml 已加 `GLITCHTIP_ENABLE_MCP: "True"`（commit `bd0d67d`）。MCP endpoint：

```
http://localhost:8001/mcp
```

### 5.2 内置 17 个 tools（按类别）

| 类别 | Tools |
|---|---|
| Organization / Project | list_organizations, list_projects, ... |
| Issue tracking | list_issues, get_issue, update_issue, resolve_issue, ... |
| Performance | transaction_trends, n_plus_1_query_patterns, ... |
| Alerting | list_alerts, list_monitors, ... |
| Logs | search_log_events, ... |

### 5.3 OAuth 流程（AI 客户端自动完成）

```bash
# OAuth discovery metadata
curl http://localhost:8001/.well-known/oauth-protected-resource/mcp
# → {"resource":"http://localhost:8001/mcp",
#    "authorization_servers":["http://localhost:8001/mcp"],
#    "bearer_methods_supported":["header"]}

# OAuth authorization server metadata
curl http://localhost:8001/.well-known/oauth-authorization-server
# → authorization_endpoint / token_endpoint / registration_endpoint
#   scopes_supported: org:read / project:read / event:read / event:write
#   grant_types: authorization_code / refresh_token
#   code_challenge: S256 (PKCE)
```

### 5.4 在 Claude Desktop / Qoder CLI / Cursor 里配置

```json
{
  "mcpServers": {
    "glitchtip": {
      "url": "http://localhost:8001/mcp"
    }
  }
}
```

客户端首次连接时自动跑 OAuth flow，用户登录 `demo@opsagent.local` 即可。

### 5.5 与自建 sentry-tool 的对比

| 维度 | GlitchTip MCP Server | 自建 sentry-tool（M4-09） |
|---|---|---|
| 工具数量 | 17 个 | 2 个（list / get） |
| 维护成本 | 官方维护 | 自己维护 |
| 跨平台 | 任何 MCP 客户端 | 仅限 Mastra agent |
| 性能分析 | ✅ transaction_trends / N+1 query | ❌ |
| Alert 管理 | ✅ | ❌ |
| Log 搜索 | ✅ | ❌ |
| **Qoder CLI 兼容** | ⚠️ OAuth 握手失败（2026-06-16 实测） | ✅ 直接可用 |
| 离线可用性 | ❌ 必须连 GlitchTip | ❌ 同样必须连 |

**推荐**：
- **Claude Desktop / Cursor（原生 MCP 客户端）** → 直接用 GlitchTip MCP（自动 OAuth）
- **Qoder CLI** → 用 Bearer Token header 绕过 OAuth（见 §5.4），或放弃 MCP 用 sentry-tool
- **Mastra agent（M4-09）** → 保留自建 sentry-tool（Mastra 不是 MCP 客户端）

## 6. 故障排查

| 现象 | 原因 | 修复 |
|---|---|---|
| `docker logs` 报 "109 unapplied migration" | 首次未跑 migrate | `docker exec opsagent-glitchtip python manage.py migrate` |
| `relation "users_user" does not exist` | migrate 未完成 | 同上 |
| API 返回 401 | Token 缺失或 scopes 不足 | 重建 Token 并勾全 scopes |
| envelope 端点返回 403 | 缺 `X-Sentry-Auth` header | 用 sentry-cli 标准方式（`Authorization: Bearer <token>` 也接受，但 envelope 端点必须 `X-Sentry-Auth`） |
| 容器显示 "Mode: Web only" | Worker 未启用 | 检查 `GLITCHTIP_EMBED_WORKER=true` 是否生效 |
| MCP `/mcp` 返回 404 | 未启用 MCP | 加 `GLITCHTIP_ENABLE_MCP=True` 重启 |
| **Qoder CLI `/mcp reload` 卡在 "Needs authentication"** | GlitchTip 的 OAuth 实现（authorization_code + PKCE S256）与 Qoder CLI MCP 客户端未完全兼容——访问 `/mcp` 直返 `{"error":"invalid_token","error_description":"Authentication required"}`，浏览器 OAuth 流程未触发。**2026-06-16 实测确认** | (a) 在 Qoder settings.json 给 glitchtip 加 `headers.Authorization: "Bearer <token>"` 跳过 OAuth；(b) **推荐**：放弃 MCP，用 M4-09 自建 sentry-tool；(c) 改用 Claude Desktop（官方文档说自动处理 OAuth） |
| DSN 拿不到 | 未建 Project | `POST /api/0/teams/{org}/{team}/projects/` 建一个 |

## 7. 卸载 / 重置

```bash
# 停容器（保留数据）
docker compose --profile glitchtip down

# 完全清理（删 DB + Redis db=1）
docker compose --profile glitchtip down -v
docker exec opsagent-postgres psql -U postgres -c "DROP DATABASE glitchtip;"
docker exec opsagent-postgres psql -U postgres -c "DROP ROLE glitchtip;"
```

## 反向引用

- [[0007-glitchtip-as-sentry-fallback|ADR-0007]]：§Consequences（GlitchTip 部署落地）
- [[M4-11-glitchtip-sentry-fallback-spike|M4-11 任务卡]]：§9 后续行动（"一键部署手册"）
- [[2026-06-16-Sentry的TOKEN配置|Sentry Token 配置]]：Sentry SaaS 端 Token 获取对比
