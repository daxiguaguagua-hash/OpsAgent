# 开发日记 2026-06-11 — Git Context Tool 真流程测试策略

**日期**：2026-06-11
**主题**：M3-07 Git Context Tool 完工后，关于 Mastra 端到端/集成测试的讨论
**关联任务**：[M3-07](../issues/M3-07-git-context-tool.md)
**状态**：讨论记录，未动工；待 Vincent 拍板后再落地

---

## 1. 触发点

M3-07 提交了 `fd50103`，8 个单元测试全绿。但 Vincent 提了一个关键问题：

> 现在只是做了单元测试，那么有没有对 Mastra 做真正的流程测试？Mastra 中的大模型能不能通过 git-context-tool.ts 真正地读取到 git 历史中的某一段代码？

答案是：**现在没有**。M3-07 只覆盖了"工具逻辑层"，Mastra 调度层和 LLM 端到端层完全没测。

## 2. 三层验证模型

把"真流程"拆成三层，每层要验证的东西不一样：

| 层 | 验证什么 | 现状 |
|---|---|---|
| ① 工具逻辑 | 给定输入，工具函数返回正确结构 | ✅ 单元测试 8/8 |
| ② Mastra 集成 | Tool 注册到 Agent 后，`agent.generate()` 能解析 Tool schema、调用 `execute`、把结果注入 prompt | ❌ 未测 |
| ③ LLM 端到端 | 真实模型看到 incident 后会主动调用 git-context、拿到 commit 写进报告 | ❌ 未测 |

**当前盲区是第 ② 层**——它不依赖真实 LLM，可以用 Vercel AI SDK 的 `MockLanguageModelV1` 让"LLM"确定性地返回 `toolCalls: [{ toolName: "git-context", args: {...} }]`，然后断言 Mastra 真的执行了 Tool、返回的 `toolResults` 里有真实的 git commit。

第 ③ 层属于 M3-16 RAG Evaluation 的范畴（真实 LLM 调用，贵、慢、非确定性），不在本次讨论范围。

## 3. 真流程测试建议方案

核心思路：在一个**临时 git 仓库**里跑真实的 `git init` + `git commit`，用 Mastra 的 `agent.generate()` + mock LLM，验证 Tool 被真实调用、读到的是真实 git 输出。

### 3.1 Fixture 设计

- `mkdtemp` 创建临时目录
- `git init` 初始化
- 写入 1~2 个源码文件
- 做 2~3 次 `git commit`（带不同 author/date/message）
- 测试结束 `rm -rf`

隔离、确定、不污染主仓库。

### 3.2 Mock 边界

- **不用 mock deps**：用真实 `defaultRunGit`，验证 `spawn git` 整条链路。
- **用 mock LLM**：`MockLanguageModelV1` 配置 `doGenerate` 返回预设的 tool call，让 Mastra 走完 Tool 调度。

### 3.3 断言点

```ts
const result = await agent.generate("incident 关联的源码在哪？", {
  toolChoice: "required",
});
const toolResult = result.toolResults[0].result;
assert.equal(toolResult.path, "apps/backend/src/app.ts", "路径回显");
assert.ok(/^[0-9a-f]{40}$/.test(toolResult.recentCommits[0].hash), "真实 SHA");
assert.equal(toolResult.recentCommits[0].author, "Test User", "来自真实 git log");
```

这样同时验证了：Mastra 调用了 Tool → Tool 真的 spawn 了 git → 解析出来的 commit 是真实数据。

## 4. 待 Vincent 拍板的四个决策点

| # | 决策点 | 我的建议 | 备选 |
|---|---|---|---|
| A | 测试文件位置 | `apps/agent/src/tools/git-context-tool.integration.test.ts`（与单测同目录，文件名带 `.integration.`） | 单独建 `apps/agent/src/integration/` 目录 |
| B | 是否跑真 git | **跑真 git**（隔离 temp repo） | 只注入 mock deps（价值跟单测重叠） |
| C | `MockLanguageModelV1` 依赖 | 先查 catalog 是否已有 `@ai-sdk/provider-utils`，没有则补 catalog 再装 | 自己手写最小 mock |
| D | 覆盖范围 | 只补一个 happy-path 集成用例，路径逃逸/截断留给单测 | 覆盖全部 5 种场景（成本高） |

## 5. 不做的事（边界）

- 不测真实 LLM：非确定性、慢、贵，归 M3-16 RAG Evaluation 管。
- 不测 Mastra 内部机制：那是 Mastra 自己仓库的契约。
- 不补 M3-04/05/06 的同类集成测试：等 M3-04 落地时单独评估。

## 6. 与本日记同目录的关联阅读

- [2026-06-10-m2-review-and-m3-assessment.md](./2026-06-10-m2-review-and-m3-assessment.md) — M2 验收与 M3 评估
- [2026-06-10-zod-usage-audit.md](./2026-06-10-zod-usage-audit.md) — zod schema 审计（与本次 mock LLM 的 schema 解析相关）

## 7. 下一步动作（待批准）

1. 查 `pnpm-workspace.yaml` catalog 是否已有 `@ai-sdk/provider-utils` / `ai`。
2. 如果没有：补 catalog、`pnpm install`、冻结版本。
3. 写 `git-context-tool.integration.test.ts`（一个 happy-path 用例）。
4. `turbo test --filter=@opsagent/agent` 验证绿。
5. M3-07 卡片补一条测试证据，再提交。

**当前状态：讨论已落盘，等 Vincent 拍板 A/B/C/D 再动手。**
