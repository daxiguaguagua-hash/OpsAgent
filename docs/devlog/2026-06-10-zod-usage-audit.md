# Zod 使用审计

日期：2026-06-10

## 现状

zod 在 7 个包中声明为依赖，但实际 `import { z } from "zod"` 只出现在 3 个文件中。

### 实际使用（3 处）

| 文件 | 用途 | 评价 |
|---|---|---|
| `packages/env/src/server.ts` | 服务端环境变量校验 | ✅ 最佳场景 |
| `packages/env/src/web.ts` | 前端环境变量校验 | ✅ 最佳场景 |
| `apps/backend/src/business/orders.ts` | HTTP API 输入校验 | ✅ 最佳场景 |

### 声明但未使用（4 个包）

| 包 | 评估 |
|---|---|
| `apps/agent` | 目前无外部输入需要校验。未来 agent 接收 HTTP 请求或解析配置文件时可能需要 |
| `packages/api` | tRPC 路由目前只有无参 `healthCheck`。未来新增带 `.input()` 的 mutation/query 时需要 |
| `packages/db` | Drizzle ORM 自带 schema 类型系统，不需要额外 zod |
| `apps/frontend` | 消费端，服务端已校验，前端不需要重复校验 |

## 该用 zod 的场景（系统边界）

zod 的核心价值：**在信任边界做运行时校验 + 类型推导**。

1. **环境变量**（已在用）— 外部字符串 → 类型化配置，需要 `z.coerce`、`z.url()`、`z.enum()`
2. **HTTP 请求输入**（已在用）— 用户请求体不可信，需要运行时校验
3. **tRPC input**（未用）— 未来新增带参数的 mutation/query 时应使用 `z.object().input()`
4. **外部 JSON 文件解析**（未用）— `readFileSync` + `JSON.parse` 后用 `as T` 强转不安全，应用 zod schema 做运行时校验

## 不该用 zod 的场景

1. **内部类型定义** — `IncidentReport`、`Evidence` 等 shared 类型是内部接口，不是外部输入
2. **常量定义** — `as const` 对象是编译期概念，不需要运行时校验
3. **数据库 schema** — Drizzle 有自己的类型系统和运行时校验
4. **UI 组件 props** — TypeScript 编译期检查足够，运行时校验过度
5. **函数参数** — 内部函数调用已有 TypeScript 类型保护

## 当前 zod 使用中的问题

### `z.enum()` 和 `as const` 对象的天然张力

```typescript
// server.ts 第 29 行
MODEL_PROVIDER: z.enum(["openai", "ollama", "mock"]).default("mock"),
```

这三个值和 `MODEL_PROVIDER` 常量对象的值完全一样，但 zod 的 `z.enum()` 要求**字符串数组字面量**（`[string, ...string[]]`），不能直接接收 `Object.values(MODEL_PROVIDER)` 的返回值——TypeScript 会把数组类型拓宽为 `string[]`，丢失字面量信息。

理论上的解法：
```typescript
const PROVIDER_VALUES = ["openai", "ollama", "mock"] as const;
z.enum(PROVIDER_VALUES); // ✅ 保留字面量类型
```
但这意味着要先定义 zod 能吃的数组，再从中派生 `as const` 对象，方向反了——常量定义被迫迁就 zod 的 API 形状。

**结论：** 对于枚举类配置（`MODEL_PROVIDER`、`NODE_ENV`），接受 `z.enum()` 字面量和 `as const` 对象并存。重复的值通过测试护栏（schema 完整性测试）保证一致性，不值得为了消除重复而引入复杂的类型体操。

### 依赖膨胀

7 个包装了 zod，只有 2 个包（env、backend）真正使用。`packages/db` 和 `apps/frontend` 可以安全移除 zod 依赖。`apps/agent` 和 `packages/api` 属于"未来可能需要"，暂时保留。

## 行动项

- [ ] 未来新增 tRPC 带参路由时，使用 `z.object()` 定义 input schema
- [ ] `packages/db` 的 zod 依赖可在下次依赖清理时移除
- [ ] `apps/frontend` 的 zod 依赖可在下次依赖清理时移除
- [ ] 不急于统一 `z.enum()` 和 `as const` 对象，接受并存
