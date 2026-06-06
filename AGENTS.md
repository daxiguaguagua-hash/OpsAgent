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

