# Workflow V2 设计方案

日期：2026-06-08

> **状态：`frozen`（2026-06-09）** — 本设计不再进入实施，保留仅作过程思考存档。详见 [`workflow-v2-review-comments.md`](workflow-v2-review-comments.md) 第 7 节"架构方向转向：从 v2 自研转向 OpenHands 评估"。

## 1. 背景

当前 `workflow-gates` (v1) 存在四个结构问题：

1. Codex 硬编码在三层（role-policy.json、taskState.ts 默认值、rolePolicy.ts hook 校验），且 Codex 已下线
2. 消息总线与编排引擎平行运行、互不调用——消息总线沦为结构化审计日志
3. actorRuntime 只有一条执行路径（claude CLI），manual actor 直接抛异常
4. gpt5.5、codex 标为 manual actor，从未被系统自动调用过

详细分析见 `docs/devlog/2026-06-08-workflow-system-audit.md`。

## 2. 设计原则

- **角色与 Actor 彻底解耦**：角色名只出现在 `role-policy.json`，代码中永远不硬编码 actor 名字
- **消息总线是骨干**：状态变更自动发消息，执行前自动注入未读消息
- **适配器可插拔**：接口抽象，当前支持 Claude Code CLI，未来可加 DeepSeek API
- **入口保持不变**：shell → `node --experimental-strip-types` → TypeScript 源码

## 3. Actor 阵容（精简后）

去掉 Codex 和 gpt5.5（两个都是 manual actor，从未被自动调用过）。保留 3 个实际可用的 actor：

| Actor | 适配器 | 权限 | 用途 |
|---|---|---|---|
| `claude-code` | claude-code | 读写 | implementer |
| `claude-code-readonly` | claude-code | 只读，新会话 | tester、test-strategist、reviewer |
| `human` | manual | — | approver、architect |

独立审查不靠不同模型，靠**不同会话 + 不同提示词 + 不同权限**实现。

## 4. 角色→Actor 映射

6 个角色映射到 3 个 actor：

| 角色 | Actor | 说明 |
|---|---|---|
| architect | human | 人定义任务范围和验收标准 |
| implementer | claude-code | 完整读写权限，实现业务代码 |
| test-strategist | claude-code-readonly | 新会话，只读。分析测试影响，判断 add/update/none |
| tester | claude-code-readonly | 另一个新会话，只读。执行测试计划，记录证据 |
| reviewer | claude-code-readonly | 新会话，只读。审查代码和测试证据 |
| approver | human | 范围决策和发布授权 |

test-strategist 和 tester 虽然用同一个 actor 类型，但是**两个独立会话**（每次执行都是 freshSession），提示词完全不同：
- test-strategist 的 prompt：分析哪些测试需要变
- tester 的 prompt：执行测试、记录证据、不修改文件

## 5. 目录结构

```
packages/workflow-v2/
  package.json
  tsconfig.json
  src/
    types.ts              -- 所有类型定义
    config.ts             -- 加载并校验 role-policy + actor-registry
    stateMachine.ts       -- 任务状态机
    messageBus.ts         -- 文件消息总线
    orchestration.ts      -- 编排引擎：构建提示词 + 状态变更时自动发消息
    actorRuntime.ts       -- 适配器调度入口
    adapters/
      base.ts             -- ActorAdapter 接口
      claude-code.ts      -- spawn claude CLI
      manual.ts           -- 打印提示词给人类
    gates/
      preToolGuard.ts     -- PreToolUse hook 校验
      stopCheck.ts        -- Stop hook 校验
    cli/
      task.ts             -- pnpm task:* 命令
      message.ts          -- pnpm msg:* 命令
```

## 6. 核心模块设计

### 6.1 types.ts

