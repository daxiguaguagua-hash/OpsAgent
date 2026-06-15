# Analysis Pipeline 整合实战（2026-06-12 会话）

**分支**：`m3`
**会话目标**：将 `apps/backend` 的 mock 分析服务整合到 `apps/agent` 的 Mastra Agent Pipeline，实现 DeepSeek 驱动的端到端 Incident Report 生成。
**工具链**：Qoder CLI CN + Qwen（本次 MVP 开发环境）

---

## 1. 背景：为什么要改

`apps/backend/src/business/analysis.ts` 存在严重架构断裂：

| 问题 | 说明 |
|---|---|
| 两套系统未整合 | `apps/agent` 有完整的 Mastra Agent + 4 个观测工具 + LLM 能力，backend 完全没用上 |
| 重复实现 | backend 手写 `createHttpEvidenceCollector` 裸调 Prometheus/Loki，agent 已有封装好的 tools |
| Mock 占位 | `createMockReportRenderer` 输出固定模板，`AnalysisProvider` 接口声明但从未实现 |
| Schema 分裂 | agent 有完整 `IncidentReportSchema`，backend 只有扁平 `AnalysisResponse` |

## 2. 改动文件清单

| 文件 | 操作 | 说明 |
|---|---|---|
| `apps/agent/src/analysis-pipeline.ts` | 新增 | Mastra Agent 分析管道 + Markdown 渲染器 + preamble 清理 |
| `apps/agent/src/lib.ts` | 新增 | Library 入口，导出 pipeline + constants + schema |
| `apps/agent/src/cli.ts` | 新增 | CLI 入口（从 index.ts 拆出） |
| `apps/agent/src/index.ts` | 重写 | 改为 `export * from "./lib.js"`，去除 CLI 副作用 |
| `apps/agent/package.json` | 修改 | main → lib.ts，scripts 引用 cli.ts |
| `apps/backend/src/business/analysis.ts` | 重写 | 240 行 → 30 行薄代理 |
| `apps/backend/src/business/analysis.test.ts` | 重写 | 测试新架构 |
| `apps/backend/package.json` | 修改 | 添加 `@opsagent/agent: workspace:*` |
| `apps/backend/.env` | 修改 | 移除 `MODEL_PROVIDER=mock` 覆盖 |
| `docs/issues/M3-17-analysis-pipeline-integration.md` | 新增 | 设计文档 |

## 3. 踩坑记录

### 坑 1：DeepSeek 不支持 tools + structuredOutput 并发

**现象**：`agent.generate()` 抛 `Structured output validation failed: expected object, received undefined`，耗时 12 秒。

**根因**：Mastra 的 `structuredOutput` 依赖模型的 function calling 能力来强制输出 JSON Schema。DeepSeek 的 `deepseek-chat` 不支持同时使用 tools + structured output。

**Mastra 文档原文**：

> When your model doesn't support tools and structured output together, you have three options:
> 1. `jsonPromptInjection: true`
> 2. Use a separate structuring model
> 3. Use `prepareStep`

**尝试过的方案**：
- `jsonPromptInjection: true` → 仍然失败，DeepSeek 不严格遵循 JSON 格式
- separate structuring model → 需要额外 OpenAI API key，暂未采用

**最终方案**：去掉 `structuredOutput`，让 agent 直接输出 Markdown 报告。前端只渲染 `markdown` 字段，不需要结构化 JSON。

### 坑 2：`apps/backend/.env` 覆盖了 `MODEL_PROVIDER`

**现象**：agent 独立运行 (`pnpm dev:agent`) 时 provider 正确读到 `deepseek`，但 backend 调 pipeline 时 provider 变成了 `mock`。

**根因**：dotenvx 加载顺序 `../../.env`（根目录，`MODEL_PROVIDER=deepseek`）→ `.env`（backend 本地，`MODEL_PROVIDER=mock`），后者覆盖了前者。

**修复**：删除 `apps/backend/.env` 中的 `MODEL_PROVIDER=mock`。

### 坑 3：Agent 把 maxSteps 全花在 tool 重试上

**现象**：agent 跑了 10 步全在调 tools（包括重试失败的查询），`response.text` 只有 128 chars 的思考片段，没有最终报告。

**修复**：
1. `maxSteps` 从 10 提到 15
2. 在 instructions 里明确"每个工具最多调用一次，不要重试失败的查询"

### 坑 4：`response.text` 混了 agent 的思考文本

**现象**：`response.text` 开头是 agent 的"我来采集系统状态数据..."，不是报告正文。

**修复**：正则裁剪到第一个 `#` 或 `---` 开头的行：

```typescript
const reportStart = markdown.search(/^(# |---)/m);
if (reportStart > 0) {
  markdown = markdown.slice(reportStart);
}
```

### 坑 5：CLI 与 Library 入口冲突

**现象**：`index.ts` 原来有 `main()` 副作用，backend import 时会触发 CLI 执行。

**修复**：`index.ts` 改为纯 library re-export，CLI 逻辑移至 `cli.ts`。

## 4. 最终验证结果

```
provider: deepseek
length: 3813 chars
has preamble: False
has mock: False
耗时: 37 秒
```

DeepSeek 完整执行了：
1. Prometheus 查询 → 拿到 5xx 错误率、P99 延迟
2. Loki 查询 → 拿到 ERROR 日志 + traceId
3. Tempo trace 查询 → 拿到 span 树
4. Git context 查询 → 拿到近期提交
5. 综合分析 → 输出含摘要/证据/根因/建议/审核五段式 Incident Report

## 5. 测试数据

