# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在此仓库中工作提供指导。

## 项目定位

OpsAgent 是一个 **AI Ops 智能运维本地演示项目**，基于 Docker Compose 一键启动，模拟企业级故障响应闭环。当服务出现错误、延迟升高、前端页面崩溃时，系统自动聚合日志、指标、链路追踪和源码上下文，由 AI Agent 生成根因分析和修复建议，最终交给人类审核。

基于 [better-t-stack](https://www.better-t-stack.dev/) v3.31.1 脚手架生成。`bts.jsonc` 记录了完整的 `create-better-t-stack` 命令。

## 里程碑路线图

当前阶段由 `.claude/active-goal` 控制（当前：**M2**）。

| 里程碑 | 内容 | 状态 |
|---|---|---|
| M0 | 治理框架、多 Agent 工作流、消息总线、任务状态机 | 已完成 |
| M1 | 最小业务系统（订单 CRUD）与智能体工作流验收 | 已完成 |
| M2 | 可观测性基础闭环（Prometheus + Loki + Tempo + Grafana） | 进行中（M2-01 至 M2-04 已完成，Grafana 已自动接入 Prometheus 与 Loki） |
| M3 | AI 分析 + GBrain RAG 文档知识检索 | 规划中 |
| M4 | 前端源码定位（Sentry + 简化自研反解） | 规划中 |

## 大仓常用命令

所有命令在仓库根目录执行，包管理器为 `pnpm@10.33.2`。

```bash
pnpm dev              # 启动所有应用开发模式 (turbo dev, 常驻, 不走缓存)
pnpm build            # 构建所有包和应用
pnpm test             # 运行所有测试 (turbo test)
pnpm check-types      # 对所有包做类型检查

# 单包测试（各包使用自身配置的测试运行器）
pnpm -F backend test
pnpm -F @opsagent/db test

# 单应用开发
pnpm dev:frontend     # turbo -F frontend dev (Vite, 端口 3001)
pnpm dev:backend      # turbo -F backend dev (Hono, 端口取 env PORT)
pnpm dev:agent        # turbo -F @opsagent/agent dev

# 基础设施 (PostgreSQL 16 + Redis 7 + Prometheus + Loki + Alloy + Grafana)
pnpm infra:up         # docker compose up -d
pnpm infra:down       # docker compose down

# 数据库 (Drizzle ORM)
pnpm db:push          # 直接推送 schema 到数据库（不走迁移）
pnpm db:generate      # 生成迁移文件
pnpm db:migrate       # 执行迁移
pnpm db:studio        # 打开 Drizzle Studio 管理界面
pnpm db:start         # 启动数据库容器
pnpm db:stop          # 停止数据库容器
pnpm db:down          # 停止并删除数据库容器
pnpm db:watch         # 监听 schema 变化自动推送
```

### 任务工作流 CLI

`packages/workflow-gates/` 提供多角色任务管理命令，任务数据存储在 `.agent/` 目录：

> 所有 `task:*` 和 `msg:*` 命令通过 `node --experimental-strip-types` 直接运行 TypeScript 源码，无需预编译。

```bash
# 创建和定义当前任务
pnpm task:create -- <任务ID> "<标题>" <类型>     # 创建活动任务（类型：architecture|implementation|testing|release）
pnpm task:scope -- <范围描述>                    # 设置当前任务范围
pnpm task:criteria -- <验收标准>                 # 设置当前任务验收标准

# 测试治理
pnpm task:test-impact -- <add|update|none> "<理由>" [提出者]
pnpm task:test-plan -- <测试计划>
pnpm task:verify-command -- <验证命令>
pnpm task:test-approve                           # Codex 批准测试变更（达成共识）

# 执行和交接
pnpm task:start                                  # planned → implementing
pnpm task:handoff -- <目标角色>                  # 按状态机交接当前任务
pnpm task:execute -- --approve-external-data     # 执行当前角色；外部模型需人工批准仓库上下文

# 查看和关闭
pnpm task:show                                   # 查看当前任务详情
pnpm task:status -- <目标状态>                   # 手动推进到指定合法状态
pnpm task:next                                   # 查看下一角色和建议命令
pnpm task:evidence -- <证据描述>                 # 附加测试证据
pnpm task:validate                               # 校验当前任务门禁
pnpm task:review                                 # 标记进入审查
pnpm task:finish                                 # 标记任务完成
pnpm task:close                                  # 归档任务
```

### Agent 消息总线

```bash
pnpm msg:send -- <任务ID> <from> <to> <类型> "<主题>" "<内容>"
pnpm msg:inbox -- <actor名>                       # 查看收件箱
pnpm msg:outbox -- <actor名>                      # 查看发件箱
pnpm msg:show -- <接收者> <消息ID>                # 查看消息详情
pnpm msg:read -- <接收者> <消息ID>                # 标记已读
pnpm msg:reply -- <接收者> <消息ID> <发送者> <类型> "<回复内容>" # 回复消息
pnpm msg:resolve -- <接收者> <消息ID>             # 标记已解决
```

### 单包命令

通过 `turbo -F <包名>` 筛选执行：
```bash
pnpm -F frontend build
pnpm -F @opsagent/db db:push

# 单包测试和类型检查
pnpm -F backend test
pnpm -F @opsagent/db test
pnpm -F backend check-types
```

### 验证命令

```bash
pnpm --filter @opsagent/db db:verify    # 验证 DB 可读写（insert → select → delete 闭环）
pnpm --filter backend cache:verify       # 验证 Redis 缓存连通性
pnpm compose:config                     # 校验 docker-compose.yml 语法
```

## 架构

本项目已初始化 `.codegraph/`（基于 tree-sitter AST 的代码索引）。查找符号、追踪调用链、分析变更影响时，优先使用 `codegraph_*` MCP 工具，不要以 grep/Read 起步。详细规则见 `docs/codegraph.md` 和用户级 `CLAUDE.md`。

```
apps/agent/       → Mastra AI Agent（仅做 mock 冒烟测试）
apps/backend/     → Hono HTTP 服务 + tRPC 端点
  src/business/   → 业务服务层（orders.ts、demo.ts）—— 每个子目录有独立的 constants.ts
  src/cache/      → Redis 缓存客户端（懒加载单例）
  src/http/       → HTTP 路由常量、状态码、错误类
  src/observability/ → 结构化 JSON 日志、traceId 传播、Prometheus 指标（prom-client Counter + Histogram）
apps/frontend/    → React 19 + TanStack Router + Tailwind v4 + tRPC 客户端
  src/lib/        → 前端业务逻辑（opsApi.ts API 客户端、constants.ts）
packages/api/     → tRPC 路由定义（前后端共享类型）
packages/db/      → Drizzle ORM schema、迁移文件、DB 客户端工厂
  src/orders.ts   → 订单 CRUD（createOrder、listOrders、countOrders）
  src/verify.ts   → DB 可写验证脚本
packages/env/     → @t3-oss/env-core + Zod 环境变量校验（server.ts / web.ts）
packages/shared/  → 共享类型：IncidentReport、Evidence、Recommendation，以及 OPS_API_ROUTE 等常量
packages/ui/      → shadcn/ui 组件 + Tailwind v4 + CVA
packages/config/         → 共享 tsconfig.base.json
packages/workflow-gates/ → 多角色任务状态机、消息总线、Actor 运行时、编排引擎
observability/           → Prometheus/Loki/Tempo/Grafana/OTel 配置（M2 建设中）
```

### 多 Agent 工作流层

`packages/workflow-gates/` 实现了一个模拟多 Agent 协作的本地工作流系统：

- **`taskState.ts`** — 任务状态机：`planned` → `implementing` → `testing` → `ready_for_review` → `completed`
- **`taskTypes.ts`** — 核心类型：`ActiveTask`、`RolePolicy`、`ExecutionBrief`、`AgentMessage`
- **`orchestration.ts`** — 编排引擎：根据角色策略生成下一步执行指令
- **`messageBus.ts`** — Agent 间消息总线：支持 `task_assignment`、`execution_result`、`test_change_request`、`review_request`、`decision`、`clarification` 消息类型
- **`actorRuntime.ts`** — Actor 执行运行时：将 `ExecutionRequest` 转化为实际 CLI 调用
- **`rolePolicy.ts`** — 角色策略：定义 architect/implementer/tester/test-strategist/reviewer/approver 分工

**六个角色**（定义在 `.agent/role-policy.json`）：

| 角色 | 当前执行者 | 职责 |
|---|---|---|
| architect | gpt5.5 | 架构、任务拆分、验收标准 |
| implementer | ClaudeCode | 先执行 `/init` 增量维护本文件，再承担主要编码实现 |
| test-strategist | Codex | 测试影响分析、用例设计 |
| tester | ClaudeCode（全新只读上下文） | 测试执行、回归检查，不修改代码 |
| reviewer | gpt5.5 | 代码审查、测试证据审查 |
| approver | Human | 范围决策、发布授权 |

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

### 可观测性组件职责（M2）

| 组件 | 角色 | 回答的问题 |
|---|---|---|
| Prometheus | 指标存储 | 问题是否发生、影响多大（请求量、错误率、延迟） |
| Loki | 日志存储 | 某次请求具体发生了什么（路由、状态码、traceId） |
| Tempo | 链路存储 | 请求慢或失败在哪个步骤（HTTP/DB/Redis 各自耗时） |
| Grafana | 统一查询与可视化 | 跨数据源看板、Explore 查询、告警 |
| OpenTelemetry | 采集标准 | 应用埋点 SDK，产生 traces/metrics/logs |

Sentry 不在 M2 范围，将在 M4 接入，用于前端异常聚合、Release 关联和 Source Map 反解。

### 三层知识系统边界

| 系统 | 回答的问题 |
|---|---|
| OpsAgent PostgreSQL | 当前任务真实处于什么状态？ |
| CodeGraph（`.codegraph/`） | 当前代码在哪里、如何调用、修改会影响什么？ |
| GBrain（M3 接入） | 以前做过什么决定、遇到过什么问题？ |

三者职责不重叠。GBrain 负责历史知识检索（M3），不取代 PostgreSQL 的任务权威状态，也不取代 CodeGraph 的源码结构查询。

### tRPC 设置

- 路由定义位置：`packages/api/src/routers/index.ts` —— 新增过程在这里添加
- `AppRouter` 类型由 `apps/backend/src/index.ts`（服务端）和 `apps/frontend/src/utils/trpc.ts`（客户端）共同消费
- Context 在 `packages/api/src/context.ts` 中创建 —— `auth` 和 `session` 目前均为 `null`（尚未接入认证）

### 环境变量

在 `packages/env/` 中定义和校验：
- **服务端** (`packages/env/src/server.ts`)：`PORT`、`DATABASE_URL`、`REDIS_URL`、`CORS_ORIGIN`、`MODEL_PROVIDER`、`OLLAMA_MODEL`、`NODE_ENV`、`LOG_FILE_PATH`
- **前端** (`packages/env/src/web.ts`)：`VITE_SERVER_URL`（前缀 `VITE_`）

根目录 `.env.example` 展示了期望的变量结构。后端需要 `.env`（复制 `.env.example` 到 `apps/backend/.env`），前端同理。

### Agent 模型策略

Agent 通过 `MODEL_PROVIDER` 环境变量支持三种模式：

| 值 | 行为 |
|-------|----------|
| `mock` | 返回预设结果（默认，无需网络） |
| `openai` | 云端模型（需要 API Key） |
| `ollama` | 本地 Ollama 推理（默认使用 `qwen2.5-coder:14b`） |

## Claude Code 治理钩子

本项目使用 Claude Code hooks 作为治理层，配置在 `.claude/settings.json`。钩子脚本已迁移至 TypeScript 编译版本：

- **PreToolUse 钩子** (`.claude/hooks/pre-tool-guard-ts.sh` → `packages/workflow-gates/src/preToolGuard.ts`)：
  - 阻止写入密钥文件（`.env`、`*.pem`、`*.key`、私钥）
  - 阻止危险命令（`git reset --hard`、`rm -rf`、`docker compose down -v` 等），除非设置 `OPSAGENT_ALLOW_DESTRUCTIVE=1`
  - 当 `.claude/active-goal` 存在时，按阶段约束文件修改范围
  - 当 `.agent/active-task.json` 存在时，校验任务字段完整性（`testImpact` 共识、`testEvidence` 非空、`handoffHistory` 等）

- **Stop 钩子** (`.claude/hooks/stop-check-ts.sh` → `packages/workflow-gates/src/stopCheck.ts`)：
  - 当 `.claude/active-goal` 存在时，校验必需的文件和目录是否存在
  - 执行 `docker compose config` 和 `pnpm build` 作为门禁
  - 校验 `.agent/active-task.json` 的任务门禁要求
  - M1 复用 M0 基础检查，并追加 `pnpm check-types` 与 `pnpm test`

## .agent/ 目录 — 多 Agent 工作流状态

`.agent/` 目录存储多角色工作流的机器可读状态（全部 Git-ignored）：

| 文件 | 作用 |
|---|---|
| `role-policy.json` | 角色定义和任务类型的默认分工 |
| `actor-registry.json` | Actor 适配器注册（claude-code、manual 等） |
| `active-task.json` | 当前活动任务声明 |
| `active-task.example.json` | 任务声明模板 |
| `role-policy.schema.json` | role-policy 的 JSON Schema |
| `actor-registry.schema.json` | actor-registry 的 JSON Schema |
| `message.schema.json` | Agent 消息的 JSON Schema |
| `history/` | 已完成任务的归档 |
| `messages/` | Agent 间消息持久化存储 |

`.claude/active-goal` 文件已被 **gitignore**，属于开发者本地状态。开始新阶段时创建此文件，一行写入阶段名即可（如 `M1`）。完成后删除或归档。

### 阶段工作流

阶段是一个命名的工作周期（如 `M0`、`M1-api-scaffold`），钩子用它来控制文件修改范围和验收门禁。创建 `.claude/active-goal`，第一行写阶段名。

## 关键约定

- **包命名**：应用使用裸名（`frontend`、`backend`），包使用 `@opsagent/` 作用域
- **ESM 优先**：所有包设置 `"type": "module"`，源码中 import 写 `.ts` / `.js` 后缀
- **workspace 协议**：内部依赖在 package.json 中使用 `"workspace:*"`
- **Catalog 版本**：公共依赖版本集中在 `pnpm-workspace.yaml` 的 `catalog:` 下，package.json 中引用 `"catalog:"`
- **TypeScript 6**：项目使用 TS 6（见 catalog）
- **后端构建**：使用 `tsdown`（非 tsc）—— 配置在 `apps/backend/tsdown.config.ts`
- **前端开发端口**：3001（不是 `.env.example` 中的默认 5173；`vite.config.ts` 覆盖了端口）
- **常量按领域存放**：每个业务模块有独立的 `constants.ts`（如 `business/constants.ts`、`http/constants.ts`、`cache/constants.ts`），不要把所有常量集中到一个巨型文件
- **后端分层**：`business/`（业务服务，纯逻辑，可注入）→ `http/`（Hono 路由 + 错误处理）→ `cache/`（Redis 客户端）

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

### 选择性 TDD 与测试治理

本项目采用选择性 TDD，不同场景策略不同：

| 场景 | 策略 |
|---|---|
| 业务规则、状态机、数据转换 | 优先 TDD（先写失败测试） |
| Bug 修复 | 先写复现 Bug 的失败测试 |
| Workflow Gate（工作流门禁） | 优先 TDD |
| 探索性 UI | 先实现，再补行为测试 |
| Docker / 第三方集成 | 先做 spike，再补集成测试 |

**测试修改需经 Codex（test-strategist）批准：**
- 新增或修改任务时，Codex 必须同步判断测试影响（`task:test-impact`）
- 如果业务代码实现者认为已有测试需要修改，必须标记 `action: update` 并与 Codex 协商
- **测试失败不等于测试应该被修改**：优先判断需求是否变化；需求未变时修业务代码，需求变化后由 Codex 与实现者确认新合同
- 未达成共识前任务不得进入审查或完成状态

## CI / Docker Compose 校验

```bash
pnpm compose:config   # 校验 docker-compose.yml 语法
```

Docker Compose 启动 PostgreSQL 16、Redis 7 和 Prometheus，含健康检查。卷已命名且持久化。

Prometheus 抓取后端 `:8000/metrics` 端点，指标由 `prom-client` 库直接暴露（Counter `http_requests_total` + Histogram `http_request_duration_seconds`），当前不经过 OpenTelemetry Collector。

## 文档

`docs/` 中的关键文档：
- `docs/AI-Ops-Demo-清单.md` — 完整项目规格与规划
- `docs/task-breakdown.md` — 里程碑、任务卡片、交付物
- `docs/team-ownership.md` — 模拟团队边界（frontend/backend/agent/sre/docs）
- `docs/codegraph.md` — CodeGraph 使用规则与约束
- `docs/workflows/agent-execution-workflow.md` — `/goal` 命令、钩子门禁、完成汇报模板
- `docs/workflows/agent-role-policy.md` — 多角色任务工作流、任务状态机、测试治理规则
- `docs/issues/` — 各里程碑的详细 Issue 卡片（M0-11 ~ M0-17, M1-01 等）
- `docs/devlog/` — 开发决策日志
