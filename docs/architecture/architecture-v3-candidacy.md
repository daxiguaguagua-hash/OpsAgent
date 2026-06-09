# OpsAgent V3 架构候选方案

日期：2026-06-09
状态：`candidate`（已决策，待 spike 验证）
前置讨论：
- [`workflow-v2-review-comments.md`](../workflows/workflow-v2-review-comments.md) 第 7 节（架构方向转向）
- [`workflow-v2-design.md`](../workflows/workflow-v2-design.md)（`frozen`，v2 自研路径已放弃）

## 1. 背景：为什么要做 V3

### 1.1 v1 / v2 的结构性问题

v1（`packages/workflow-gates/`）存在四个结构问题，详见 [`workflow-system-audit.md`](../devlog/2026-06-08-workflow-system-audit.md)：

1. Codex 硬编码在三层，且已下线
2. 消息总线与编排引擎平行运行，互不调用
3. actorRuntime 只有一条执行路径（claude CLI），manual actor 直接抛异常
4. gpt5.5、codex 标为 manual actor，从未被系统自动调用

v2 曾尝试在自研路径上修复这些问题，但在价值层级澄清后被判定为"继续做厚研发过程工具"，已标为 `frozen`。

### 1.2 价值层级澄清

2026-06-09 讨论明确了 OpsAgent v0.1 的两层价值划分：

| 层级 | 内容 | 定位 | 是否自研 |
|---|---|---|---|
| **产品本体**（对外交付的价值） | 系统上线 → 运行时兜底 → 故障观测 → 立刻定位到源代码 → 输出报告 | OpsAgent 的真正卖点 | ✅ 必须自研 |
| **研发过程工具**（内部开发治理） | 任务编排、角色协作、测试审批、代码监管 | 模拟企业研发流程的工程手段 | ❌ 用成熟开源方案 |

v0.1 验收标准（`docs/task-breakdown.md` 第 21-31 行）的 7 项全部是产品本体能力，没有任何一项是"消息总线"或"工作流引擎"。

### 1.3 项目 owner 给出的 V3 约束

> (a) **产品解决两件事**：
>   1. 业务代码前后端的开发，使用 AI 开发、测试
>   2. 业务上线后的兜底，用到 Grafana 技术（已选定）
>
> (b) **技术栈**：Python + TypeScript
>   - 业务层面用 **OpenHands** 监管整个大流程
>   - 拆分出来的小任务如何实现、流程如何可控，待评估
>
> (c) **自研 vs 开源**：
>   - Grafana + 业务代码 自研
>   - 其他都用成熟开源方案

## 2. 设计原则

| 原则 | 说明 |
|---|---|
| **栈收敛** | 能一层解决的不堆两层；拒绝引入 LangChain / LangGraph 这种"重复覆盖"的框架 |
| **产品本体优先** | 时间投在"故障分析 Agent"和"观测栈"，不投在自研工作流 |
| **开源平台兜底** | 编排、执行、沙箱、审计全交给 OpenHands，不自研 |
| **可演进** | V3 方案 A 若不够用，可升级到方案 B（中层换 LangGraph）或方案 C（中层换 Mastra），顶层和底层不动 |
| **双栈并存但边界清晰** | Python（OpenHands）+ TypeScript（业务 + Mastra）通过 HTTP / MCP 通信，不混写 |

## 3. 总体架构：三层收敛

```
┌─────────────────────────────────────────────────────────┐
│  顶层：OpenHands（监管层 / 编排层）                       │
│  - Conversation 编排多 Agent                             │
│  - EventLog 作为任务流转账本                              │
│  - Web UI 给人类 architect / approver 用                 │
│  - 把任务拆成小任务 → 派发给中层                          │
└────────────────────┬────────────────────────────────────┘
                     │ AgentDelegateAction / Tool 调用
┌────────────────────▼────────────────────────────────────┐
│  中层：小任务执行（OpenHands 自带 Agent）                 │
│  - CodeActAgent（写业务代码的 implementer）              │
│  - 自定义 ReviewAgent / TestAgent（OpenHands 子类）      │
│  - Docker sandbox 隔离执行                                │
│  - 每个小任务一条 event 流，可回放                        │
└────────────────────┬────────────────────────────────────┘
                     │ HTTP / MCP
┌────────────────────▼────────────────────────────────────┐
│  底层：业务代码 + 观测栈（TypeScript）                    │
│  - apps/backend (Node + Mastra 故障分析 Agent)           │
│  - apps/frontend (React)                                 │
│  - observability/ (Prometheus + Loki + Grafana + Tempo)  │
└─────────────────────────────────────────────────────────┘
```

