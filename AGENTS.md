# OpsAgent Agent Instructions

本文件约束 OpenCode 及其他读取 `AGENTS.md` 的 Agent。执行任务前还必须阅读：

- `CLAUDE.md` — 完整架构、命令清单、里程碑路线图（必读）
- `docs/decisions/README.md` — ADR 索引、模板、双向链接纪律（**每次会话开始必读**）
- `docs/task-breakdown.md` — 里程碑任务卡片
- `docs/workflows/agent-execution-workflow.md` — 任务工作流

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

新增或修改任务时，必须检查本次改动是否引入字符串硬编码；发现需要新增领域值时，必须先复用或扩展统一定义。

## 代码探索

阅读、理解、追溯代码时，优先使用 CodeGraph MCP 工具。

- **"X 是什么 / 这段代码在干什么"**：`codegraph_context`
- **"X 如何到达 Y / 触发链路"**：`codegraph_trace`
- **"X 被谁调用 / 改动会影响谁"**：`codegraph_callers` / `codegraph_callees` / `codegraph_impact`
- **"看一批相关符号的源码"**：`codegraph_explore`（避免多次 `codegraph_node`）
- **"项目文件结构"**：`codegraph_files`

回退到 Grep / Read 的情况：

- 非 TypeScript 源码（配置、文档、样式、YAML、lock 文件）
- 需要确认精确行号、注释原文、字符串字面量
- 文件刚被编辑，CodeGraph 提示 `⚠️ Pending sync`

## 外部文档查询（Context7）

涉及第三方库、框架 API 时，使用 Context7 MCP 查询最新文档。

流程：先 `resolve-library-id("库名")`，再 `query_docs("/org/project", "具体问题")`。同一问题最多调用 3 次。

不适用场景：本项目内部代码理解、业务逻辑重构调试、通用编程概念。

## 知识管理（ADR 模式）

项目采用 ADR（Architecture Decision Records）管理架构决策与跨里程碑教训，详见 `docs/decisions/README.md`。

**触发 ADR 的场景**（必须新建 ADR）：

- 选择或弃用某个技术栈 / 工具 / 协议
- 确定某个跨模块的设计模式（如 env 层、错误处理、状态机）
- 推翻之前的决策（用 `superseded by ADR-XXXX` 标记旧 ADR）
- 沉淀跨里程碑的通用教训（也可放 `docs/lessons/`，由 ADR 引用）

**不触发 ADR 的场景**：

- 单个任务卡的实施细节（写任务卡）
- 单个包的实现细节（写 `docs/packages/<pkg>.md`）
- 里程碑内部交接（写 `docs/milestones/M{N}/handoff.md`）

**双向链接纪律**（违反即为反模式）：

- 每篇文档顶部 `**关联**` 字段：声明"我依赖谁"
- 每篇文档底部 `## 反向引用` 节：记录"谁依赖我"
- **新建文档引用其他文档时，必须同步在被引用文档的 `## 反向引用` 区追加一条**

**反模式**：

- ❌ 在 `docs/devlog/` 写决策（devlog 是流水账，决策必须进 ADR）
- ❌ 用自动化工具生成反向引用（手动维护是思考过程）
- ❌ 跳过 `docs/decisions/README.md` §2 表格更新（这是全项目 ADR 唯一索引）

## 仓库约定速查

- **ESM only**：所有包 `"type": "module"`，import 必须带扩展名（`.ts` / `.js`）。测试导入用 `.js` 扩展名。
- **包命名**：应用用裸名（`frontend` / `backend`），库用 `@opsagent/*` 作用域；内部依赖写 `workspace:*`。
- **公共依赖版本**：写 `"catalog:"` 引用 `pnpm-workspace.yaml` 的 catalog，不要在 package.json 里写具体版本号。
- **后端构建**：`tsdown`（不是 tsc），配置在 `apps/backend/tsdown.config.ts`。
- **前端开发端口**：`3001`（`vite.config.ts` 覆盖默认 5173）。
- **常量按领域拆**：`business/constants.ts`、`http/constants.ts`、`cache/constants.ts` 各自独立。
- **后端分层**：`business/`（纯逻辑，可注入）→ `http/`（Hono 路由 + 错误）→ `cache/`（Redis 单例，懒加载）。
- **CLI 无需编译**：`pnpm task:*` / `pnpm msg:*` 走 `node --experimental-strip-types` 直接执行 TS 源码。
- **TypeScript 6**：`target: ESNext`，`verbatimModuleSyntax: true`，`noUnusedLocals: true`，`noUnusedParameters: true`。
- **测试运行器**：Node.js 原生 `node:test` + `tsx`，不用 Jest/Vitest。测试导入路径用 `.js` 扩展名，不要用 `node --experimental-strip-types --test`。