```typescript
// 任务状态
type TaskStatus = "planned" | "implementing" | "testing" | "ready_for_review" | "completed";

// 测试影响
type TestImpactAction = "add" | "update" | "none";

// 角色名（抽象，不绑定具体 actor）
type RoleName = "architect" | "implementer" | "test-strategist" | "tester" | "reviewer" | "approver";

// Actor 适配器类型
type AdapterType = "claude-code" | "manual";

// Actor 定义
interface ActorProfile {
  adapter: AdapterType;
  executable?: string;          // claude-code 适配器用
  mode: string;                 // implementation | testing | review | approval
  allowedTools: string[];
  disallowedTools: string[];
  permissionMode?: string;
  settingSources: string[];
  freshSession: boolean;
  timeoutMs: number;
}

// ActorRegistry: actor 名 → ActorProfile
interface ActorRegistry {
  version: string;
  actors: Record<string, ActorProfile>;
}

// 角色定义
interface RoleDefinition {
  actor: string;                // 指向 ActorRegistry 中的 key
  responsibilities: string[];
}

// RolePolicy: 角色名 → 角色定义 + 任务策略
interface RolePolicy {
  version: string;
  roles: Record<RoleName, RoleDefinition>;
  taskPolicies: Record<string, TaskPolicy>;
}

// 任务
interface ActiveTask {
  id: string;
  title: string;
  taskType: string;
  status: TaskStatus;
  owner: RoleName;
  executor: RoleName;
  tester: RoleName;
  testStrategist: RoleName;
  reviewer: RoleName;
  humanApprover: RoleName;
  currentAssignee: RoleName;
  scope: string[];
  acceptanceCriteria: string[];
  testImpact: TestImpact;
  testPlan: string[];
  verificationCommands: string[];
  testEvidence: string[];
  handoffHistory: HandoffRecord[];
}

// 执行请求（适配器无关）
interface ExecutionRequest {
  taskId: string;
  role: RoleName;
  actor: string;
  adapter: AdapterType;
  prompt: string;               // 含注入的未读消息
  cwd: string;
  allowedTools: string[];
  disallowedTools: string[];
  permissionMode?: string;
  settingSources: string[];
  freshSession: boolean;
  timeoutMs: number;
}

// 执行结果
interface ExecutionResult {
  taskId: string;
  role: RoleName;
  actor: string;
  success: boolean;
  output: string;
  sessionId?: string;
  durationMs?: number;
  completedAt: string;
}

// 消息
type AgentMessageType =
  | "task_assignment"
  | "execution_result"
  | "test_change_request"
  | "review_request"
  | "decision"
  | "clarification";

interface AgentMessage {
  id: string;
  taskId: string;
  from: string;
  to: string;
  type: AgentMessageType;
  subject: string;
  content: string;
  status: "pending" | "read" | "resolved";
  createdAt: string;
  updatedAt: string;
  replyTo?: string;
}
```

### 6.2 config.ts

**职责**：加载 `role-policy.json` 和 `actor-registry.json`，校验完整性，提供查询方法。这是**唯一**读取这两个 JSON 文件的模块。

```typescript
function loadConfig(): Config
function getActor(role: RoleName): { name: string; profile: ActorProfile }
function getRole(role: RoleName): RoleDefinition
function getTaskPolicy(taskType: string): TaskPolicy
function validateConfig(): void
```

### 6.3 stateMachine.ts

从 v1 的 `taskState.ts` 迁移，清理所有 Codex 引用：

```typescript
const transitions: Record<TaskStatus, TaskStatus[]> = {
  planned: ["implementing"],
  implementing: ["testing"],
  testing: ["implementing", "ready_for_review"],
  ready_for_review: ["implementing", "testing", "completed"],
  completed: [],
};

function createTask(policy, id, title, taskType): ActiveTask
function transitionTask(task, nextStatus): ActiveTask
function handoffTask(task, nextRole): ActiveTask
function setTestImpact(task, action, rationale, proposedBy): ActiveTask
function approveTestImpact(task): ActiveTask
function assertReadyForReview(task): void
```

关键改动：
- `createTask` 的默认 rationale 从 `"Pending Codex test impact analysis"` 改为 `"Pending test-strategist impact analysis"`
- 不再出现 "Codex" 字样

### 6.4 messageBus.ts

