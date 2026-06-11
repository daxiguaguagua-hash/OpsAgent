# M3-13 接入 GBrain MCP

日期：2026-06-11
状态：`done`
前置任务：M3-12
负责人：ai-agent-team

## 1. 目标

把 GBrain 封装为 MCP Server，使 Codex 与 Claude Code 可以通过同一套受控工具查询项目知识库，避免各 Agent 各自爬文档。

## 2. MCP 边界

| 角色 | 职责 |
|---|---|
| GBrain MCP Server | 提供 `search_knowledge(query, sourceId?)` 工具 |
| Codex / Claude Code | 通过 MCP 协议调用，不直接访问 pgvector |
| OpsAgent PostgreSQL | 仍然是任务状态的权威来源，GBrain 不替代 |

## 3. 交付物

| 文件 | 说明 |
|---|---|
| `apps/agent/gbrain/mcp-server.ts` | MCP Server 入口 |
| `apps/agent/gbrain/mcp-tools.ts` | 工具定义（zod schema） |
| `apps/agent/gbrain/mcp-server.test.ts` | 工具调用测试 |
| `.qoder/mcp.json` 或等价配置 | 注册到本地 Agent 运行时 |

## 4. 验收标准

| 验收项 | 标准 |
|---|---|
| 工具可列 | MCP `tools/list` 返回 `search_knowledge` |
| 查询可执行 | 传入 query 返回 top-K 结果与 sourceId |
| 受控访问 | Codex / Claude Code 只能通过 MCP，不能直连 pgvector |
| 单元测试 | 覆盖空结果、sourceId 过滤、非法输入 |

## 5. 不做的事（边界）

- 不做 MCP 鉴权（当前为本地运行）。
- 不做写入工具（写入走 M3-15 知识沉淀流程）。
