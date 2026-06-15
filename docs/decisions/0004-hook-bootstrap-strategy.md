# ADR-0004: 工作流门禁采用 shell 先行 + TypeScript 渐进接管

- **日期**：2026-06-05
- **状态**：`accepted`
- **决策者**：项目维护者 + AI agent
- **关联**：
  - [[0000-adopt-adr|ADR-0000]]：知识库结构
  - [[0005-workflow-v2-design|ADR-0005]]：工作流 v2 设计

## Context

讨论 Claude Code hooks（钩子）时，项目维护者提出了一个自然的问题：

> 既然 OpsAgent 要走 TypeScript-first（类型脚本优先），为什么 hooks（钩子）不一开始就直接写成 TypeScript？

这个问题触到了 M0 阶段最核心的架构问题：**bootstrap dependency（启动依赖）和 workflow gate（工作流门禁）的先后关系**。如果一开始就把 hooks 写成 TypeScript，会出现"鸡生蛋问题"——hook 需要 `package.json` / pnpm / tsx / build 等基础设施，但 M0 正是要创建这些基础设施；M0 还没开始，hook 自己就先失败了。

## Decision

**当前阶段先用 shell（命令行脚本）实现最小门禁，等 M0 完成 TypeScript monorepo 后，再把复杂逻辑迁移到 TypeScript。**

### 三阶段演进

| 阶段 | 做法 | 原因 |
|---|---|---|
| M0 前 | shell 脚本直接跑 | 无依赖，能立刻保护 `.env`、密钥、危险命令 |
| M0 中 | shell 做最小验证 | 保证 Claude Code + DeepSeek 不跳过任务范围 |
| M0 后 | TypeScript 化 | 提高可维护性、可测试性、CodeGraph 友好度 |

### 最终形态

理想结构：

```text
.claude/
  hooks/
    pre-tool-guard.sh
    stop-check.sh

packages/
  workflow-gates/
    src/
      preToolGuard.ts
      stopCheck.ts
      rules/
        m0.ts
```

最终 shell 脚本应该只保留**薄启动器**（thin wrapper）：

```bash
#!/usr/bin/env bash
node packages/workflow-gates/dist/stopCheck.js
```

### 设计哲学

架构设计不能只看最终形态，也要看启动路径。工作流门禁本身也有依赖和生命周期。好的架构不是一开始就做成最漂亮，而是按阶段让系统稳定演进。

## Consequences

### 正面

- **立刻可用**：shell 脚本零依赖，能在 M0 还没开始时保护项目
- **启动路径清晰**：不陷入"鸡生蛋"死锁
- **渐进演化**：每个阶段有明确的"何时升级"触发条件

### 负面

- **两套实现期**：M0 完成前必须接受 shell 版本的"原始"形态
- **迁移成本**：M0 后需要把 shell 逻辑完整翻译成 TypeScript，存在"双写期"

### 风险

- **shell 脚本失控**：如果 M0 延期，shell 脚本可能积累太多逻辑，迁移成本暴涨
- **薄启动器纪律**：最终形态要求 shell 只做 thin wrapper，如果开发者继续在 shell 里加业务逻辑，会偏离目标

## 反向引用

暂无
