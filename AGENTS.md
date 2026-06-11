# OpsAgent Agent Instructions

本文件约束 Codex 及其他读取 `AGENTS.md` 的 Agent（智能体）。执行任务前还必须阅读：

- `docs/task-breakdown.md`
- 当前 `docs/issues/<task-id>-*.md`
- `docs/workflows/agent-execution-workflow.md`

## 禁止领域字符串硬编码

参与程序判断、状态转换、跨模块协议、配置读取或重复使用的字符串，必须从统一定义导入，不得在业务代码中直接书写字符串字面量。

适用范围：

- Task Status（任务状态）
- Role（角色）
- Actor ID（执行者标识）
- Message Type（消息类型）
- Error Code（错误代码）
- 配置键、文件路径和固定命令
- 跨文件重复的固定文案

```typescript
// 禁止
if (task.status === "planned") {}

// 推荐
if (task.status === TASK_STATUS.PLANNED) {}
```

统一定义按领域拆分到 `constants/` 或对应领域模块，使用 `as const` 对象并派生联合类型。不要创建一个包含所有字符串的巨型文件。

仅出现一次、不参与程序判断、不会跨模块复用的日志或说明文字可以就地书写。

新增或修改任务时，Codex 必须检查本次改动是否引入字符串硬编码；Claude Code 发现需要新增领域值时，必须先复用或扩展统一定义。

## 代码探索

阅读、理解、追溯代码时，优先使用 CodeGraph MCP 工具，不要一开始就用 Grep/Read 逐文件查找：

- **"X 是什么 / 这段代码在干什么"**：先调用 `codegraph_context`，一次拿到入口、相关符号与关键代码片段。
- **"X 如何到达 Y / 触发链路 / 渲染链路"**：先调用 `codegraph_trace`，一次返回完整调用路径（含回调、React 子树等动态派发跳转）。
- **"X 被谁调用 / 调用了谁 / 改动会影响谁"**：用 `codegraph_callers`、`codegraph_callees`、`codegraph_impact`。
- **"看一批相关符号的源码"**：用一次 `codegraph_explore`，避免多次 `codegraph_node`。
- **"项目文件结构 / 某目录下有什么"**：用 `codegraph_files`，比 Glob 快。

仅在以下情况回退到 Grep / Read：

- 目标不是 TypeScript 源码（配置、文档、样式、脚本、lock 文件等 CodeGraph 未索引的内容）
- 需要确认 CodeGraph 返回的某个具体细节（精确行号、注释原文、字符串字面量）
- 文件刚被编辑，CodeGraph 的 `⚠️ Pending sync` 提示表明索引尚未刷新

## 外部文档查询（Context7）

涉及第三方库、框架、SDK、CLI 工具的 API 语法、配置项、版本迁移、排障指南时，使用 Context7 MCP 获取最新文档，不要凭记忆或 Web 搜索猜测。

适用场景：

- 库/框架的 API 用法、配置参数、breaking change（如 React、Next.js、Hono、Vitest、Tailwind、Prisma、tsdown）
- 版本迁移指南（如从 v3 升到 v4 的 API 变化）
- 库特有的调试手法、CLI 用法、setup 步骤
- 即使你觉得已经知道答案，也应优先查询——训练数据可能过时

不适用场景：

- 本项目内部代码的理解和追溯（用 CodeGraph）
- 业务逻辑的重构、调试、代码审查
- 通用编程概念的解释

```typescript
// 1. 先解析库 ID
codegraph  →  resolve_library_id("Hono")  →  "/honojs/hono"

// 2. 再查询具体文档
query_docs("/honojs/hono", "how to add middleware with routing")
```

同一问题最多调用 3 次 Context7（resolve + query 各算一次）。如果 3 次内找不到所需信息，再回退到 WebSearch。

## 仓库约定速查（易踩坑项）

- **ESM only**：所有包 `"type": "module"`，import 必须带扩展名（`.ts` / `.js`）。
- **包命名**：应用用裸名（`frontend` / `backend`），库用 `@opsagent/*` 作用域；内部依赖写 `workspace:*`。
- **公共依赖版本**：写 `"catalog:"` 引用 `pnpm-workspace.yaml` 的 catalog，不要在 package.json 里写具体版本号。
- **后端构建**：`tsdown`（不是 tsc），配置在 `apps/backend/tsdown.config.ts`。
- **前端开发端口**：`3001`（`vite.config.ts` 覆盖了默认 5173；`CORS_ORIGIN` 对应此端口）。
- **常量按领域拆**：`business/constants.ts`、`http/constants.ts`、`cache/constants.ts` 各自独立，不要建巨型常量文件。
- **后端分层**：`business/`（纯逻辑，可注入）→ `http/`（Hono 路由 + 错误）→ `cache/`（Redis 单例，懒加载）。
- **任务工作流 CLI 无需编译**：`pnpm task:*` / `pnpm msg:*` 走 `node --experimental-strip-types` 直接执行 TS 源码。
- **任务状态机顺序**：`planned → implementing → testing → ready_for_review → completed`；修改状态前先对照 `packages/workflow-gates/src/taskState.ts`。

完整架构、命令清单、里程碑路线图见 `@CLAUDE.md`；测试治理细则见 `@docs/workflows/agent-role-policy.md`。


