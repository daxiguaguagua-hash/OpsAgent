# M0-12 Role and Test Governance 角色与测试治理

日期：2026-06-06
状态：`done`（M0-17 验收通过）
前置任务：M0-11
负责人：qa-team

## 1. 目标

M0-12 把 Architect（架构角色）、Implementer（实现角色）、Test Strategist（测试策略角色）、Tester（测试角色）、Reviewer（审查角色）和 Human Approver（人类批准角色）的职责写成机器可读策略。

```mermaid
flowchart LR
  A[Architect 架构] --> B[Implementer 实现]
  B --> C[Test Strategist 测试策略]
  C --> D[Tester 测试]
  D --> E[Reviewer 审查]
  E --> F[Human Approver 人类批准]
```

## 2. 核心规则

| 规则 | 约束 |
|---|---|
| 每次任务变更都要分析测试影响 | 记录 `testImpact` |
| Implementer（实现角色）不能单方面修改测试合同 | 必须与 Codex 达成共识 |
| Tester（测试角色）独立验证 | 使用全新上下文 |
| 送审必须有测试证据 | `testEvidence` 不能为空 |
| 高风险任务需要人类批准 | 由 `humanApprovalRequired` 控制 |

## 3. 机器可读文件

| 文件 | 作用 |
|---|---|
| `.agent/role-policy.json` | 角色、执行者和任务类型分工 |
| `.agent/role-policy.schema.json` | 角色策略 Schema（结构定义） |
| `.agent/active-task.example.json` | 活动任务合同示例 |

完整执行规则参见：

- [Agent Role Policy 智能体角色策略](../../../workflows/agent-role-policy.md)
- [[tdd-and-test-governance|TDD 与测试治理]]（`docs/lessons/tdd-and-test-governance.md`）
