# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在此仓库中工作提供指导。

## 项目定位

OpsAgent 是一个 **AI Ops 智能运维本地演示项目**，基于 Docker Compose 一键启动，模拟企业级故障响应闭环。当服务出现错误、延迟升高、前端页面崩溃时，系统自动聚合日志、指标、链路追踪和源码上下文，由 AI Agent 生成根因分析和修复建议，最终交给人类审核。

基于 [better-t-stack](https://www.better-t-stack.dev/) v3.31.1 脚手架生成。`bts.jsonc` 记录了完整的 `create-better-t-stack` 命令。

## 大仓常用命令

所有命令在仓库根目录执行，包管理器为 `pnpm@10.33.2`。

```bash
pnpm dev              # 启动所有应用开发模式 (turbo dev, 常驻, 不走缓存)
pnpm build            # 构建所有包和应用
pnpm check-types      # 对所有包做类型检查

# 单应用开发
pnpm dev:frontend     # turbo -F frontend dev (Vite, 端口 3001)
pnpm dev:backend      # turbo -F backend dev (Hono, 端口取 env PORT)
pnpm dev:agent        # turbo -F @opsagent/agent dev

# 基础设施 (PostgreSQL 16 + Redis 7)
pnpm infra:up         # docker compose up -d
pnpm infra:down       # docker compose down

# 数据库 (Drizzle ORM)
pnpm db:push          # 直接推送 schema 到数据库（不走迁移）
pnpm db:generate      # 生成迁移文件
pnpm db:migrate       # 执行迁移
pnpm db:studio        # 打开 Drizzle Studio 管理界面
```

### 单包命令

通过 `turbo -F <包名>` 筛选执行：
```bash
pnpm -F frontend build
pnpm -F @opsagent/db db:push
```

## 架构

```
apps/agent/       → Mastra AI Agent（M0 阶段仅做 mock 冒烟测试）
apps/backend/     → Hono HTTP 服务 + tRPC 端点
apps/frontend/    → React 19 + TanStack Router + Tailwind v4 + tRPC 客户端
packages/api/     → tRPC 路由定义（前后端共享类型）
packages/db/      → Drizzle ORM schema、迁移文件、DB 客户端工厂
packages/env/     → @t3-oss/env-core + Zod 环境变量校验（server.ts / web.ts）
packages/shared/  → 共享类型：IncidentReport、Evidence、Recommendation
packages/ui/      → shadcn/ui 组件 + Tailwind v4 + CVA
packages/config/  → 共享 tsconfig.base.json
observability/    → Prometheus/Loki/Grafana/OTel 配置（M0：仅占位目录）
```

### 数据流向

```
前端 (React) ──tRPC over HTTP──→ 后端 (Hono)
                                    │
                                    ├── Drizzle ORM → PostgreSQL
                                    ├── Redis (缓存)
                                    └── OpenTelemetry → Prometheus/Loki/Tempo
                                          │
                                          └── Grafana 可视化看板
                                          │
                Agent (Mastra) ←─────────┘ 读取指标/日志/链路
                     │
                     └──→ LLM (Ollama 本地 / OpenAI 云端 / mock) → IncidentReport 故障报告
```

### tRPC 设置

- 路由定义位置：`packages/api/src/routers/index.ts` —— 新增过程在这里添加
- `AppRouter` 类型由 `apps/backend/src/index.ts`（服务端）和 `apps/frontend/src/utils/trpc.ts`（客户端）共同消费
- Context 在 `packages/api/src/context.ts` 中创建 —— `auth` 和 `session` 目前均为 `null`（尚未接入认证）

### 环境变量

在 `packages/env/` 中定义和校验：
- **服务端** (`packages/env/src/server.ts`)：`PORT`、`DATABASE_URL`、`CORS_ORIGIN`、`MODEL_PROVIDER`、`OLLAMA_MODEL`、`NODE_ENV`
- **前端** (`packages/env/src/web.ts`)：`VITE_SERVER_URL`（前缀 `VITE_`）

根目录 `.env.example` 展示了期望的变量结构。复制为 `.env`，`.env` 已被 gitignore。

### Agent 模型策略

Agent 通过 `MODEL_PROVIDER` 环境变量支持三种模式：

| 值 | 行为 |
|-------|----------|
| `mock` | 返回预设结果（默认，无需网络） |
| `openai` | 云端模型（需要 API Key） |
| `ollama` | 本地 Ollama 推理（默认使用 `qwen2.5-coder:14b`） |

## Claude Code 治理钩子

本项目使用 Claude Code hooks 作为治理层：

- **PreToolUse 钩子** (`.claude/hooks/pre-tool-guard.sh`)：
  - 阻止写入密钥文件（`.env`、`*.pem`、`*.key`、私钥）
  - 阻止危险命令（`git reset --hard`、`rm -rf`、`docker compose down -v` 等），除非设置 `OPSAGENT_ALLOW_DESTRUCTIVE=1`
  - 当 `.claude/active-goal` 存在时，按阶段约束文件修改范围（例如 `M0` 阶段仅允许修改脚手架路径）

- **Stop 钩子** (`.claude/hooks/stop-check.sh`)：
  - 当 `.claude/active-goal` 存在时，校验必需的文件和目录是否存在
  - 执行 `docker compose config` 和 `pnpm build` 作为门禁
  - 当前活跃的阶段：`M0` —— 检查脚手架结构、必需文档、工作区配置和构建是否通过

`.claude/active-goal` 文件已被 **gitignore**，属于开发者本地状态。开始新阶段时创建此文件，一行写入阶段名即可（如 `M1`）。完成后删除或归档。

### 阶段工作流

阶段是一个命名的工作周期（如 `M0`、`M1-api-scaffold`），钩子用它来控制文件修改范围和验收门禁。创建 `.claude/active-goal`，第一行写阶段名。

## 关键约定

- **包命名**：应用使用裸名（`frontend`、`backend`），包使用 `@opsagent/` 作用域
- **ESM 优先**：所有包设置 `"type": "module"`，源码中 import 写 `.ts` 后缀
- **workspace 协议**：内部依赖在 package.json 中使用 `"workspace:*"`
- **Catalog 版本**：公共依赖版本集中在 `pnpm-workspace.yaml` 的 `catalog:` 下，package.json 中引用 `"catalog:"`
- **TypeScript 6**：项目使用 TS 6（见 catalog）
- **后端构建**：使用 `tsdown`（非 tsc）—— 配置在 `apps/backend/tsdown.config.ts`
- **前端开发端口**：3001（不是 `.env.example` 中的默认 5173；`vite.config.ts` 覆盖了端口）

### 禁止领域字符串硬编码

参与程序判断、状态转换、跨模块协议、配置读取或重复使用的字符串，必须从统一定义导入。

```typescript
// 禁止
if (task.status === "planned") {}

// 推荐
if (task.status === TASK_STATUS.PLANNED) {}
```

Task Status（任务状态）、Role（角色）、Actor ID（执行者标识）、Message Type（消息类型）、Error Code（错误代码）、路径、配置键和固定命令应按领域放入 `constants/` 或对应领域模块，使用 `as const` 对象派生类型。不要把所有字符串集中到一个巨型文件。

新增领域值时必须先复用或扩展统一定义。详细规则见 `docs/workflows/agent-execution-workflow.md` 的 TypeScript 领域字符串规范。

## CI / Docker Compose 校验

```bash
pnpm compose:config   # 校验 docker-compose.yml 语法
```

Docker Compose 启动 PostgreSQL 16 和 Redis 7，含健康检查。卷已命名且持久化。

## 文档

`docs/` 中的关键文档：
- `docs/AI-Ops-Demo-清单.md` — 完整项目规格与规划
- `docs/task-breakdown.md` — 里程碑、任务卡片、交付物
- `docs/team-ownership.md` — 模拟团队边界（frontend/backend/agent/sre/docs）
- `docs/codegraph.md` — CodeGraph 使用规则与约束
- `docs/workflows/agent-execution-workflow.md` — `/goal` 命令、钩子门禁、完成汇报模板
