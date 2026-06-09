# 测试纪律清单

日期：2026-06-09
状态：`active`
触发：项目 owner 指出 AI Agent（包括 DeepSeek、Codex、Claude、Qoder）普遍缺乏"主动更新测试"的习惯，需要工程化强制
来源讨论：V3 架构讨论（[`architecture-v3-candidacy.md`](../architecture/architecture-v3-candidacy.md)）

## 1. 为什么需要这份清单

AI Agent（包括我自己）默认行为是"改代码 + 写文档"，**不会主动想测试**。这不是能力问题，是默认行为问题。

历史上 M2-01 至 M2-05 的实施里，测试更新大多是由项目 owner 提醒后才补，或在"自动化验证"段落里一带而过。这不是纪律，是运气。

测试纪律必须被**工程化强制**，不能依赖"Agent 自觉"。

## 2. 每次任务必须回答的 3 个问题

实施任何代码改动前，implementer 必须先在任务文档的"测试影响分析"段落里回答：

| # | 问题 | 输出 |
|---|---|---|
| **Q1** | 这次改动会影响哪些现有测试？ | 列出受影响的测试文件 / 用例，并标注每个受影响项是 `update` 还是 `remove` |
| **Q2** | 这次改动需要新增哪些测试？ | 列出新增的 `unit` / `integration` / `e2e` 测试，并说明每个测试验证什么行为 |
| **Q3** | 这次改动是否需要加入回归测试清单？ | 明确回答 `yes` / `no`，若 `yes` 则列出回归项 |

> 这三个问题对应 v1 工作流里 `test-strategist` 角色的"测试影响分析"（`add / update / none`）。在 V3 OpenHands 中层里，由 `TestStrategistAgent` 强制回答。

## 3. 测试影响分析模板

每个任务文档必须有"测试影响分析"段落，格式如下：

```markdown
## 测试影响分析

### 受影响的现有测试

| 测试文件 / 用例 | 动作 | 理由 |
|---|---|---|
| `apps/backend/src/__tests__/foo.test.ts` - `should do X` | `update` | 函数签名变化，断言需更新 |
| `apps/backend/src/__tests__/bar.test.ts` - `should handle Y` | `none` | 未涉及 |

### 新增测试

| 测试类型 | 测试文件 / 用例名 | 验证行为 |
|---|---|---|
| `unit` | `apps/backend/src/__tests__/baz.test.ts` - `should do Z` | 新功能核心逻辑 |
| `integration` | `apps/backend/src/__tests__/api.test.ts` - `should respond 200 for /api/foo` | 端到端接口 |
| `e2e` | （本任务不需要 / 或列出 e2e 测试） | — |

### 回归测试清单更新

- [ ] 把 `<新增测试名>` 加入 M3 启动时的回归测试清单
- [ ] 把 `<受影响测试名>` 加入 M2 验收时的回归测试清单

### 不写测试的理由（若 applicable）

> 仅当确实不需要写测试时填写，例如纯文档改动、纯配置改动。业务代码改动**不允许**填这一栏。
```

## 4. V3 OpenHands 中层的强制机制

V3 架构（[`architecture-v3-candidacy.md`](../architecture/architecture-v3-candidacy.md) 第 5 节）中层有 4 个 Agent 子类。**`TestStrategistAgent` 必须强制位于 `ImplementerAgent` 和 `TesterAgent` 之间**：

```
ImplementerAgent 写完代码
   ↓
TestStrategistAgent（强制）
   ├── 读 EventLog 看 implementer 改了哪些文件
   ├── 分析测试影响（回答 Q1/Q2/Q3）
   └── 发 event: {type: "test_impact", action: "add/update/none", rationale: ...}
   ↓
architect / approver（人类）审批 test_impact
   ↓
TesterAgent 按 test_impact 执行测试
```

**强制机制实现**：
- `OpsAgentConversation.next_agent()` 在 `event_log.has("implementation_done") and not event_log.has("test_impact")` 时**只返回 TestStrategistAgent**，不能跳过
- 人类审批 `test_impact` 前，TesterAgent 不会被 spawn

这对应 v1 工作流里 `rolePolicy.ts` 的 `assertReadyForReview` hook（"test impact must be approved by test-strategist before review"），但用 OpenHands 的 Conversation 状态机实现，更优雅。

## 5. 任务拆解时的默认步骤