从 v1 迁移，增加 `injectContext` 方法：

```typescript
class MessageBus {
  // 原有方法（不变）
  send(input: SendMessageInput): AgentMessage
  listInbox(recipient: string, unreadOnly?: boolean): AgentMessage[]
  listOutbox(sender: string): AgentMessage[]
  get(recipient: string, id: string): AgentMessage
  markRead(recipient: string, id: string): AgentMessage
  reply(...): AgentMessage
  resolve(recipient: string, id: string): AgentMessage

  // 新增：获取某 actor 在某任务中的未读消息，格式化为可注入 prompt 的文本
  injectContext(actor: string, taskId: string): string
}
```

`injectContext` 返回格式：
```
Unread messages for task M2-06:
[decision] from test-strategist: Approved test impact. Proceed with implementation.
[clarification] from reviewer: Please clarify the error handling in order creation.
```

### 6.5 orchestration.ts

**核心变化**：编排引擎在状态变更时**自动通过消息总线发送消息**。

```typescript
function startTask(task, policy, bus): ActiveTask
  // handoff 到 implementer，自动发 task_assignment

function submitForReview(task, policy, bus): ActiveTask
  // handoff 到 reviewer，自动发 review_request

function finishTask(task, policy): ActiveTask

function buildExecutionBrief(task, policy): ExecutionBrief
  // 构建角色提示词（沿用 v1 设计）

function notifyTestChangeRequest(task, bus): void
  // implementer 修改 testImpact 时，自动发 test_change_request 给 test-strategist
```

角色提示词沿用 v1 的设计（`orchestration.ts` 第 215-256 行），它们已经写得好——每个角色有明确的边界约束。

### 6.6 adapters/base.ts

```typescript
interface ActorAdapter {
  readonly name: string;
  execute(request: ExecutionRequest): Promise<ExecutionResult>;
}
```

### 6.7 adapters/claude-code.ts

从 v1 的 `actorRuntime.ts` 提取 `spawn("claude", ...)` 逻辑：

```typescript
class ClaudeCodeAdapter implements ActorAdapter {
  readonly name = "claude-code";

  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    // 1. 可选 bootstrap（跑 /init）
    // 2. spawn("claude", buildArgs(request))
    // 3. 解析 JSON envelope
    // 4. 返回 ExecutionResult
  }
}
```

### 6.8 adapters/manual.ts

v1 的 manual adapter 直接抛异常。v2 改为**打印提示词并正常返回**，让工作流继续：

```typescript
class ManualAdapter implements ActorAdapter {
  readonly name = "manual";

  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    console.log("=".repeat(60));
    console.log(`Manual execution required — role: ${request.role}`);
    console.log("=".repeat(60));
    console.log(request.prompt);
    console.log("=".repeat(60));
    console.log("After completing, run: pnpm task:handoff -- <next-role>");

    return {
      taskId: request.taskId,
      role: request.role,
      actor: request.actor,
      success: true,
      output: "Manual execution — awaiting human action",
      completedAt: new Date().toISOString(),
    };
  }
}
```

### 6.9 actorRuntime.ts

```typescript
const adapters: Record<AdapterType, ActorAdapter> = {
  "claude-code": new ClaudeCodeAdapter(),
  "manual": new ManualAdapter(),
};

async function execute(request: ExecutionRequest): Promise<ExecutionResult> {
  const adapter = adapters[request.adapter];
  if (!adapter) throw new Error(`Unknown adapter: ${request.adapter}`);
  return adapter.execute(request);
}

function createExecutionRequest(
  brief: ExecutionBrief,
  registry: ActorRegistry,
  cwd?: string
): ExecutionRequest
```

未来加 DeepSeek API 只需：实现 `OpenAICompatAdapter`，在 `adapters` 注册表中加一行。

### 6.10 gates/preToolGuard.ts

从 v1 迁移，核心变化：**校验逻辑不再引用具体 actor 名**。

