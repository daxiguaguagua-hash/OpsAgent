# OpsAgent 测试规范

本文档定义 OpsAgent 项目的测试编写规范和最佳实践。

## 1. 测试框架选择

项目使用 **Node.js 原生 test runner**（`node:test`），配合 **tsx** 执行 TypeScript 测试文件。

**优势：**
- 零配置，无需 Jest/Vitest 等额外依赖
- Node.js 24 原生支持，性能优秀
- 与项目技术栈一致（TypeScript + ESM）

## 2. 测试文件组织

### 2.1 文件命名和位置

```
src/
  feature.ts              # 源代码
  feature.test.ts         # 对应测试文件（同级目录）
```

**规则：**
- 测试文件与被测代码放在同一目录
- 命名格式：`<源文件名>.test.ts`
- 每个模块一个测试文件，避免巨型测试文件

**示例结构：**
```
apps/agent/src/
  model-provider.ts       # 模型 Provider 实现
  model-provider.test.ts  # 模型 Provider 测试
  agents/
    index.ts              # Agent 工厂
    index.test.ts         # Agent 工厂测试
```

### 2.2 测试文件头部注释

每个测试文件必须以中文注释开头，说明测试范围：

```typescript
/**
 * model-provider.ts 单元测试
 *
 * 覆盖范围：
 * - createModel：openai/mock provider 创建
 * - getModelConfigFromEnv：环境变量解析和默认值
 * - Mock model：doGenerate 和 doStream 接口
 *
 * 运行方式：pnpm --filter @opsagent/agent exec tsx --test src/model-provider.test.ts
 */
```

## 3. 测试编写规范

### 3.1 导入约定

```typescript
import assert from "node:assert/strict";
import { describe, test } from "node:test";

// 被测模块
import { createModel } from "./model-provider.js";
```

**规则：**
- 使用 `node:assert/strict` 严格模式
- 使用 `describe` 分组，`test` 定义用例
- 导入路径使用 `.js` 扩展名（ESM 规范）

### 3.2 测试分组（describe）

按功能模块分组，每组聚焦一个职责：

```typescript
describe("createModel - 模型 Provider 工厂", () => {
  test("mock provider 返回可用的 mock 模型对象", () => {
    // ...
  });

  test("unknown provider 抛出错误", () => {
    // ...
  });
});

describe("getModelConfigFromEnv - 环境变量解析", () => {
  test("返回当前环境下的配置", () => {
    // ...
  });
});
```

**命名规范：**
- describe 标题：`<函数名> - <功能描述>`
- 使用中文描述，清晰表达测试意图

### 3.3 测试用例（test）

**命名格式：**
- 正向场景：`<条件> 返回/应 <预期结果>`
- 异常场景：`<条件> 抛出/应 <预期错误>`

**示例：**
```typescript
test("mock provider 返回可用的 mock 模型对象", () => {
  const config: ModelConfig = {
    provider: "mock",
    modelName: "mock-model",
  };

  const model = createModel(config);

  assert.ok(model, "mock 模型应被创建");
  assert.equal(model.provider, "mock", "provider 应为 mock");
});

test("unknown provider 抛出错误", () => {
  const config: ModelConfig = {
    provider: "unknown" as any,
    modelName: "test",
  };

  assert.throws(
    () => createModel(config),
    /Unknown model provider: unknown/,
    "未知 provider 应抛出错误",
  );
});
```

### 3.4 断言规范

**优先使用的断言：**
- `assert.ok(value, message)` - 验证真值
- `assert.equal(actual, expected, message)` - 严格相等
- `assert.throws(fn, expected, message)` - 验证异常
- `assert.doesNotThrow(fn, message)` - 验证不抛异常

**规则：**
- 每个断言必须提供中文消息
- 消息格式：`<主体> 应 <预期行为>`
- 避免裸断言（无消息）

**❌ 错误示例：**
```typescript
assert.ok(model);
assert.equal(model.provider, "mock");
```

**✅ 正确示例：**
```typescript
assert.ok(model, "mock 模型应被创建");
assert.equal(model.provider, "mock", "provider 应为 mock");
```

### 3.5 异步测试

异步函数直接返回 Promise，test runner 自动处理：

