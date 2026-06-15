# M3-01 搭建 Mastra 项目

日期：2026-06-10
状态：`done`
前置任务：M2-08（M2 验收）
负责人：ai-agent-team

## 1. 目标

在 monorepo 中新增 `apps/agent/` 应用，基于 Mastra 框架（`@mastra/core`）搭建 Agent 项目骨架，使智能体服务可以本地启动并运行一次生成调用。

```mermaid
flowchart LR
  Env[环境变量] --> Config[getModelConfigFromEnv]
  Config --> Model[createModel]
  Model --> Agent[createOpsAgent]
  Agent --> Run[main / generate]
```

M3-01 只负责"项目能跑起来"。Provider 抽象、Tool 接入、报告模板不属于本任务。

## 2. 交付物

| 文件 | 说明 |
|---|---|
| `apps/agent/package.json` | `@opsagent/agent` 私有包，ESM，依赖 `@mastra/core` 与 `@opsagent/env` |
| `apps/agent/tsconfig.json` | 继承 `@opsagent/config` 共享配置 |
| `apps/agent/src/index.ts` | 启动入口，完成"加载模型 → 创建 Agent → 生成一次回复"的主流程 |
| `apps/agent/src/agents/index.ts` | `createOpsAgent` 工厂，封装 Mastra `Agent` 构造 |
| `apps/agent/src/agents/index.test.ts` | Agent 工厂单元测试 |

## 3. 验收标准

| 验收项 | 标准 |
|---|---|
| 目录存在 | `apps/agent/` 在 monorepo 中可被发现 |
| 依赖安装 | `pnpm install` 成功解析 `@mastra/core` 与 `@opsagent/env` |
| 本地启动 | `pnpm --filter @opsagent/agent start` 执行 main 不报错 |
| 类型检查 | `pnpm --filter @opsagent/agent check-types` 通过 |
| 单元测试 | `pnpm --filter @opsagent/agent test` 通过 |

## 4. 测试证据

| 验证项 | 结果 |
|---|---|
| `createOpsAgent` 工厂创建 Agent | 通过 |
| Agent `id` / `name` 为 `ops-agent` | 通过 |
| 不同 model 实例创建不同 Agent | 通过 |
| 全仓 `pnpm check-types` | 通过（提交 `ac80f0e`） |
| 全仓 `pnpm test` | 通过（提交 `ac80f0e`） |

## 5. 工作流记录

1. 提交 `23ee4ad`：完成 M3-01/02/03 的初始骨架。
2. 提交 `ac80f0e`：补全 agent 测试并统一 tsx 依赖。
3. 提交 `775cc55`：接入 DeepSeek/通义千问并重构 env 模块。