```typescript
// v1:
block("test impact requires Codex consensus before review");

// v2:
const strategist = config.getRole("test-strategist");
block(
  `test impact must be approved by test-strategist `
  + `(actor: ${strategist.actor}) before review`
);
```

`reviewedBy` 仍必须等于 `task.testStrategist`，但这是**角色名**校验，不关心角色背后是哪个 actor。

### 6.11 gates/stopCheck.ts

从 v1 迁移，逻辑不变。

## 7. 消息总线集成流程

v1：编排和消息是两套平行系统。v2：消息是编排的自动副作用。

```
任务状态变更
  │
  ▼
orchestration.startTask(task, policy, bus)
  ├── 1. handoffTask() → 更新 active-task.json
  ├── 2. bus.send(task_assignment)        ← 自动
  └── 3. 返回 ExecutionBrief

actorRuntime.execute(request, bus)
  ├── 1. bus.injectContext(actor, taskId)  ← 自动注入未读消息到 prompt
  ├── 2. adapter.execute(prompt + context)
  └── 3. bus.send(execution_result)        ← 自动
```

## 8. 入口与 hook 集成

### 8.1 package.json scripts

```json
{
  "name": "@opsagent/workflow-v2",
  "private": true,
  "type": "module",
  "scripts": {
    "task": "node --experimental-strip-types src/cli/task.ts",
    "message": "node --experimental-strip-types src/cli/message.ts",
    "pre-tool": "node --experimental-strip-types src/gates/preToolGuard.ts",
    "stop": "node --experimental-strip-types src/gates/stopCheck.ts"
  }
}
```

### 8.2 Hook shell 脚本

```bash
# .claude/hooks/pre-tool-guard-v2.sh
#!/usr/bin/env bash
set -euo pipefail
payload="$(cat || true)"
project_dir="${CLAUDE_PROJECT_DIR:-$(pwd)}"
printf "%s" "$payload" | node --experimental-strip-types \
  "$project_dir/packages/workflow-v2/src/gates/preToolGuard.ts"
```

`.claude/settings.json` 中 hook 命令改为指向 v2 脚本。

## 9. 配置文件

### role-policy.json

```json
{
  "version": "0.2.0",
  "roles": {
    "architect":        { "actor": "human",                "responsibilities": ["architecture", "task-breakdown", "acceptance-criteria"] },
    "implementer":      { "actor": "claude-code",          "responsibilities": ["implementation", "local-fix"] },
    "test-strategist":  { "actor": "claude-code-readonly", "responsibilities": ["test-impact-analysis", "test-case-design", "test-change-review"] },
    "tester":           { "actor": "claude-code-readonly", "responsibilities": ["test-plan", "automated-tests", "regression-check", "test-evidence"] },
    "reviewer":         { "actor": "claude-code-readonly", "responsibilities": ["code-review", "test-evidence-review"] },
    "approver":         { "actor": "human",                "responsibilities": ["scope-decision", "conflict-resolution", "release-approval"] }
  },
  "taskPolicies": {
    "implementation": {
      "owner": "architect",
      "executor": "implementer",
      "tester": "tester",
      "testStrategist": "test-strategist",
      "reviewer": "reviewer",
      "humanApprovalRequired": false
    }
  }
}
```

### actor-registry.json

```json
{
  "version": "0.2.0",
  "actors": {
    "claude-code": {
      "adapter": "claude-code",
      "executable": "claude",
      "mode": "implementation",
      "allowedTools": ["Read", "Glob", "Grep", "Edit", "Write", "Bash"],
      "disallowedTools": [],
      "permissionMode": "bypassPermissions",
      "settingSources": ["user", "project"],
      "freshSession": true,
      "timeoutMs": 900000
    },
    "claude-code-readonly": {
      "adapter": "claude-code",
      "executable": "claude",
      "mode": "testing",
      "allowedTools": ["Read", "Glob", "Grep", "Bash"],
      "disallowedTools": ["Edit", "Write", "MultiEdit"],
      "permissionMode": "dontAsk",
      "settingSources": ["user", "project"],
      "freshSession": true,
      "timeoutMs": 600000
    },
    "human": {
      "adapter": "manual",
      "mode": "approval"
    }
  }
}
```

