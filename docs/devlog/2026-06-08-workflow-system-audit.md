# 开发日记：工作流系统审计与 Codex 依赖解耦

日期：2026-06-08

> 后续：基于本审计产出了 [`workflow-v2-design.md`](../workflows/workflow-v2-design.md) 与 [`workflow-v2-review-comments.md`](../workflows/workflow-v2-review-comments.md)（评审意见，2026-06-09）。

## 背景

Codex 因额度限制暂时不可用。Codex 在当前系统中承担 `test-strategist` 角色（测试影响分析、用例设计、测试修改审批）。这不是"少了一个 CLI 工具"的问题——`role-policy.json`、`taskState.ts` 默认值、`rolePolicy.ts` hook 校验三层都与 Codex 耦合。本次审计逐层排查依赖链，并给出解耦方案。

相关既有文档：

- `docs/devlog/2026-06-06-tdd-and-test-governance.md` — 为什么选择 Codex 做 test-strategist，测试治理决策流程
- `docs/workflows/agent-role-policy.md` — 六角色定义、任务流、testImpact 合同字段
- `docs/issues/M0-16-agent-message-bus.md` — 消息总线设计，Codex 的时序参与
- `docs/issues/M0-15-actor-runtime.md` — Codex 已明确列为 Manual 执行者

## 发现 1：Codex 三层硬耦合

替换 Codex 不能只改一个配置文件，依赖分散在三层：

| 层 | 位置 | 耦合方式 |
|---|---|---|
| 角色-actor 映射 | `role-policy.json:18` | `"actor": "codex"` 写死 |
| 默认值 | `taskState.ts:56` | `rationale` 默认文本写死 "Pending Codex test impact analysis" |
| Hook 门禁 | `rolePolicy.ts:117-122` | `reviewedBy` 必须等于 `task.testStrategist`，consensus 必须 `approved`，错误消息写死 "Codex consensus" |

第三层（hook 门禁）是最关键的——它不关心 actor 是谁，只校验 `reviewedBy === task.testStrategist` 和 `consensus === "approved"`。所以**把 test-strategist 的 actor 从 `codex` 换成其他值，hook 不会报错**。第一层和第二层是字符串替换，第三层逻辑正确但错误消息有误导性。

## 发现 2：消息总线与编排引擎不互通

这是比 Codex 依赖更深的结构问题。

`messageBus.ts` 实现了一套完整的异步消息系统（收件箱/发件箱/已读/回复/归档，6 种消息类型），但 `orchestration.ts` 完全不碰消息总线。编排引擎的输出是**给人看的 CLI 命令**（`pnpm task:handoff -- tester`），而不是通过消息总线自动发送 `task_assignment`。

反过来，消息总线也没有消费者——没有任何代码在流程中自动调用 `listInbox()` 读取新消息。`pnpm msg:inbox` 是手动命令。M0-16 的时序图描述的消息流转（"下一次 task:execute 注入未读消息"）在代码中并未实现。

两套系统平行存在，谁都不依赖谁。消息总线目前的作用等同于**结构化的审计日志**，而不是 Agent 间通信通道。

## 发现 3：actorRuntime 单后端

`ActorAdapter` 类型定义为 `"claude-code" | "manual"`，但 `manual` 直接抛异常。实际执行路径只有一条：

```
buildClaudeCodeArgs() → spawn("claude", ...)
```

无论 role-policy 里配置什么 actor，运行时都调 `claude` CLI。Codex 和 gpt5.5 标为 "Manual" 并不是因为它们有独立适配器，而是因为它们根本没有适配器——靠人在终端手动操作。

M0-15 已经诚实地记录了这一点："gpt5.5、codex 和 human 仍是 Manual（人工触发）执行者"。所以 Codex 的"参与"从来不是系统自动调用的，是人手动跑 `codex` 命令后再手动跑 `pnpm task:test-approve`。

这意味着：**Codex 下线对系统自动化能力的影响是零**——它从来就没被自动化过。真正受影响的是人工工作流中少了一个独立视角。

## 发现 4：独立审查的价值不在工具而在角色

`orchestration.ts` 为每个角色设计了不同的提示词：

- implementer: "Implement only the approved scope. Do not weaken or change tests."
- tester: "Validate behavior from the acceptance criteria rather than trusting implementation notes. Do not modify project files."
- test-strategist: 分析测试影响，判断 add/update/none

这三个提示词的设计确保了**认知多样性**——实现者关注"怎么做"，测试者关注"是否符合验收标准"，策略者关注"哪些测试需要变"。即使三者跑在同一个模型上，不同的提示词和不同的会话上下文（tester 要求 freshSession + 禁用 Edit/Write）已经提供了实质性的独立视角。

所以把 test-strategist 的 actor 换成 `claude-code-new-context`（已存在于 actor-registry，freshSession + 受限权限），不是退化为"自己审自己"，而是在同一模型上通过**角色提示词隔离**和**会话上下文隔离**维持独立审查的有效性。

## 修改方案

### 第一步（立即，5 分钟，零风险）

修改三个文件，把 Codex 替换为 `claude-code-new-context`：

**1. `.agent/role-policy.json`** — 改 actor

```diff
- "actor": "codex",
+ "actor": "claude-code-new-context",
```

**2. `packages/workflow-gates/src/taskState.ts:56`** — 改默认文本

```diff
- rationale: "Pending Codex test impact analysis",
+ rationale: "Pending test-strategist impact analysis",
```

**3. `packages/workflow-gates/src/rolePolicy.ts:122`** — 改错误消息

```diff
- block("OpsAgent role policy blocked: test impact requires Codex consensus before review");
+ block("OpsAgent role policy blocked: test impact requires test-strategist consensus before review");
```

同时更新以下文档中的 Codex 引用：
- `docs/workflows/agent-role-policy.md` 第 32 行和第 39 行
- `docs/devlog/2026-06-06-tdd-and-test-governance.md` 第 34-61 行
- `docs/issues/M0-16-agent-message-bus.md` 中的 Codex 引用

### 第二步（中期，需讨论优先级）

让消息总线和编排引擎真正互通：

- `orchestration.ts` 的 `buildExecutionBrief` 在生成指令时，自动通过消息总线发送 `task_assignment`
- `task:execute` 在实际调用模型前，读取当前 actor 的未读消息并注入 prompt
- 这是 M0-16 issue 里已经设计好但未实现的能力

### 第三步（远期，需讨论优先级）

actorRuntime 支持 DeepSeek API 作为独立 adapter：

- 新增 `deepseek-api` adapter，通过 OpenAI 兼容接口调用
- test-strategist 可以跑在不同模型上，获得真正的模型多样性
- 成本极低（DeepSeek API 定价远低于 OpenAI）

## 决策记录

- **Codex 下线对系统自动化能力的影响：零。** 它从来都是 Manual actor，没有被 actorRuntime 自动调用过。
- **独立审查的有效性不依赖特定工具。** 角色提示词隔离 + 会话上下文隔离已经提供了实质性独立视角。
- **消息总线目前是结构化审计日志，不是通信通道。** 是否升级为真正的 Agent 间通信取决于后续优先级。
