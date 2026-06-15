# ADR-0003: Zod 只在系统边界做运行时校验

- **日期**：2026-06-10
- **状态**：`accepted`
- **决策者**：项目维护者 + AI agent
- **关联**：
  - [[0001-env-layer-design|ADR-0001]]：env 层使用 zod 做 schema 校验
  - [[AGENTS|AGENTS.md]]：§禁止领域字符串硬编码

## Context

Zod 在 7 个包中声明为依赖，但实际 `import { z } from "zod"` 只出现在 3 个文件中。依赖膨胀的同时，团队对"什么时候该用 zod、什么时候不该用"缺乏一致共识，导致：

- `packages/db` 和 `apps/frontend` 装了 zod 但没用，增加 `node_modules` 体积
- `apps/agent` 和 `packages/api` 装了 zod 但"未来可能用"，决策悬而未决
- `z.enum()` 和 `as const` 对象的重复值问题没有明确处理原则

需要一个审计 + 指南，明确 zod 的使用边界。

## Decision

### 使用边界：zod 的核心价值是"在信任边界做运行时校验 + 类型推导"

#### 该用 zod 的场景（系统边界）

1. **环境变量**（已在用）— 外部字符串 → 类型化配置，需要 `z.coerce`、`z.url()`、`z.enum()`
2. **HTTP 请求输入**（已在用）— 用户请求体不可信，需要运行时校验
3. **tRPC input**（未来）— 新增带参数的 mutation/query 时应使用 `z.object().input()`
4. **外部 JSON 文件解析**（未来）— `readFileSync` + `JSON.parse` 后用 `as T` 强转不安全，应用 zod schema 做运行时校验

#### 不该用 zod 的场景

1. **内部类型定义** — `IncidentReport`、`Evidence` 等 shared 类型是内部接口，不是外部输入
2. **常量定义** — `as const` 对象是编译期概念，不需要运行时校验
3. **数据库 schema** — Drizzle 有自己的类型系统和运行时校验
4. **UI 组件 props** — TypeScript 编译期检查足够，运行时校验过度
5. **函数参数** — 内部函数调用已有 TypeScript 类型保护

### 依赖清理

- `packages/db` 的 zod 依赖在下次依赖清理时移除
- `apps/frontend` 的 zod 依赖在下次依赖清理时移除
- `apps/agent` 和 `packages/api` 属于"未来可能需要"，暂时保留

### `z.enum()` 和 `as const` 对象并存

对于枚举类配置（`MODEL_PROVIDER`、`NODE_ENV`），接受 `z.enum()` 字面量和 `as const` 对象并存。重复的值通过测试护栏（schema 完整性测试）保证一致性，不值得为了消除重复而引入复杂的类型体操。

理论上的解法（先定义 zod 能吃的 `as const` 数组，再从中派生常量对象）会让常量定义被迫迁就 zod 的 API 形状，方向反了。

## Consequences

### 正面

- **职责清晰**：zod 只在系统边界做运行时校验，TypeScript 负责内部类型安全
- **依赖瘦身**：2 个包的 zod 依赖可移除（db、frontend）
- **避免过度工程**：不会为了"类型完美"引入复杂 zod 派生逻辑

### 负面

- **接受重复**：`z.enum()` 字面量和 `as const` 对象的值重复存在，必须靠测试护栏保证一致
- **未来新增 enum 时的纪律成本**：开发者需要记得"两处都改"，否则会出现 schema 和常量不一致

### 风险

- **测试护栏缺失**：目前 env 包有 `ALL_SCHEMA_KEYS` 完整性测试，但 `z.enum()` 值和 `MODEL_PROVIDER` 常量值一致性的测试还没写。如果漏补，重复的值会慢慢漂移

### 个人看法

```ts
const MODEL_PROVIDER = {
  OPENAI: "openai",
  OLLAMA: "ollama",
  MOCK: "mock",
} as const;

z.enum(["openai", "ollama", "mock"]);
```

- 意思就是这三个字符串："openai", "ollama", "mock"，被用了两次，这已经违背了设计初衷了。
  所以使用z.enum(Object.values(MODEL_PROVIDER) as const)来统一，但是这种写法有些委屈zod的enum了，它是要做运行时校验的。

## 反向引用

- [[0001-env-layer-design|ADR-0001]]：在 Consequences §风险 提到 `z.enum()` 和 `as const` 的张力