## 10. 与 v1 的对比

| 维度 | v1 (workflow-gates) | v2 (workflow-v2) |
|---|---|---|
| Actor 数量 | 5（其中 3 个 manual 从未运行） | 3（2 个自动 + 1 个 manual） |
| actor 名字出现在几个源文件 | 3（config + 默认值 + hook） | 0（只在 JSON 配置中） |
| 消息总线角色 | 独立审计日志 | 编排引擎的通信骨干 |
| 编排→消息 | 不互通 | 自动发送 + 自动注入 |
| manual actor 行为 | 抛异常 | 打印提示词，正常返回 |
| test-strategist 替换 actor | 改 3 个文件 | 改 1 行 JSON |
| 适配器种类 | 1（claude CLI） | 2（claude CLI + manual），接口支持扩展 |
| 独立审查机制 | 依赖 Codex（不可用） | 独立会话 + 角色提示词隔离 |
| shell 入口 | bash → node → ts | 不变 |
| 配置文件兼容 | — | 格式向前兼容，字段精简 |

## 11. 迁移路径

1. 创建 `packages/workflow-v2/` 目录和 `package.json`
2. 实现 `types.ts` → `config.ts` → `stateMachine.ts` → `messageBus.ts`
3. 实现 `adapters/base.ts` → `adapters/claude-code.ts` → `adapters/manual.ts` → `actorRuntime.ts`
4. 实现 `orchestration.ts`（含消息自动发送）
5. 实现 `gates/preToolGuard.ts` 和 `gates/stopCheck.ts`
6. 实现 `cli/task.ts` 和 `cli/message.ts`
7. 更新 `.claude/settings.json` hook 路径指向 v2
8. 更新根 `package.json` scripts 指向 v2
9. 更新 `.agent/role-policy.json` 和 `.agent/actor-registry.json` 为新格式
10. v1 `workflow-gates` 保留不动，待验证后删除

## 12. 待决问题与评审意见

本节列出 v2 落地前必须澄清的开放问题，详细论证见 [`workflow-v2-review-comments.md`](workflow-v2-review-comments.md)。

| # | 问题 | 建议动作 |
|---|---|---|
| 1 | devlog 的"立即第一步"（`claude-code-new-context` 替换 Codex）被 v2 架空（v2 用 `claude-code-readonly`），两条路径并存会造成执行歧义 | 明确决策：直接进 v2，或先落地 devlog 第一步作为过渡 |
| 2 | `orchestration.ts` 加 `bus.send()` 后，编排引擎与消息总线形成双向依赖 | 明确 bus 的依赖方向，避免状态机变更与消息发送深度耦合 |
| 3 | 6.3 节状态机只列了 5 个状态，需对照 v1 `taskState.ts` 的 transitions 做一次 diff，确认未遗漏 `blocked` / `waiting_approval` 等状态 | 补一份 v1 → v2 状态映射表 |
| 4 | `claude-code-readonly` 的 `allowedTools` 未包含 `mcp__codegraph__*`；CodeGraph MCP 已接入 | actor-registry.json 的只读 actor 应显式放行 CodeGraph MCP 工具 |
| 5 | 11 节迁移步骤缺验收标准和回退方案 | 加一条"M2 收尾期冻结 v2 切换"或"M3 第一个任务用 v2 跑完整闭环" |

## 13. 落地时机建议

- **当前分支 `M2-06-edit-by-ClaudeCode` 期间**：只讨论、只沉淀文档，不动 v1 源码、不动工作流脚本、不动 role-policy。
- **M2 里程碑验收通过后**：在 M3 启动会上正式决策"直接进 v2 vs 先落 devlog 第一步"，并将决策写入 M3 issue 文件。
- **M3 第一个任务**：若选择直接进 v2，作为 M3-01 的配套前置工作；若选择先落第一步，则作为 M3 前的 5 分钟独立提交。
