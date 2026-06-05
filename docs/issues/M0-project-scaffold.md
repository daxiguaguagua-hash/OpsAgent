# M0 项目骨架与治理文件

## 1. 目标

M0 是 OpsAgent 的第一个工程闭环。目标不是实现业务功能，而是先把项目骨架、技术约束、治理文件和后续协作规则定下来。

```mermaid
flowchart LR
  A[M0 开始] --> B[确认技术栈]
  B --> C[创建 Monorepo 单仓多项目骨架]
  C --> D[增加治理文件]
  D --> E[增加基础 Docker Compose 容器编排]
  E --> F[验证结构可用]
  F --> G[M0 结束]
```

## 2. 背景

OpsAgent 是跨端项目，包含 Frontend（前端）、Backend（后端）、Agent（智能体）、Observability（可观测性）和 GitLab（企业代码托管平台）企业模拟能力。

为了避免后续返工，M0 必须先确定这些工程原则：

| 原则 | 说明 |
|---|---|
| TypeScript-first | 全项目优先 TypeScript（类型脚本） |
| ESM-first | 优先使用 ESM（现代模块系统），避免 CommonJS（旧模块系统） |
| Monorepo | 使用单仓多项目结构管理前端、后端、Agent、共享类型 |
| CodeGraph-friendly | 代码结构要便于 CodeGraph（代码图谱工具）做符号索引、调用追踪和影响面分析 |
| Docker-first infra | 数据库、缓存、可观测性组件优先用 Docker（容器）启动 |
| Human-in-the-loop | AI（人工智能）只生成建议，不自动合并、不自动上线 |

## 3. 技术决策

### 3.1 Monorepo 结构

采用 `apps/` + `packages/` 结构：

```text
OpsAgent/
  apps/
    frontend/
    backend/
    agent/
  packages/
    shared/
  observability/
  docs/
  docker-compose.yml
  package.json
  pnpm-workspace.yaml
  turbo.json
```

关系：

```mermaid
flowchart LR
  Shared[packages/shared 共享类型] --> FE[apps/frontend 前端]
  Shared --> BE[apps/backend 后端]
  Shared --> AG[apps/agent 智能体]
```

### 3.2 包管理与任务编排

| 工具 | 作用 |
|---|---|
| pnpm workspace | 管理 monorepo（单仓多项目）依赖 |
| Turborepo | 管理 dev/build/test/lint 任务编排和缓存 |
| TypeScript | 提供跨端类型安全 |
| Docker Compose | 本地启动 PostgreSQL、Redis 等依赖 |

M0 只使用 Turborepo（任务编排工具）的最小能力：

```json
{
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "lint": {}
  }
}
```

暂时不引入：

| 暂不引入 | 原因 |
|---|---|
| remote cache | 远程缓存，当前个人开发暂时不需要 |
| 复杂发布 pipeline | 发布流程还没开始 |
| 多环境矩阵 | v0.1 先聚焦本地 demo（演示项目） |

### 3.3 better-t-stack 使用策略

Better-T-Stack 是 TypeScript（类型脚本）全栈项目脚手架。它适合参考，但不直接决定 OpsAgent 架构。

M0 中把它作为 spike（技术试验）：

```mermaid
flowchart TD
  A[临时目录试跑 better-t-stack] --> B[观察生成结构]
  B --> C[挑选可复用方案]
  C --> D[正式项目手动落地]
```

建议命令：

```bash
pnpm create better-t-stack@latest /tmp/opsagent-stack-spike
```

验收方式：

| 项目 | 标准 |
|---|---|
| 是否必须采用 | 否 |
| 是否必须调研 | 是 |
| 产出 | 在 M0 总结中说明采用/不采用哪些结构 |

### 3.4 CodeGraph 友好约束

为了让 CodeGraph（代码图谱工具）后续能快速回答“哪里定义、谁调用、改了影响谁”，M0 开始就避免动态结构。

约束：

| 约束 | 说明 |
|---|---|
| 显式 `import/export` | 避免动态 `require` |
| 共享类型集中 | 重要业务类型放 `packages/shared` |
| 函数命名清晰 | 便于符号搜索 |
| 模块边界稳定 | frontend/backend/agent 不互相乱引用 |
| 类型优先 | 重要数据结构必须有 interface/type |

示例共享类型：