## 4. 顶层：OpenHands 监管层

### 4.1 职责

- 接收人类（architect / approver）通过 Web UI 创建的任务
- 把任务拆成小任务（implement → test-strategist → tester → reviewer）
- 派发给中层执行，追踪状态
- 汇总所有 event 形成审计证据链
- 提供 Web UI 给人类审批和观察

### 4.2 核心组件

| 组件 | 作用 |
|---|---|
| `Conversation` | 编排多个 Agent 的协作顺序（v1 后替代了 `AgentController`） |
| `EventLog` | append-only 事件账本，所有 Agent 动作都记录 |
| `Runtime` | Docker sandbox 隔离执行环境 |
| `AgentDelegateAction` | 子 Agent 委派机制，每个 Agent 保持独立 EventLog |
| Web UI | 人类审批、观察、介入的界面 |

### 4.3 为什么是 OpenHands 而不是其他

| 候选 | 结论 |
|---|---|
| OpenHands | ✅ 选用：运行时 + 编排 + 沙箱 + Web UI 一体化，Python 原生，主流方案 |
| AutoGen | ❌ 维护中，不推荐 |
| CrewAI | ❌ 适合快速搭建，但细粒度控制不够 |
| LangGraph | ❌ 是 workflow 引擎，不是 Agent 平台；缺沙箱和 UI |
| 自研 | ❌ v1 / v2 已验证成本过高 |

## 5. 中层：小任务执行

### 5.1 方案选型（三选一）

#### 方案 A：OpenHands 自带 Agent（**已选**）

```
OpenHands Conversation（监工）
  └── spawn CodeActAgent（implementer）→ Docker sandbox 里改代码
  └── spawn ReviewAgent（自定义子类）→ 读 diff + 写 review
  └── spawn TestAgent（自定义子类）→ 跑 pytest/jest + 上报证据
```

**优点**：
- 框架最少（只有 OpenHands）
- 自带 Docker sandbox、EventLog、Web UI
- 小任务的可控性 = EventLog 的细粒度记录 + Agent 的 tool 白名单

**缺点**：
- 自定义 Agent 子类的提示词需要迭代
- "可控性"依赖 EventLog 观察，不是 LangGraph 那种显式状态图

#### 方案 B：OpenHands + LangGraph（否决）

```
OpenHands（顶层编排）
  └── HTTP 调用 LangGraph 服务
      └── LangGraph 状态图管理小任务
```

**否决理由**：
- 两套 Python Agent 栈并存（OpenHands Agent + LangGraph Node）
- OpenHands 已经有 EventLog，再加 LangGraph 状态图是重复
- OpsAgent 工作流是线性状态机（planned → implementing → testing → review → completed），用不到 LangGraph 的核心能力（循环图）

#### 方案 C：OpenHands + Mastra（否决）

```
OpenHands（顶层编排，Python）
  └── HTTP 调用 Mastra workflow（TypeScript）
      └── Mastra 跑小任务
```

**否决理由**：
- 跨栈调用（Python → TypeScript）增加集成复杂度
- 小任务执行还要跨进程，调试成本高
- 收益不大（OpenHands 自带 Agent 也能做）

### 5.2 自定义 Agent 子类设计（方案 A）

```python
class ImplementerAgent(Agent):
    # 提示词：实现批准范围内的代码，不能削弱测试
    # tools: Read/Edit/Write/Bash/CodeGraph

class TesterAgent(Agent):
    # 提示词：从验收标准出发验证行为，不修改项目文件
    # tools: Read/Bash/CodeGraph（无 Edit/Write）

class TestStrategistAgent(Agent):
    # 提示词：分析测试影响，判断 add/update/none
    # tools: Read/CodeGraph（只读）

class ReviewerAgent(Agent):
    # 提示词：审查代码和测试证据
    # tools: Read/CodeGraph（只读）
```