```
@opsagent/agent: 120 pass / 0 fail
backend:         103 pass / 0 fail
pnpm check-types: 全量通过（7 packages）
```

## 6. 架构变更图

```
Before（断裂）:
  Frontend → Backend ──fetch──→ Prometheus/Loki
                  └──→ mock 模板渲染

After（整合）:
  Frontend → Backend → Agent Pipeline (Mastra)
                           ├── Prometheus tool → Prometheus:9090
                           ├── Loki tool → Loki:3100
                           ├── Tempo tool → Tempo:3200
                           ├── Git tool → 本地 git log
                           ├── DeepSeek LLM → 根因分析
                           └── Markdown 渲染 + preamble 清理
                  ←── AnalysisResponse (incidentId + markdown + provider)
```

## 7. 后续可优化方向

- **流式输出**：Mastra 支持 streaming，前端可 SSE 逐步展示分析过程
- **separate structuring model**：用 OpenAI 做结构化输出，恢复 `IncidentReport` schema 校验
- **GBrain RAG 整合**：分析时检索历史 incident 知识库，增强根因分析
- **Agent HTTP 服务**：将 agent 独立部署为 HTTP 服务，backend 通过 HTTP 调用
- **错误降级策略**：LLM 超时时降级到模板渲染（而非当前的 mock 空报告）

## 8. 关键代码片段

### Pipeline 核心逻辑 (`analysis-pipeline.ts`)

```typescript
export function createAnalysisPipeline(config: AnalysisPipelineConfig = {}): AnalysisPipeline {
  const modelConfig = config.modelConfig ?? getModelConfigFromEnv();
  const model = config.model ?? createModel(modelConfig);
  const tools = config.tools ?? createDefaultTools();

  const agent = createOpsAgent({ model, tools: toToolsRecord(tools) });

  return {
    generate: async () => {
      const response = await agent.generate(prompt, {
        instructions: ANALYSIS_INSTRUCTIONS,
        maxSteps: 15,
      });
      let markdown = response.text;
      // 裁剪 agent 思考文本
      const reportStart = markdown.search(/^(# |---)/m);
      if (reportStart > 0) markdown = markdown.slice(reportStart);
      return { incidentId, markdown, generatedAt, provider: modelConfig.provider };
    },
  };
}
```

### Backend 薄代理 (`analysis.ts`)

```typescript
export function createDefaultAnalysisService(
  pipeline: AnalysisPipeline = createDefaultAnalysisPipeline(),
): AnalysisService {
  return { generate: () => pipeline.generate() };
}
```

## 9. 反思：GBrain 自建层的过度设计

### 现状

项目在 `apps/agent/src/gbrain/` 下自建了一套完整的知识库集成层：

| 文件 | 做了什么 |
|---|---|
| `types.ts` | 自定义 `GBrainClient` / `KnowledgeChunk` 接口 |
| `in-memory-client.ts` | 自己写了关键词匹配搜索引擎（`needle.split(/\s+/)` 算命中率） |
| `sources.yml` | 自己定义了 6 个文档源及权重 |
| `sync.ts` | 自己写了文档同步逻辑 |
| `mcp-server.ts` | 自己写了 MCP JSON-RPC 2.0 服务端 |
| `mcp-tools.ts` | 自己定义了 `search_knowledge` 工具 |

### 问题

**这是在"重新发明一个简化版 GBrain"。** GBrain 本身已经是一个成熟工具——有索引、有搜索、有 MCP server。开发者日常在 CLI 中直接调用 `gbrain search "查询"` 或通过 MCP 协议自动集成，两行代码就够了。

更关键的是：**当前 analysis pipeline 根本没用到这些代码。** DeepSeek agent 调的是 Prometheus/Loki/Tempo/Git 四个 tools，没有调 `search_knowledge`。6 个文件目前是摆设。

### 正确做法

如果 agent 运行时需要检索历史知识，直接调 GBrain CLI：

```typescript
import { execSync } from "node:child_process";

const result = execSync(`gbrain search "${query}" --json`).toString();
const chunks: KnowledgeChunk[] = JSON.parse(result);
```

不需要自建搜索引擎、不需要自建 MCP server、不需要自定义接口。

### 行动项

- [ ] 删除 `in-memory-client.ts` / `mcp-server.ts` / `types.ts` 自建层
- [ ] Agent 如需搜索知识库，直接 shell 调 GBrain CLI
- [ ] 保留 `sources.yml` 和 `sync.ts`（这两个是数据配置，不是重复实现）

## 10. 待办：Ollama Embedding 升级语义搜索

### 当前搜索质量

`InMemoryGBrainClient.scoreChunk()` 是纯关键词匹配：

```typescript
const terms = needle.split(/\s+/).filter(Boolean);
const hits = terms.filter((t) => hay.includes(t)).length;
return (hits / terms.length) * weight;
```

中文分词不准（`"故障排查"` 不会被正确拆分），搜索质量差。

### 升级方案

本地 Ollama 已有 embedding 模型（如 `nomic-embed-text`、`mxbai-embed-large`），可升级为向量语义搜索：

1. **sync 时**：对每个 `KnowledgeChunk` 调 `ollama embed` 生成向量
2. **search 时**：对 query 也 embed 一次，算余弦相似度
3. **存储**：内存数组或 SQLite（数据量小，不需要专业向量数据库）

### 前提

先完成第 9 节的精简（删掉自建层，直接用 GBrain CLI），再考虑是否需要自建搜索。如果 GBrain CLI 本身支持 embedding 搜索，则完全不需要自建。
