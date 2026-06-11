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

## 7. 架构方向转向：从 v2 自研转向 OpenHands 评估

日期：2026-06-09
触发：项目 owner 对项目价值层级的澄清

### 7.1 价值层级澄清

本次讨论明确了 OpsAgent v0.1 的两层价值划分：

| 层级 | 内容 | 定位 |
|---|---|---|
| **产品本体**（对外交付的价值） | 系统上线 → 运行时兜底 → 故障观测 → 立刻定位到源代码 → 输出报告 | OpsAgent 的真正卖点，必须自研 |
| **研发过程工具**（内部开发治理） | 消息总线、v2 工作流、角色策略、hook 门禁 | 模拟企业研发流程的工程手段，不必自研 |

v0.1 验收标准（`docs/task-breakdown.md` 第 21-31 行）的 7 项全部是产品本体能力，没有任何一项是"消息总线"或"工作流引擎"。M0 阶段把研发过程工具做厚了，属于范围外延。

### 7.2 结论

**放弃 v2 自研路径，转向评估 OpenHands 作为研发过程工具层。**

理由：
1. 消息总线在产品验收标准里没有位置，继续投入是范围蔓延
2. OpenHands 原生支持多 Agent 协作和事件流，能直接满足"给前端/后端团队定流程"的需求，无需维护 6 角色 × 3 actor × hook 门禁 × 消息类型的自研组合
3. 节省下来的 2-3 周投入产品本体（M2 Dashboard、M3 Agent 分析质量、M4 Source Map）价值更高

### 7.3 v2 状态：`frozen`

从本节生效起：

- `docs/workflows/workflow-v2-design.md` 不再进入实施，仅作为"过程思考"存档
- 第 3 节列出的 5 个待决问题**全部作废**，不再需要决策
- 第 4 节列出的"落地时机建议"作废，不再绑定 M3 启动会决策
- `.agent/role-policy.json`、`.agent/actor-registry.json`、`packages/workflow-gates/`、`.claude/hooks/` 维持 v1 现状，不做任何 v2 相关改动

### 7.4 待决策项（下一步）

在正式进入 OpenHands 评估之前，需要项目 owner 对以下两项做决策：

#### 决策 1：面试叙事路径

| 选项 | 叙事方式 | 适用场景 |
|---|---|---|
| **A. 架构选型决策叙事** | "我评估过自研消息总线，但评估后选择 OpenHands，因为 X/Y/Z" | 强调工程判断力 |
| **B. 双轨叙事** | v2 代码保留作为"我能手搓"的证据；生产用 OpenHands；面试两套都讲 | 强调实现能力 + 选型能力 |

#### 决策 2：v2 文档的长期处置

| 选项 | 动作 | 说明 |
|---|---|---|
| **A. 冻结** | v2 设计保留，加 `frozen` 标签 | 过程思考存档，不进入实施 |
| **B. 降级为教学参考** | v2 设计移入 `docs/archive/` 或加 `educational-only` 标签 | 明确"不是产品路径" |
| **C. 作为 OpenHands 评估 baseline** | 用 v2 功能清单反向推导 OpenHands 配置项 | v2 转化为评估工具的 checklist |

### 7.5 立即动作（待上述决策后执行）

- [ ] 根据决策 1 选定面试叙事路径，写入 M3 启动文档
- [ ] 根据决策 2 选定 v2 处置方式，调整本文件和 `workflow-v2-design.md` 的标签
- [ ] 新建 `docs/workflows/openhands-evaluation.md`，记录 OpenHands 评估计划（spike 范围、评估标准、与 v2 baseline 的功能对照表）
- [ ] 更新 `docs/task-breakdown.md` 第 284 行"当前下一步"段落，明确"消息总线 / 工作流"不在 v0.1 范围内

### 7.6 不做的事（本节边界）

- **不启动 OpenHands 安装或 spike**：等待决策完成后再规划
- **不删除 v2 文档**：保留作为决策链证据
- **不动 v1 源码**：与第 6 节边界一致
- **不在 M2 收尾期做任何工作流相关改动**：M2 的 Jaeger/Tempo、Dashboard、SLO 优先

### 7.7 待决策项已闭环（2026-06-09）

| 决策项 | 选择 | 备注 |
|---|---|---|
| 决策 1：面试叙事路径 | **A. 架构选型决策叙事** | "我评估过自研消息总线，但评估后选择 OpenHands"——强调工程判断力 |
| 决策 2：v2 文档长期处置 | **C. 作为 OpenHands 评估 baseline** | v2 设计的功能清单反向推导 OpenHands 配置项；同时保留 `frozen` 标签 |

两项决策已写入第 8 节，作为 V3 架构最终决策的一部分。

## 8. V3 架构最终决策（2026-06-09）

### 8.1 决策结论

在 v2 frozen 的基础上，经过一轮完整的架构重选，收敛到 **三层收敛 + 方案 A**：

| 层 | 选型 | 语言 |
|---|---|---|
| 顶层 编排 | **OpenHands**（Conversation + EventLog） | Python |
| 中层 小任务执行 | **OpenHands 自带 Agent**（方案 A） | Python |
| 底层 业务代码 + M3 故障分析 Agent | **Mastra** + React + Node | TypeScript |
| 底层 可观测栈 | Prometheus + Loki + Grafana + Tempo | 各自原生 |

### 8.2 否决的方案

- **方案 B：OpenHands + LangGraph** — 两套 Python Agent 栈并存，OpsAgent 工作流是线性状态机用不到 LangGraph 的循环图能力
- **方案 C：OpenHands + Mastra 中层** — 跨栈调用复杂度高，收益不大
- **引入 LangChain** — Mastra + OpenHands 已覆盖其能力，再加是冗余

### 8.3 完整 V3 文档

详见 [`docs/architecture/architecture-v3-candidacy.md`](../architecture/architecture-v3-candidacy.md)，包含：
- 三层架构图与职责划分
- 方案 A / B / C 的详细对比与否决理由
- 自定义 Agent 子类设计示例
- Conversation 编排示例
- "可控性"的五个机制（含测试纪律强制）
- 与 v0.1 验收标准的逐项映射
- 演进路径（V3.1 / V3.2 / V3.3 中层升级选项）
- 明确的"不做的事"边界

配套文档：
- [`test-discipline-checklist.md`](test-discipline-checklist.md) — AI Agent 测试纪律的工程化强制规则，对应 V3 中层的 TestStrategistAgent 强制节点

### 8.4 后续动作

| 时机 | 动作 |
|---|---|
| M2 收尾期 | 不动 v1 源码，继续完成 M2-06 / M2-07 / M2-08；**已落地测试纪律清单**（2026-06-09） |
| M2 验收后 | 项目 owner 完成 Python 基础学习；启动 OpenHands spike |
| M3 启动时 | 顶层 OpenHands 与底层 Mastra 通过 HTTP / MCP 集成 |

### 8.5 决策链证据（完整）

1. [`workflow-v2-design.md`](workflow-v2-design.md) — v2 自研设计（已 `frozen`）
2. 本文件第 1-6 节 — v2 评审意见 + 5 个待决问题（已作废）
3. 本文件第 7 节 — 架构方向转向的触发 + 价值层级澄清
4. 本文件第 8 节 — V3 决策结论
5. [`architecture-v3-candidacy.md`](../architecture/architecture-v3-candidacy.md) — V3 完整架构