`architect` 和 `approver` 是人类角色，不需要 Agent 子类，OpenHands 原生支持 human-in-the-loop。

### 5.3 Conversation 编排示例

```python
class OpsAgentConversation(Conversation):
    def next_agent(self, event_log):
        if event_log.last_status == "planned":
            return ImplementerAgent(...)
        elif event_log.has("implementation_done") and not event_log.has("test_impact"):
            return TestStrategistAgent(...)
        elif event_log.has("test_impact_approved"):
            return TesterAgent(...)
        elif event_log.has("test_evidence") and not event_log.has("review"):
            return ReviewerAgent(...)
        else:
            return None  # 等待人类（architect / approver）
```

## 6. 底层：业务代码 + 观测栈 + 故障分析

### 6.1 业务代码（TypeScript）

| 模块 | 说明 |
|---|---|
| `apps/backend` | Node 后端，提供业务接口 + 故障演示接口 |
| `apps/frontend` | React 前端，故障按钮 + AI 报告展示 |
| `packages/shared` | 共享类型（Incident / Evidence / Recommendation） |

### 6.2 可观测栈（开源）

| 组件 | 作用 |
|---|---|
| Prometheus | 指标采集 |
| Loki | 日志聚合 |
| Tempo / Jaeger | 链路追踪 |
| Grafana | 统一可视化 |
| Alloy | 日志采集 agent |

### 6.3 M3 故障分析 Agent（Mastra + TypeScript）

**为什么 M3 不用 OpenHands**：
- 故障分析是 **产品本体** 能力，必须自研
- 需要与 TS 业务代码共享类型（Incident / Evidence / Recommendation）
- 直接读取后端暴露的 Prometheus / Loki / Tempo API，TS 栈更顺
- Mastra 原生支持 TypeScript、durable workflow、与业务代码同包发布

**能力**：
- 查询 Prometheus 指标（错误率、延迟）
- 查询 Loki 日志（按 traceId / 时间窗口）
- 查询 Tempo 链路（按 traceId）
- 读取 Git 上下文（最近 commit）
- 输出结构化 Incident Report（Markdown 模板）

**模型降级**：
- `MODEL_PROVIDER=openai` → 真实云端模型
- `MODEL_PROVIDER=ollama` → 本地模型（若资源允许）
- `MODEL_PROVIDER=mock` → 固定报告（开发/演示用）

## 7. 技术栈总览