每次拆解一个任务（M2-06 及以后），实施步骤必须包含：

| # | 步骤 | 说明 |
|---|---|---|
| 1 | 写任务文档，**包含测试影响分析段落** | 回答 Q1/Q2/Q3 |
| 2 | TestStrategistAgent（或项目 owner）审批测试影响 | 确认 add/update/none 合理 |
| 3 | 实施代码 | — |
| 4 | **同步实施测试**（新增 + 更新） | 不是"事后补"，是同一次提交 |
| 5 | 运行回归测试清单 | 确保不退化 |
| 6 | 写提交信息，**提及测试变更** | 例如 `feat: add X with tests for Y` |
| 7 | 更新回归测试清单（如有需要） | — |

## 6. AI Agent 的默认行为约束

作为 AI Agent（包括我自己），每次收到任务时**必须**：

1. **在写第一行代码前**，先读任务文档的"测试影响分析"段落
2. **在写第一行代码前**，若该段落为空，**主动询问项目 owner** "测试影响是什么"而不是直接动手
3. **在提交代码时**，必须把测试文件（新增 + 更新）和代码一起提交，不允许"代码先提交，测试后面补"
4. **在报告任务完成时**，必须在报告里列出：新增测试 N 个、更新测试 M 个、回归通过 K 个

## 7. 不做的事（边界）

- **不要求每个小改动都加 e2e 测试**：unit / integration 够用的就不加 e2e
- **不要求一次性写完所有测试**：但必须在测试影响分析里说明哪些现在写、哪些延后（并标注延后理由）
- **不要求 AI Agent 主动设计测试策略**：测试策略由 test-strategist（人或 Agent）负责，implementer 只执行

## 8. 历史任务的补做清单

> 本节列出在 V3 架构讨论期间发现的"没写测试"的历史任务，由项目 owner 决定是否补做。

| 任务 | 是否补做 | 理由 |
|---|---|---|
| M2-06 Jaeger/Tempo | ✅ 新任务，按本清单执行 | 见 [`M2-06-jaeger-tempo.md`](issues/M2-06-jaeger-tempo.md) |
| M2-07 Dashboard | 待定 | 若实施则按本清单 |
| M2-08 SLO | 待定 | 若实施则按本清单 |
| M2-01 至 M2-05 | 项目 owner 决定 | 见第 9 节 |

## 9. M2-01 至 M2-05 的测试现状审计

| 任务 | 现有测试覆盖 | 缺失测试 | 是否补做 |
|---|---|---|---|
| M2-01 结构化日志 | 日志格式测试 ✅ | — | — |
| M2-02 Prometheus | 指标生成测试 ✅ | 500 vs 200 指标对比测试 | 项目 owner 决定 |
| M2-03 Loki + Alloy | JSONL 采集测试 ✅ | Alloy 配置端到端测试 | 项目 owner 决定 |
| M2-04 Grafana datasources | provisioning 测试 ✅ | — | — |
| M2-05 OTel Collector | Trace 测试 2/2 ✅，原有后端测试 18/18 ✅ | Collector 黑盒验收（待镜像拉取） | 已在 M2-05 文档中列出 |

> 这份审计不强制补做，仅作为"现状快照"。项目 owner 根据 V3 架构的实际需求决定哪些要补。

## 10. 与既有文档的关系

| 文档 | 关系 |
|---|---|
| [`M0-12-role-test-governance.md`](issues/M0-12-role-test-governance.md) | M0 阶段的测试治理共识，本清单是其在 V3 架构下的具体执行规则 |
| [`2026-06-06-tdd-and-test-governance.md`](../devlog/2026-06-06-tdd-and-test-governance.md) | 测试治理的决策背景，本清单不重复决策过程 |
| [`agent-role-policy.md`](../workflows/agent-role-policy.md) | v1 角色策略，本清单沿用其"test-strategist 强制节点"思想 |
| [`architecture-v3-candidacy.md`](../architecture/architecture-v3-candidacy.md) | V3 架构，本清单对应其中层的 TestStrategistAgent |

## 11. 决策记录

- **2026-06-09**：项目 owner 指出 AI Agent 普遍缺乏"主动更新测试"的习惯，要求工程化强制
- **2026-06-09**：本清单落地，作为 V3 架构的配套执行规则
- **2026-06-09**：M2-06 起所有新任务必须遵守本清单