## 任务状态机

顺序：`planned → implementing → testing → ready_for_review → completed`。

修改状态前先对照 `packages/workflow-gates/src/taskState.ts`，`transitionTask` 定义合法转换路径。

`ready_for_review` 有前置门禁：testImpact 必须 approved、testEvidence 非空、scope/acceptanceCriteria/testPlan/verificationCommands 不含 TODO 占位符。

## 任务卡片管理纪律

`docs/issues/*.md` 是任务卡的唯一落盘位置。每张卡顶部必须包含元数据块：

```yaml
日期：<YYYY-MM-DD>
状态：<status>
前置任务：<依赖，可选>
负责人：<team>
```

### 卡片状态取值

| 状态 | 适用 |
|---|---|
| `planned` | 已建卡，未开始 |
| `implementing` | 实施中 |
| `testing` | 测试中 |
| `ready_for_review` | 等待复核 |
| `done` | 复核通过，已归档（普通任务卡终态） |
| `accepted` | 里程碑验收通过（仅用于 `*-milestone-acceptance.md`） |

完工时把状态改为 `done`（提交 \`<commit-sha>\`），例如：`状态：\`done\`（提交 \`abc1234\`）`。

### 三点同步纪律

1. **单卡更新**：完工的同一提交内，把卡片顶部 `状态` 改为 `done` 并附提交号，同时补齐"测试证据"与"工作流记录"段落。
2. **索引同步**：同一提交内更新 `docs/issues/README.md` 对应里程碑表的状态列。
3. **`task-breakdown.md` 同步**：里程碑内全部任务 `done` 后，回去更新该文件的状态列与关联提交号，并新建 `M<n>-milestone-acceptance.md` 作为下一里程碑的合法起点。

新建卡片时同样需要：

- 在 `docs/issues/README.md` 对应里程碑表里登记。
- 在 `docs/task-breakdown.md` 对应里程碑表里登记。
- 遵守本文件"禁止领域字符串硬编码"约束。

### 与 workflow-gates 状态机的区分

| 概念 | 落点 | 取值 |
|---|---|---|
| workflow-gates 状态机 | `.agent/active-task.json` / `ActiveTask.status` | `planned` / `implementing` / `testing` / `ready_for_review` / `completed` |
| Markdown 卡片状态 | `docs/issues/*.md` 顶部 `状态` 字段 | `planned` / `implementing` / `testing` / `ready_for_review` / `done` / `accepted` |

状态机只管"当前运行中的任务"，不持久化历史；历史归档由 Markdown 卡片维护。卡片状态用 `done` 而非 `completed`，是为了在文本层面与状态机术语保持可区分。

## 测试要点

- 测试文件与被测代码同级目录，命名 `<源文件>.test.ts`。
- 使用 `node:assert/strict`，每个断言必须带中文消息。
- 测试文件顶部必须有中文注释说明覆盖范围。
- 复杂数据抽取为 `FIXTURE_` 前缀常量。
- 选择性 TDD：业务规则/状态机优先 TDD；探索性 UI 先实现再补测试。
- 测试修改需 test-strategist（Codex）批准，测试失败不等于测试应该被修改。

## 常用验证命令

```bash
pnpm check-types       # 全量类型检查
pnpm test              # 全量测试（turbo test）
pnpm --filter backend test         # 单包测试
pnpm --filter @opsagent/db test
pnpm --filter frontend test
pnpm --filter @opsagent/env test
pnpm --filter @opsagent/workflow-gates test
pnpm --filter @opsagent/db db:verify    # 验证 DB 可读写
pnpm --filter backend cache:verify      # 验证 Redis 连通性
pnpm compose:config                     # 校验 docker-compose.yml 语法
```