```ts
export interface IncidentReport {
  id: string;
  severity: "low" | "medium" | "high" | "critical";
  summary: string;
  evidence: Evidence[];
  recommendations: Recommendation[];
}
```

## 4. 范围

### 4.1 M0 必须做

| 任务 ID | 任务 | 优先级 |
|---|---|---:|
| M0-01 | 创建 `apps/`、`packages/`、`observability/`、`docs/` 目录结构 | P0 |
| M0-02 | 增加 `.gitignore` | P0 |
| M0-03 | 增加 `.env.example` | P0 |
| M0-04 | 增加 `package.json`、`pnpm-workspace.yaml`、`turbo.json` | P0 |
| M0-05 | 增加 `packages/shared` 最小 TypeScript 包 | P0 |
| M0-06 | 增加基础 `docker-compose.yml`，包含 PostgreSQL 和 Redis | P0 |
| M0-07 | 增加 `CODEOWNERS` 示例 | P1 |
| M0-08 | 增加 `docs/team-ownership.md` | P1 |
| M0-09 | better-t-stack spike（技术试验）并记录结论 | P1 |
| M0-10 | 增加 CodeGraph 初始化说明 | P1 |

### 4.2 M0 不做

| 不做 | 原因 |
|---|---|
| 前端页面实现 | 放到 M1 |
| 后端业务接口 | 放到 M1 |
| Mastra Agent 实现 | 放到 M3 |
| Prometheus/Loki/Grafana | 放到 M2 |
| GitLab 企业模拟 Compose profile | 放到 M5 |
| Source Map 反解 | 放到 M4 |

## 5. 验收标准

M0 完成时必须满足：

| 验收项 | 标准 |
|---|---|
| 目录结构 | `apps/frontend`、`apps/backend`、`apps/agent`、`packages/shared` 存在 |
| TypeScript 基础 | `packages/shared` 可以通过 `pnpm build` 构建 |
| Turbo 基础 | 根目录存在 `turbo.json`，根命令定义 `dev/build/test/lint` |
| Workspace 基础 | `pnpm-workspace.yaml` 覆盖 `apps/*` 和 `packages/*` |
| Docker 基础 | `docker compose config` 能通过配置检查 |
| 环境示例 | `.env.example` 包含数据库、Redis、模型 provider（模型提供方） |
| 文档入口 | README（项目说明）能链接到任务拆分和 M0 文档 |
| 安全 | `.env`、密钥、Token（访问令牌）不会进入 Git |

## 6. 验证命令

M0 的验证命令：

```bash
pnpm install
pnpm build
pnpm lint
docker compose config
git status --short
```

如果某个命令暂时不能运行，必须在最终汇报里说明原因。

## 7. Agent 执行工作流

通用流程见：[docs/workflows/agent-execution-workflow.md](../workflows/agent-execution-workflow.md)

使用 Claude Code 或 DeepSeek 执行 M0 时，推荐使用这个 `/goal`：

```text
/goal M0 项目骨架闭环完成：apps/frontend、apps/backend、apps/agent、packages/shared、observability、docs 目录存在；pnpm workspace 和 turbo 最小配置可用；packages/shared 可构建；docker-compose.yml 至少包含 PostgreSQL 和 Redis 且 docker compose config 通过；.gitignore、.env.example、CODEOWNERS 和 docs/team-ownership.md 已创建；README 链接到 M0 文档；git status 干净或只剩用户明确允许的改动。
```

M0 专属 Stop Gate（停止门）除了通用检查外，还要检查：

- [ ] `apps/frontend`、`apps/backend`、`apps/agent`、`packages/shared` 是否存在
- [ ] `pnpm-workspace.yaml` 和 `turbo.json` 是否存在
- [ ] `packages/shared` 是否可构建
- [ ] `docker compose config` 是否通过
- [ ] `.env.example` 是否覆盖数据库、Redis、模型 provider（模型提供方）

## 8. 完成汇报模板

M0 完成后汇报：

```text
M0 完成情况：
- 已完成：
- 未完成/延期：
- 验证命令：
- 风险：
- 下一步建议：
```

## 9. 当前状态

状态：待开始。

下一步：

```mermaid
flowchart LR
  A[确认 M0 文档] --> B[执行 M0-01 到 M0-06]
  B --> C[运行验证]
  C --> D[更新文档]
  D --> E[提交]
```
