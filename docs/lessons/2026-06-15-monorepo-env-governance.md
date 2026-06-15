# Monorepo 环境变量治理：一个未解决的架构张力

**日期**：2026-06-15
**性质**：跨里程碑通用教训（未形成决策，记录思考过程）
**触发点**：`packages/env/src/index.ts` 第 35 行的 TODO

## 关联

- [[0001-env-layer-design|ADR-0001]]：env 做唯一数据源（已决策）
- [[2026-06-14-m4-phaseA-retrospective|M4 Phase A 复盘 §2.1]]：env 绕过问题（已识别 P0）

## 1. 触发点：一行悬而未决的 TODO

```typescript
// packages/env/src/index.ts 第 35 行
/**
 * TODO: 当前的环境变量的总类型，是没法整个架构统一的。
 * 能够统一的只是当前这个 monorepo 的总包里面的环境变量
 * 每个包自己的环境变量怎么统一？
 */
```

这行 TODO 是项目维护者在 M2 期间写下的。到 M4 结束依然悬而未决——不是没人想解决，而是这个问题本身就**没有银弹**。它触到了 monorepo 架构的一个核心张力：**中央统一治理 vs 包自治**。

## 2. 现状盘点（代码审查发现）

### 已纳入 `@opsagent/env` 统一管理（仅 1 处）

`packages/env/src/index.ts` 的 server schema，覆盖 15 个跨包共享变量：DATABASE_URL / REDIS_URL / PORT / CORS_ORIGIN / MODEL_PROVIDER / CLOUD_MODEL / OLLAMA_MODEL / NODE_ENV / LOG_FILE_PATH / OTEL_* / TEMPO_ENDPOINT / PROMETHEUS_URL / LOKI_URL。

### 绕过 env 直接读 `process.env` 的"暗流"（5 处）

| 文件 | 读的变量 | 性质 |
|---|---|---|
| `apps/agent/src/tools/prometheus-tool.ts:48` | `PROMETHEUS_URL` | ❌ 已在 env schema，但工具没用 env 对象 |
| `apps/agent/src/tools/trace-tool.ts:78` | `TEMPO_ENDPOINT` | ❌ 同上 |
| `apps/agent/src/tools/loki-tool.ts:46` | `LOKI_URL` | ❌ 同上 |
| `apps/frontend/src/lib/sentry.ts:3,8,9` | `VITE_SENTRY_DSN` / `MODE` / `VITE_APP_VERSION` | ❌ M4-PhaseA 复盘 §2.1 已识别为 P0 |
| `packages/workflow-gates/src/preToolGuard.ts:36` | `OPSAGENT_ALLOW_DESTRUCTIVE` | 🟡 包专属开关，env 包不知道 |
| `apps/agent/src/tools/git-context-tool.ts:23` | `OPSAGENT_REPO_ROOT` | 🟡 包专属配置 |

### 合理的 `process.env` 用法（不该动）

- `packages/workflow-gates/src/actorRuntime.ts`：`env: process.env` 传给 `spawn()`，子进程继承
- `apps/agent/src/model-provider.test.ts`：保存/恢复 env 做测试隔离

### 前端 `web.ts` 的雏形

`packages/env/src/web.ts` 已经有 `createEnv({ clientPrefix: "VITE_", ... })`，但只定义了 1 个变量 `VITE_SERVER_URL`——这其实就是 client schema 的雏形，可以扩充。

## 3. 核心问题：三层治理的边界

把问题拆开看，实际上是**三层**：

### 第一层：跨包共享变量（已解决）

`DATABASE_URL` / `PORT` / `REDIS_URL` / OTel 系列 / `MODEL_PROVIDER` 等——所有包都可能用到的基础设施变量。由 `@opsagent/env` 中央 schema 统一治理。**这是项目已经做对的部分**。

### 第二层：包专属变量（未解决）

`OPSAGENT_ALLOW_DESTRUCTIVE` 只有 workflow-gates 关心，`OPSAGENT_REPO_ROOT` 只有 git-context-tool 关心。把它们塞进中央 schema 会让 schema 膨胀且失去语义聚焦；放在包内又缺乏统一治理。

### 第三层：前端变量（未解决）

`VITE_SENTRY_DSN` / `VITE_ERROR_TRACKING_PROVIDER` / `VITE_APP_VERSION` 等 Vite 特有变量。`web.ts` 已经有 createEnv 的雏形，但 schema 严重不足。

### 真正的张力

> **"每个包自己的环境变量怎么统一？"**

