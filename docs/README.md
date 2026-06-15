# 项目知识库入口

> **本文件是 `docs/` 的总入口。AI 和人从这里开始探索项目知识。**
>
> 必读链路：本文件 → [[README|ADR 索引]] → [[AGENTS|AGENTS.md]] → [[CLAUDE|CLAUDE.md]]

---

## 核心入口（必读）

- [[AGENTS|AGENTS.md]]：项目根目录的 Agent 约束（任务工作流、代码探索约定、测试要点）
- [[CLAUDE|CLAUDE.md]]：项目根目录的完整架构、命令清单、里程碑路线图
- [[README|ADR 索引]]（`docs/decisions/`）：**架构决策的唯一权威来源**
- [[task-breakdown|任务分解]]：里程碑任务卡片总览

## 主题目录

### [[README|架构决策]]（`docs/decisions/`）

每个关键决策一篇 ADR，含 Context / Decision / Consequences / 反向引用。采用 Karpathy LLM Wiki 风格 + Obsidian `[[]]` 双向链接。

当前 ADR：
- [[0000-adopt-adr|ADR-0000 采用 ADR 模式管理知识库]]（2026-06-14）

批次 2 待分流：env 层设计、错误监控策略、Zod 治理、hook 策略、workflow v2 设计（ADR-0001~0005）

### 里程碑（`docs/milestones/M{N}/`）

每个里程碑一个目录，包含规划、任务卡、交接、复盘、教训：

- **M0/**：项目脚手架（任务卡 8 张 + milestone-acceptance）
- **M1/**：技术栈基线审计
  - [[M1/planning|planning]] / [[M1/retrospective|retrospective]]
  - [[M1/tasks/|tasks/]]（2 张）
- **M2/**：可观测性基础闭环（Prometheus + Loki + Tempo + Grafana）
  - [[M2/planning|planning]] / [[M2/retrospective|retrospective]]
  - [[M2/tasks/|tasks/]]（9 张）
- **M3/**：AI Agent 整合（Mastra + GBrain + Analysis Pipeline）
  - [[M3/planning|planning]] / [[M3/retrospective|retrospective]]
  - [[M3/handoff|handoff]] / [[M3/closure|closure]]
  - [[M3/tasks/|tasks/]]（17 张）
- **M4/**（进行中）：前端错误定位（Sentry + Source Map）
  - [[M4/planning|planning]] / [[M4/handoff|handoff]] / [[M4/retrospective|retrospective]]
  - [[M4/tasks/|tasks/]]

### 包手册（`docs/packages/`）

每个 workspace 包一个手册页（规划中，M5 启动）。

### 教训（`docs/lessons/`）

跨里程碑的通用工程方法论与架构思考（与 ADR 互补：ADR 记录"决定做什么"，lessons 记录"思考过程"）：

- [[tdd-and-test-governance|TDD 与测试治理]]：为什么选 Codex 做 test-strategist，测试治理决策流程
- [[gbrain-rag-and-document-governance|GBrain RAG 与文档治理]]：知识库方法论，为 M4+OpenHands 准备
- [[2026-06-15-monorepo-env-governance|Monorepo 环境变量治理]]：中央 schema vs 包自治的架构张力（含面试表达 3 层次）

### 运维手册（`docs/runbooks/`）

基础设施 / 部署 / 故障处理手册（规划中）。

## 工作流相关

- [[agent-execution-workflow|任务执行工作流]]（`docs/workflows/`）
- [[team-ownership|团队所有权]]：各个 package / app 的负责团队
- [[testing-guide|测试指南]]：测试规范与工具

## 历史文档

- `docs/devlog/`：开发日志（批次 2 后将清空，分流到 ADR / milestones / lessons）
- `docs/issues/`：M0-M3 任务卡（批次 3 将迁到 `milestones/M{N}/tasks/`）

## 阅读建议

### AI 接手新会话时

1. 读 [[AGENTS|AGENTS.md]] 顶部必读清单
2. 读 [[README|ADR 索引]] 了解当前决策状态
3. 读当前里程碑的 `planning.md` + `handoff.md` 了解进度
4. 开始工作

### 新人 onboarding

1. 读 [[CLAUDE|CLAUDE.md]] 了解项目全貌
2. 读 [[0000-adopt-adr|ADR-0000]] 理解知识库组织原则
3. 用 Obsidian 打开 `docs/` 作为 vault，启用 backlinks 视图
4. 按兴趣探索 `decisions/` 或 `milestones/`

## 知识库原则

- **扁平 + 描述性文件名**：目录只一层深度（Karpathy LLM Wiki 精神）
- **自包含**：每篇文档能独立被读懂
- **散文式写作**：有"为什么"不只是"是什么"
- **双向链接纪律**：所有内部链接用 Obsidian `[[slug|显示名]]`；新建引用时同步在被引用文档的 `## 反向引用` 区追加一条
- **仅外部 URL 用 `[text](url)`**

详见 [[0000-adopt-adr|ADR-0000]] 和 [[README|ADR 索引 §4 双向链接纪律]]。