```typescript
test("mock 模型的 doGenerate 返回标准响应格式", async () => {
  const model = createModel({ provider: "mock", modelName: "mock-model" });
  const result = await model.doGenerate({
    inputFormat: "prompt",
    prompt: [{ role: "user", content: [{ type: "text", text: "test" }] }],
  });

  assert.ok(result.content, "响应应包含 content");
  assert.equal(result.finishReason, "stop", "finishReason 应为 stop");
});
```

**规则：**
- 使用 `async/await`，不要 `.then()`
- 不需要调用 `done()` 回调

### 3.6 测试夹具（Fixtures）

复杂数据抽取为常量：

```typescript
/* ── 测试夹具 ─────────────────────────────────────── */

const FIXTURE_ORDER: Order = {
  id: 1,
  reference: "order-test",
  customerName: "Test Customer",
  status: "pending",
  totalCents: 2500,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};
```

**规则：**
- 夹具常量以 `FIXTURE_` 前缀命名
- 放在测试文件顶部，注释分隔
- 复用率高的夹具抽取到 `src/test/fixtures.ts`

## 4. 测试运行

### 4.1 单个包测试

```bash
pnpm --filter @opsagent/agent test
pnpm --filter backend test
pnpm --filter frontend test
```

### 4.2 单个测试文件

```bash
pnpm --filter @opsagent/agent exec tsx --test src/model-provider.test.ts
```

### 4.3 全量测试

```bash
# 暂时不支持 turbo test（配置问题），逐个包运行
pnpm --filter backend test && \
pnpm --filter frontend test && \
pnpm --filter @opsagent/agent test && \
pnpm --filter @opsagent/env test && \
pnpm --filter @opsagent/workflow-gates test
```

## 5. 测试覆盖率目标

| 包 | 当前测试数 | 目标覆盖率 | 说明 |
|---|---:|---:|---|
| backend | 91 | 80%+ | 核心业务逻辑 + 可观测性中间件 |
| frontend | 2 | 60%+ | API 客户端封装 |
| agent | 10 | 70%+ | 模型 Provider + Agent 工厂 |
| env | 18 | 90%+ | 环境变量解析（关键基础设施） |
| workflow-gates | 28 | 85%+ | 工作流门禁（关键治理逻辑） |

**优先级：**
1. P0：env、workflow-gates（基础设施，影响全局）
2. P1：backend（业务核心）
3. P2：agent、frontend（上层应用）

## 6. 常见陷阱

### 6.1 环境变量测试

**问题：** `process.env` 在模块导入时就被固定，动态修改无效。

**❌ 错误示例：**
```typescript
process.env.MODEL_PROVIDER = "openai";
const config = getModelConfigFromEnv(); // 仍读取旧值
```

**✅ 正确做法：**
- 测试当前环境的实际值
- 或者重构代码，让 `getModelConfigFromEnv` 接受可选参数

### 6.2 .ts 导入扩展名

**问题：** TypeScript ESM 要求导入用 `.js` 扩展名，但 `--experimental-strip-types` 无法解析。

**解决方案：**
- 所有包的 test 脚本统一使用 `tsx --test`
- 不要用 `node --experimental-strip-types --test`

### 6.3 第三方库 Mock

**原则：** 不 Mock 第三方库，只测试自己的封装层。

**示例：**
- ✅ 测试 `createModel` 返回的对象结构
- ❌ 不要 Mock Mastra Agent 内部行为

## 7. 测试审查清单

提交 PR 前自检：

- [ ] 测试文件有中文头部注释
- [ ] 每个断言有中文消息
- [ ] describe 分组清晰，每组聚焦一个职责
- [ ] 测试用例命名符合规范（条件 + 预期）
- [ ] 没有裸断言（所有 assert 都有消息）
- [ ] 异步测试使用 async/await
- [ ] 复杂数据抽取为 FIXTURE 常量
- [ ] 本地运行 `pnpm test` 全部通过
- [ ] 新增代码有对应测试（覆盖率不下降）

## 8. 参考示例

**优秀测试文件：**
- `apps/backend/src/observability/logger.test.ts` - 完整覆盖日志系统
- `apps/agent/src/model-provider.test.ts` - 清晰的分组和断言
- `packages/env/src/server.test.ts` - 环境变量测试范例

**避免的反例：**
- 巨型测试文件（>300 行未分组）
- 裸断言（无消息）
- 英文测试描述混杂中文

---

**最后更新：** 2026-06-10
**维护者：** OpsAgent Team
