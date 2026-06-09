# Workflow V2 评审意见

日期：2026-06-09
评审人：Qoder CLI CN
评审对象：
- `docs/devlog/2026-06-08-workflow-system-audit.md`
- `docs/workflows/workflow-v2-design.md`

> 本文档记录对 v2 设计的评审意见。**仅讨论、不落地**，等待项目 owner 决策。

## 1. 总体评价

审计与 v2 设计是一对"诊断 + 处方"，质量高，是项目从 M2 推进到 M3 前必须做的结构性整理。审计的四个发现都站得住，v2 的 6 角色 → 3 actor 精简、消息总线作为编排骨干、适配器可插拔三个核心方向均合理。

但设计落地前有几处需要进一步澄清或补充，否则会在 M3 实施期产生歧义。

## 2. 对审计的反馈

### 2.1 两条最关键的洞察

1. **"Codex 下线对系统自动化能力的影响：零"** — 戳破了 M0-15 / M0-16 文档里"Codex 作为独立测试者"的幻觉。承认它是 Manual actor，是向前走的必要条件。
2. **"消息总线目前是结构化审计日志"** — 这是比 Codex 替换更深的结构问题。M0-16 时序图里画的 Agent 间通信在代码里根本没发生，两套系统平行空转。

### 2.2 "立即第一步"与 v2 方案的冲突

审计建议"立即第一步（5 分钟，零风险）"把 test-strategist 的 actor 从 `codex` 替换为 `claude-code-new-context`。但 v2 设计里：
- 移除了 `claude-code-new-context`，改为 `claude-code-readonly`
- 整个 actor-registry 格式要重写

这意味着审计第一步在 v2 路径下是"死代码"——落了就要在 v2 迁移时再改一次。**必须决策走哪一条路**，不能两条并存。

## 3. 对 v2 设计的反馈

### 3.1 赞成

| 设计点 | 理由 |
|---|---|
| 6 角色 → 3 actor | 独立审查靠"会话隔离 + 提示词隔离 + 权限隔离"而非模型差异，论证充分 |
| 消息总线作为编排副作用（自动 send + 自动 inject） | 正确方向，让 M0-16 时序图真正成立 |
| `ManualAdapter` 改为打印提示词正常返回 | 小改动，但让状态机不再被 manual 卡住 |
| 迁移路径走"v2 并行 → 验证 → 删 v1" | 风险可控 |

### 3.2 需要再想一下的点

#### 问题 1：devlog 第一步与 v2 路径的并存

见 2.2。两条路径并存会造成后续 agent 执行歧义。

**建议**：在 M3 启动会上正式决策，并把结论写入 M3 issue 文件。M2 收尾期保持现状，不做任何工作流改动。

#### 问题 2：编排引擎与消息总线的双向依赖

v2 设计让 `orchestration.ts` 加 `bus.send()`，同时 `actorRuntime` 从 bus 注入未读消息到 prompt。这形成了：

```
orchestration ──send──▶ bus
actorRuntime ◀──inject── bus
```

如果 bus 再依赖 orchestration 的状态定义（比如 message type 由状态机派生），就会形成闭环依赖，未来测试和替换都困难。

**建议**：明确 bus 是单向依赖（只读），状态机变更是 bus 的生产者，actorRuntime 是 bus 的消费者。必要时把 message type 拆到独立的 `messageTypes.ts`。

#### 问题 3：状态机状态遗漏

v2 设计 6.3 节只列了 5 个状态：`planned` / `implementing` / `testing` / `ready_for_review` / `completed`。

v1 的 `packages/workflow-gates/src/taskState.ts` 里还有 `blocked`、`waiting_approval`、`cancelled` 等状态（需要对照确认）。如果 v2 直接丢弃这些状态，迁移期正在运行 v1 的任务会失去对应。

**建议**：补一份 v1 → v2 状态映射表，明确每个 v1 状态在 v2 中的去向（保留 / 合并 / 废弃 + 理由）。

#### 问题 4：只读 actor 的 allowedTools 未包含 CodeGraph MCP

v2 设计 9 节 `actor-registry.json` 的 `claude-code-readonly`：

```json
"allowedTools": ["Read", "Glob", "Grep", "Bash"]
```

但 CodeGraph MCP 刚刚接入（分支 `qoder/workflow-v2-review` 之前的会话完成），它的所有工具都以 `mcp__codegraph__` 为前缀。

tester / test-strategist / reviewer 这些只读角色，正是 CodeGraph **最该用的地方**——做符号级查询、影响面分析、调用链追踪都不需要写权限。

**建议**：`claude-code-readonly` 的 allowedTools 显式放行 `mcp__codegraph__*`（通配符）或列全 9 个 codegraph 工具。同理 `claude-code` 也应放行。

#### 问题 5：迁移步骤缺验收标准和回退方案

v2 设计 11 节列了 10 条迁移步骤，但：
- 没有"如何认定 v2 可用"的验收标准
- 没有"v2 出问题怎么回退到 v1"的方案
- 没有明确"何时删除 v1"

**建议**：补充三条：
1. **验收标准**：M3 第一个任务用 v2 跑完整闭环（planned → implementing → testing → ready_for_review → completed），消息总线有真实的 task_assignment + execution_result 记录
2. **回退方案**：v1 和 v2 在 `.claude/settings.json` 里通过不同 hook 脚本切换，回退只需改 hook 指向
3. **删除时机**：M3 第三个任务成功后删除 v1 `workflow-gates` 目录

## 4. 落地时机建议（关键）

**当前分支是 `M2-06-edit-by-ClaudeCode`，M2 还差 3 个子任务没收尾**（Jaeger/Tempo、Dashboard、SLO）。审计与 v2 设计本质是**M3 启动前的工作流基础设施改造**，不应该在 M2 期间落地。

建议分三步：

1. **当前（M2 收尾期）**：
   - 把审计和 v2 设计加到 git（已完成，commit `25c1b11`）
   - 评审意见加到 git（本文件）
   - **不执行**审计第一步，**不实施** v2 任何代码
   - 所有讨论以 md 形式沉淀

2. **M2 验收通过后**：
   - 在 M3 启动会上正式决策"直接进 v2 vs 先落审计第一步"
   - 把决策写入 M3 issue 文件（`docs/issues/M3-agent-analysis-loop.md` 或拆分出的 `workflow-v2-migration.md`）

3. **M3 启动时**：
   - 若选 v2 直接落地：作为 M3-01 的配套前置工作
   - 若选先落审计第一步：作为 M3 前的 5 分钟独立提交，再评估是否还有必要做 v2

## 5. 决策记录（待填）

> 本节由项目 owner 在 M3 启动会上填写。

- [ ] 决策路径：直接进 v2 / 先落审计第一步 / 其他
- [ ] 状态映射表补充位置：`docs/workflows/workflow-v2-state-mapping.md`（待建）
- [ ] CodeGraph MCP 工具是否加入只读 actor：是 / 否
- [ ] v1 删除时机：____

## 6. 不做的事（明确边界）

- **不动 v1 源码**：`packages/workflow-gates/src/*.ts` 保持原状
- **不动 role-policy.json / actor-registry.json**：`.agent/` 目录保持原状
- **不动 hook 脚本**：`.claude/hooks/*.sh` 保持原状
- **不动 shell 入口**：根 `package.json` scripts 保持原状
