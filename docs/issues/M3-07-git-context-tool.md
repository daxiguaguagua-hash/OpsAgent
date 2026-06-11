# M3-07 Git Context Tool

日期：2026-06-10
状态：`done`
前置任务：M3-01
负责人：ai-agent-team

## 1. 目标

为 Agent 提供读取源码上下文与最近 commit 的 Tool，使 Incident Report 可以关联到"最近被谁改过、改了什么"，辅助根因定位。

## 2. 预期输入

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `path` | string | 是 | 仓库内相对路径，需做边界检查 |
| `includeRecentCommits` | boolean | 否 | 是否返回该文件最近 N 条 commit，默认 `true` |
| `commitLimit` | number | 否 | 默认 5，最大 20 |

## 3. 预期输出

```json
{
  "path": "apps/backend/src/business/orders.ts",
  "content": "...",
  "truncated": false,
  "originalSizeBytes": 2048,
  "recentCommits": [
    { "hash": "abc1234", "author": "...", "date": "...", "message": "..." }
  ],
  "warnings": []
}
```

## 4. 安全边界

- 路径必须落在仓库内，禁止 `..` 逃逸到 `/etc` 等敏感目录。
- 单文件读取上限 256 KB，超过返回截断标记。
- 不执行任何 `git` 写操作（`commit` / `push` / `reset` 等）。

## 5. 交付物

| 文件 | 说明 |
|---|---|
| `apps/agent/src/tools/git-context-tool.ts` | 读文件 + `git log` 调用封装，`createGitContextTool(deps)` 工厂 |
| `apps/agent/src/tools/constants.ts` | `GIT_CONTEXT_TOOL` 领域常量（ID、描述、阈值、错误码） |
| `apps/agent/src/tools/git-context-tool.test.ts` | 覆盖路径逃逸、文件缺失、commit 解析、git 降级、zod 校验（8 用例） |
| `apps/agent/src/tools/index.ts` | 新增 `createGitContextTool` 桶导出 |
| `apps/agent/src/agents/index.ts` | `AgentConfig.tools?` 透传给 `new Agent({ tools })` |

## 6. 验收标准

| 验收项 | 标准 |
|---|---|
| 合法路径 | 返回文件内容与最近 commit |
| 路径逃逸 | 返回权限错误 |
| 文件不存在 | 返回结构化错误 |
| 大文件 | 截断并标记 |

## 测试证据

- `pnpm --filter @opsagent/agent exec tsx --test src/tools/git-context-tool.test.ts`：`pass 8 / fail 0`
- `turbo check-types --filter=@opsagent/agent`：0 errors
- `turbo check-types test`：12/12 tasks 成功（全量回归）

## 7. 不做的事（边界）

- 不做跨文件搜索（用 CodeGraph 或 Grep）。
- 不做 diff 渲染（Agent 自己解析 commit 消息）。