这句话的潜台词是：**TypeScript 的 type 没法跨包聚合**。每个包可以有自己的 `ProcessEnv` 扩展，但 pnpm workspace 的严格隔离让"全局统一类型"在工程上不可行。这不是技术问题，是 monorepo 哲学的选择。

## 4. 业界成熟方案（调研结论）

### Turborepo 立场

> **根 `.env` 是反模式** —— 它造成隐式耦合，让"哪个包依赖哪个变量"变得不清晰；让所有包收到所有变量（安全风险 + 粗粒度缓存失效）。
>
> **把 `.env` 文件放在应用包内**，更贴近应用的运行时行为。这也让每个应用的环境管理更容易，且**防止环境变量在 monorepo 规模扩张时泄漏到其他应用**。
>
> —— [Turborepo SKILL.md](https://github.com/vercel/turborepo/blob/main/skills/turborepo/SKILL.md) / [using-environment-variables](https://turborepo.dev/docs/crafting-your-repository/using-environment-variables)

**Turborepo 推荐模式**：
- 每个**应用包**有自己的 `.env`
- 中央共享用 `globalEnv`（在 `turbo.json` 显式声明）
- 不推荐"中央 schema + 所有包共用"

### Nx 立场

> Nx 按**优先级列表**加载环境变量：`.env.local` > `.env.[target-name]` > `.env`。已加载的变量不会被后续文件覆盖。
>
> —— [Nx define-environment-variables](https://nx.dev/docs/guides/tips-n-tricks/define-environment-variables)

**Nx 推荐模式**：
- 每个 project 可有多个 .env 文件（按 target 区分）
- 加载顺序严格定义
- 不强制 schema，但支持 configuration-level 注入

### t3-env 生态（@t3-oss/env-core，项目已采用）

t3-env 官方文档明确支持**多个独立 schema 并存**：每个包可以用 `createEnv` 做自己的 schema，不要求中央聚合。

### 与 OpsAgent 现状的对比

| 维度 | OpsAgent 现状 | Turborepo 推荐 | 差距 |
|---|---|---|---|
| 中央 schema | ✅ `@opsagent/env` | ❌ 反模式 | **我们走得更远**（t3-env 升级版） |
| 包级 .env | 🟡 散在各处，无 schema | ✅ 每个包有 schema | 差一步 |
| 命名约定 | 🟡 `OPSAGENT_*` 项目级前缀 | ✅ 包级前缀 | 细化即可 |
| 冲突检测 | ❌ 无 | 🟡 显式 globalEnv 声明 | 加 CI 脚本 |

**关键洞察**：Turborepo 说"root .env 是反模式"，但我们的项目已经用 env 包做了 schema 治理——root .env 不是"隐式共享"，而是"显式中央 schema"。这其实是 Turborepo 推荐的 `globalEnv` 显式声明的升级版（带类型 + 校验）。**我们比业界平均水平走得更远**，但下一步该怎么走，业界没有统一答案。

## 5. 演进策略（4 种思路 + 取舍）

### 思路 A：约定前缀（最低成本）

**规则**：
- 跨包复用变量 → 无前缀（`DATABASE_URL` / `PORT`）
- 包专属变量 → 包名短形式前缀（`WG_*` / `AGENT_*` / `BACKEND_*` / `FRONTEND_*`）

**成本**：改几个变量名 + AGENTS.md 加约定（5 分钟）
**防护力**：中等（靠纪律，但名字本身自文档化）
**适合**：当前阶段（项目还小，5-6 个包）

### 思路 B：中央保留名注册表

在 `@opsagent/env` 加 `reserved.ts` 列出所有被占用的名字，每个包写测试断言不占用保留名。

**成本**：写注册表 + 每个包加测试（一次性 ~1 小时）
**防护力**：高（CI 跑测试就抓到冲突）
**适合**：团队 ≥ 3 人 或 包数量 ≥ 10 时

### 思路 C：Per-Package Schema 聚合

每个包建 `src/env.ts` 导出 schema，中央 `@opsagent/env` 启动时聚合所有 schema 做统一校验。

**成本**：每个包加 `env.ts` + 改造 env 包聚合逻辑（较大 ~1 天）
**防护力**：最高（编译期 + 运行时双重校验）
**缺点**：破坏包的独立性——env 包变成所有包的依赖者，循环依赖风险

### 思路 D：接受现状 + 文档（"笨办法"）

在包的 `.env.example` 里写注释："请不要用 PORT / DATABASE_URL，已被中央占用"。

**成本**：0
**防护力**：低（靠人读文档，会腐烂）
**适合**：项目极小（≤ 3 个包）或 solo 开发

### 思路 E（混合）：A + B + D 组合

- **起步 A**：约定前缀（5 分钟落地）
- **演进 B**：注册表 + 测试（团队扩张时）
- **辅以 D**：`.env.example` 顶部加结构化注释（永久）

**当前推荐 E**，因为项目还小，过度工程 ROI 不高。

## 6. 静默冲突的真实风险

env 名字冲突是**静默 bug**，没有任何 TypeScript / zod 能提前抓到，因为 `process.env` 是全局字符串字典。

**典型案例**：
- 开发者 A 在 `apps/backend/.env` 写 `PORT=8000`
- 开发者 B 在 `apps/agent/.env` 也写 `PORT=9000`
- pnpm workspace 让两个 .env 都加载到 process.env
- 谁后加载谁赢（取决于 env 包的加载顺序）
- 没人知道冲突发生，直到某个包的端口行为异常

**为什么文档治不了**：
1. 文档会腐烂（开发者 B 没读 A 的 .env）
2. 没有运行时反馈（冲突发生没人知道）

**必须把"希望"升级为"机制"**：命名约定（思路 A）或注册表测试（思路 B）。

## 7. 面试表达（3 个层次）

### Level 1：识别问题（初级）

> "Monorepo 里环境变量治理是个真实问题。我做过代码审查，发现 5 处 process.env 绕过中央 schema 直接读取的情况——其中 3 处是历史遗留（变量已经在 schema 里但代码没用 env 对象），2 处是包专属变量。"

### Level 2：行业对比（中级）

> "Turborepo 官方把 root .env 列为反模式，因为造成隐式耦合和安全风险。Nx 走的是优先级加载路线（.env.local > .env.target > .env）。我们用 t3-env 做的中央 schema 实际上比这两家都激进——我们做到了类型化 + 校验 + 中央治理，是 Turborepo 推荐的 `globalEnv` 显式声明的升级版。"

### Level 3：架构取舍（高级）

> "中央 schema 在 monorepo 规模扩张时会遇到天花板。包专属变量（如 workflow-gates 的 OPSAGENT_ALLOW_DESTRUCTIVE）塞进中央 schema 会让 schema 膨胀且失去语义聚焦；放在包内又缺乏统一治理。我们的演进策略是：短期用命名约定（WG_ / AGENT_ / BACKEND_ 前缀），中期加 CI 冲突检测脚本，长期（包数量 ≥ 10 时）评估是否把中央 env 包降级为'只负责跨包共享变量'。这是一个'按阶段让系统稳定演进'的典型案例——好的架构不是一开始就做成最漂亮，而是在每个阶段有清晰的'何时升级'触发条件。"

### 加分句

> "我们没有急着落地任何一个方案，因为项目还小，过度工程 ROI 不高。这种'识别问题但不立即解决，而是建立清晰的演进路径'的能力，比单纯'解决问题'更重要。"

## 8. 待决策点（未来按需触发）

| 触发条件 | 动作 |
|---|---|
| 首次出现 env 名字冲突 | 启动思路 B（注册表 + 测试） |
| 团队扩张到 ≥ 3 人 | 启动思路 B |
| 包数量 ≥ 10 | 评估思路 C（per-package schema 聚合） |
| 中央 env 包 schema > 50 个 key | 评估思路 C 或拆分中央 schema |
| M5 之前 | 完成思路 A（命名约定）+ client schema 补全 |
| **团队有成员具备 monorepo env 重构经验** | **跳过渐进演进，直接采用 Turborepo 模式**（详见 §9） |

## 9. 来自真实项目的洞察（项目维护者经验）

> 本节由项目维护者基于**前东家项目组真实实践**补充。这部分洞察比纯理论调研更有说服力，因为已经过生产环境验证。

### 9.1 核心洞察：中央 .env 的价值被高估了

> "我之前的项目组就是这么干的。而且确实总包的 .env 里面的变量就是一个共享变量，也没什么用。"

这句话戳到了当前设计的一个盲点：**我们项目的中央 `.env` 里那 15 个变量，严格说全是"基础设施共享变量"**——它们不是"中央业务配置"，而是"所有包都恰好需要的基础设施连接信息"。

### 9.2 三种变量的本质区别

| 类型 | 例子 | 该在哪 |
|---|---|---|
| **基础设施共享** | DB 连接、Redis、OTel endpoint | 中央（每个包都读） |
| **业务配置** | `MODEL_PROVIDER`、`CLOUD_MODEL` | 应用级（只有 `apps/agent` 用） |
| **包专属开关** | `WG_ALLOW_DESTRUCTIVE` | 包内（只有 `workflow-gates` 用） |

**当前设计问题**：我们把"业务配置"和"包专属开关"都塞进了中央 schema，违背了 Turborepo 的"显式共享"原则。比如 `MODEL_PROVIDER` 其实只有 `apps/agent` 真正消费，但被放在了中央 env 里——这让 schema 看起来"什么都管"，实际语义聚焦不够。

### 9.3 如果重新设计：Turborepo 模式的具体落地

```
.env 分布：
├── .env                          # 只剩基础设施共享（~5 个）
│                                  # DATABASE_URL / REDIS_URL / CORS_ORIGIN
│                                  # OTel endpoint / NODE_ENV
├── apps/backend/.env             # backend 专属（PORT / BACKEND_*）
├── apps/agent/.env               # agent 专属（MODEL_PROVIDER / AGENT_*）
├── apps/frontend/.env            # frontend 专属（VITE_*）
└── packages/workflow-gates/.env  # 包专属（WG_*）

@opsagent/env 的 schema 拆分：
├── src/shared.ts    # 基础设施共享 schema（精简到 ~5 个）
├── src/server.ts    # 后端 server schema（PORT / CORS 相关）
├── src/agent.ts     # agent schema（MODEL_* / 工具 endpoint）
├── src/client.ts    # frontend schema（VITE_*）
└── src/index.ts     # 导出所有子 schema
```

**每个包只导入自己关心的子 schema**：

```typescript
// apps/agent/src/index.ts
import { sharedEnv, agentEnv } from "@opsagent/env";

sharedEnv.DATABASE_URL;   // ✅ 基础设施共享
agentEnv.MODEL_PROVIDER;  // ✅ agent 专属
// serverEnv.PORT;        // ❌ 编译期就拦下来（agent 不该看 backend 的 PORT）
```

### 9.4 这种设计的 4 个好处

1. **语义聚焦**：每个 schema 只描述"我这个包真正关心的变量"，不会让 agent 包看到 `PORT`、frontend 包看到 `DATABASE_URL`
2. **类型隔离**：跨包越界访问在**编译期**就拦下来（不是运行时才发现）
3. **加载优化**：每个包只加载自己需要的 schema，不需要把所有 zod schema 都实例化
4. **符合 Turborepo 最佳实践**：root .env 精简为纯基础设施，业务变量下沉到应用包

### 9.5 与"渐进演进"策略的关系

之前的 §5 推荐"思路 E（A + B + D 组合）"作为演进路径——这是**假设团队没有经验、从零摸索**的保守策略。

但如果团队已经有成员具备 monorepo env 重构的**真实项目经验**（如项目维护者），就可以**跳过渐进演进，直接采用 Turborepo 模式**。理由：

- 经验已经验证过方案的可行性（不是纸上谈兵）
- 演进路径的"触发条件"本质上是为了**降低风险**——有经验背书，风险可控
- 一次性到位的重构成本 < 多次渐进演进的累积成本（在团队有经验的前提下）

## 10. 面试表达升级版（含真实项目经验）

> "我们调研了 Turborepo / Nx / t3-env 三家对 monorepo env 治理的最佳实践，发现 Turborepo 官方明确把 root .env 列为反模式。更重要的是，**我之前的项目组就是这么干的**——中央 .env 里只有基础设施共享变量（DB / Redis / OTel），业务变量全部下沉到应用包的 .env。
>
> 我们当前项目的设计是把所有变量塞进中央 schema（用 t3-env 做类型化 + 校验），这比业界平均水平走得更远，但也遇到了'中央 schema 膨胀 + 包专属变量无处安放'的天花板。
>
> 如果重新设计，我会直接采用 Turborepo 模式：中央 .env 精简到 ~5 个基础设施变量，中央 schema 拆成 shared / server / agent / client 四个子 schema，每个包只导入自己关心的子 schema，跨包越界访问在编译期就拦下来。这种设计同时做到了'显式共享'（Turborepo 推荐）+ '类型隔离'（TypeScript 强项）+ '语义聚焦'（工程可读性）。"

**加分句**：
> "这种'调研业界方案 + 结合真实项目经验 + 给出重新设计方案'的思考过程，比单纯'落地某个方案'更能体现架构师的能力。"

## 反向引用

暂无（这是第一篇 `docs/lessons/` 文档）