| 层 | 选型 | 语言 | 是否自研 | 来源 |
|---|---|---|---|---|
| 顶层 编排 | OpenHands（Conversation + EventLog） | Python | 开源 + 自定义 Agent 子类 | [OpenHands](https://github.com/All-Hands-AI/OpenHands) |
| 中层 小任务执行 | OpenHands CodeActAgent + 自定义子类 | Python | 开源 + 轻定制 | 同上 |
| 底层 业务代码 | apps/backend + apps/frontend | TypeScript | 自研 | — |
| 底层 故障分析 Agent（M3） | Mastra | TypeScript | 自研（基于开源框架） | [Mastra](https://mastra.ai/) |
| 底层 可观测栈 | Prometheus + Loki + Grafana + Tempo | 各自原生 | 开源 + 自研配置 | — |
| 模型层 | OpenRouter / 直连 OpenAI / DeepSeek API | 协议层 | 通过 provider 接入 | — |
| 代码智能 | CodeGraph MCP | TypeScript CLI | 已接入 | [CodeGraph](https://github.com/sourcegraph/codegraph) |

## 8. "可控性"的四个机制

你担心"拆分出来的小任务怎么可控"，在方案 A 里通过四个机制保证：

| 机制 | 实现 | 作用 |
|---|---|---|
| **Tool 白名单** | 每个自定义 Agent 子类限制可用 tools | implementer 能 Edit，reviewer 只能 Read |
| **Docker sandbox** | OpenHands Runtime 隔离执行 | Agent 不能访问宿主文件系统 |
| **EventLog 审计** | 每次 Action / Observation 都记录 | 任务做完可完整回放"它干了什么" |
| **Human-in-the-loop** | `AgentFinishAction` 前强制暂停等人类 | architect / approver 必须显式批准 |

这四个机制覆盖了 v1 工作流里"hook 门禁 + 角色权限 + 测试审批"的所有能力，且更优雅。

## 9. 与 v0.1 验收标准的映射

| 验收项（`task-breakdown.md` 第 21-31 行） | V3 架构对应 |
|---|---|
| 一键启动 `docker compose up -d` | OpenHands + 业务代码 + 观测栈全部容器化 |
| 前后端可访问 | `apps/frontend` + `apps/backend` 不变 |
| 故障可制造（3 个入口） | 业务代码的故障接口不变 |
| 数据可观测（日志/指标/Trace 至少打通 2 类） | observability/ 栈不变（M2 已打通 3 类） |
| Agent 可分析（读观测数据输出报告） | **Mastra（M3）** 负责 |
| 模型可降级（openai/ollama/mock） | Mastra provider + OpenHands 模型配置 |
| 文档可讲解 | docs/ 整理（含 V3 架构说明） |

所有验收项都能映射，没有遗漏。

## 10. 决策记录

### 10.1 已决策

| 议题 | 决策 | 日期 |
|---|---|---|
| 价值层级 | 产品本体自研，研发过程工具用开源 | 2026-06-09 |
| v2 自研路径 | `frozen`，不再实施 | 2026-06-09 |
| 顶层编排 | OpenHands | 2026-06-09 |
| 中层小任务执行 | 方案 A（OpenHands 自带 Agent） | 2026-06-09 |
| 底层故障分析 | Mastra（TypeScript） | 2026-06-09 |
| 是否引入 LangChain | ❌ 不引入，Mastra 已覆盖其能力 | 2026-06-09 |
| 是否引入 LangGraph | ❌ 暂不引入，方案 A 足够 | 2026-06-09 |

### 10.2 否决过的方案与理由

| 方案 | 否决理由 |
|---|---|
| v2 自研工作流 | 研发过程工具不该自研，继续做厚是范围蔓延 |
| 方案 B：OpenHands + LangGraph | 两套 Python Agent 栈并存，重复，OpsAgent 工作流用不到 LangGraph 的循环图能力 |
| 方案 C：OpenHands + Mastra 中层 | 跨栈调用复杂度高，收益不大 |
| 引入 LangChain | Mastra + OpenHands 已覆盖其能力，再加是冗余 |
| AutoGen | 维护中，不推荐 |
| CrewAI | 细粒度控制不够 |

## 11. 演进路径（方案 A 不够用时）

如果 V3 方案 A 实施后发现可控性不够：

| 阶段 | 升级动作 | 影响范围 |
|---|---|---|
| **V3.1** | 中层换成 LangGraph（保留顶层 OpenHands、底层 Mastra） | 只动中层 |
| **V3.2** | 中层加入 Mastra workflow（TS 栈小任务） | 只动中层 |
| **V3.3** | 引入 LangSmith 作为 LLM 追踪层 | 新增一层，不改其他 |

每次升级都遵循：**顶层和底层不动，只动中层**。这种可演进性是方案 A 选型的重要考量。

## 12. 下一步动作

### 12.1 立即动作（M2 收尾期）

- [ ] 项目 owner 学习 Python 基础（进行中）
- [ ] 不动 v1 源码、role-policy、hook 脚本、package.json scripts
- [ ] 继续完成 M2-06 / M2-07 / M2-08

### 12.2 M2 验收后动作

- [ ] OpenHands 安装 + 基础验证（spike）
- [ ] 用 M2-06 简化版跑通"OpenHands 顶层 + 中层 CodeActAgent"闭环
- [ ] 评估自定义 Agent 子类的真实工作量

### 12.3 M3 启动时

- [ ] Mastra 故障分析 Agent 实施（保留 M3 既有设计）
- [ ] 顶层 OpenHands 与底层 Mastra 通过 HTTP / MCP 集成

## 13. 不做的事（边界）

- **不引入 LangChain / LangGraph**：栈收敛原则
- **不动 v1 源码**：与 [`workflow-v2-review-comments.md`](../workflows/workflow-v2-review-comments.md) 第 6 节一致
- **不在 M2 收尾期做任何工作流相关改动**：M2 优先
- **不自研消息总线或编排引擎**：全部交给 OpenHands
