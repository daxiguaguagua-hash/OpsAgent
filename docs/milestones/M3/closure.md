# M3 完工报告（2026-06-11 会话）

**分支**：`m3`
**最新提交**：`1855138 docs: M3 全 16 卡 task-breakdown SHA 回填`
**会话目标**：从 M3-05 起一口气推完 M3 全部剩余卡片，形成 Mastra Agent 分析闭环。

---

## 1. 本次会话完工的卡片（12 张）

| 卡 | 关键产出 | 提交 |
|---|---|---|
| M3-05 Loki Tool | `loki-tool.ts` + 11 条单测，`LOKI_URL` env，`/loki/api/v1/query_range`，unix 纳秒时间戳 | `309012d` |
| M3-06 Trace Tool | `trace-tool.ts` + 8 条单测，base64→hex spanId，`INVALID_TRACE_ID` / `TRACE_NOT_FOUND` 错误码 | `5cba6e0` |
| M3-08 Incident Report 模板 | `docs/templates/incident-report.md` + JSON Schema + zod 校验 + 8 条单测 | `52187b7` |
| M3-09 前端展示 AI 分析 | `AnalysisReport.tsx` + `analysisApi.ts` + 5 条单测，`react-markdown` + `remark-gfm` | `0020590` |
| M3-10 Incident Lifecycle 字段 | `INCIDENT_PHASE/SEVERITY/MITIGATION_STATUS` + `lifecycle.ts` + 10 条单测 | `ed70cba` |
| M3-11 Knowledge Base 整理 | `docs/{architecture,decisions,knowledge,archive}/README.md`，`workflow-v2-*` 归档 | `cdbadd1` |
| M3-12 GBrain Sources | `sources.yml` + `InMemoryGBrainClient` + `sync.ts` + 10 条单测，`yaml` 依赖 | `ce039c5` |
| M3-13 GBrain MCP Server | `mcp-server.ts` + `mcp-tools.ts` + `.qoder/mcp.json` + 9 条单测，JSON-RPC 2.0 | `b8f2f3f` |
| M3-14 Context Assembler | `context-assembler.ts` + 8 条单测，task/knowledge/code 三源合并 + 双截断 | `3b724ec` |
| M3-15 Knowledge Writer | `knowledge-writer.ts` + 10 条单测，taskId 白名单 + ADR/incident 人工审核门禁 | `710ac97` |
| M3-16 RAG Evaluation | `questions.json`（21 条中文）+ `run-eval.ts` + `citation-audit.ts` + 7 条单测 | `d770a64` |

加上会前已完工的 M3-01/02/03/04/07（`23ee4ad` / `775cc55` / `23ee4ad` / `c490ea8` / `fd50103`），**M3 全 16 张卡全部 `done`**。

## 2. 测试结果

会话结束时全量 `tsx --test 'src/**/*.test.ts' 'gbrain/**/*.test.ts'`：

- agent：**120/120 pass**（40 suites）
- 其他包（env/shared/workflow-gates/backend/frontend/db/ui）保持原有通过率
- 完整 `./node_modules/.bin/turbo run check-types test` 跑过多次，无回归

## 3. 关键文件入口速查

| 位置 | 作用 |
|---|---|
| `apps/agent/src/tools/{prometheus,loki,trace,git-context}-tool.ts` | 四个 Mastra Tool，注入式 deps |
| `apps/agent/src/tools/constants.ts` | `PROMETHEUS_TOOL` / `LOKI_TOOL` / `TRACE_TOOL` / `GIT_CONTEXT_TOOL` |
| `apps/agent/src/report/{lifecycle,incident-report-schema}.ts` | 生命周期 + 报告 zod schema |
| `apps/agent/src/rag/{context-assembler,knowledge-writer,citation-audit}.ts` | RAG 三件套 |
| `apps/agent/src/rag/eval/{questions.json,run-eval.ts}` | 命中率评估 + 中文问题集 |
| `apps/agent/gbrain/{sources.yml,sources.ts,in-memory-client.ts,mcp-*.ts}` | GBrain 抽象层 |
| `apps/frontend/src/components/AnalysisReport.tsx` | 前端报告展示（react-markdown） |
| `apps/frontend/src/lib/analysisApi.ts` | `POST /api/analysis` 客户端 |
| `.qoder/mcp.json` | GBrain MCP Server 注册 |
| `docs/templates/incident-report.{md,schema.json}` | 报告模板 + JSON Schema |

## 4. 已知遗留 / 待决策

| 项 | 说明 |
|---|---|
| **GBrain 真实后端** | 当前 `InMemoryGBrainClient` 用本地文件索引 + 关键词评分 mock。pgvector 接入需要真实 GBrain 服务，未在本次会话落地 |
| **`POST /api/analysis` 后端接口** | 前端已接好按钮与 loading/error/success 态，但 backend 尚未实现该端点（返回 404）。下一步需要：backend 新增路由 → 调 Mastra Agent → 调四个 Tool → 走 `assembleContext` → 让 LLM 生成 markdown → 校验 IncidentReportSchema |
| **`pnpm gbrain:sync`** | CLI 已就绪，但 `InMemoryGBrainClient` 不持久化索引；未来接 pgvector 时需要扩展 |
| **`pnpm gbrain:mcp`** | `.qoder/mcp.json` 注册的命令入口未写；需要在 `apps/agent/package.json` 加 `gbrain:mcp` script，并写 `gbrain/mcp-stdio.ts` 包装 stdio transport |
| **M2-milestone-acceptance.md** | 已修复归档路径引用，但其他文档的链接审计未全覆盖 |
| **git-context-tool 集成测试** | 上一会话遗留决策点（A/B/C/D），仍未拍板 |

## 5. M4 入口建议（Source Map 前端源码定位）

按 `docs/task-breakdown.md` §8 顺序：

1. M4-01 前端生产构建生成 Source Map
2. M4-02 Source Map 不公开暴露
3. M4-03 接入 Sentry 前端 SDK
4. M4-04 配置 Release 与私有 Source Map 上传
5. M4-05 Breadcrumbs 与环境上下文
6. M4-06 增加 MinIO 私有存储
7. M4-07 实现简化 symbolication
8. M4-08 对比 Sentry 与自研反解流程
9. M4-09 Agent 结合源码给建议
10. M4-10 前端接入 OTel Web SDK

## 6. 常用命令回顾

```bash
./node_modules/.bin/turbo run check-types test          # 全量回归
pnpm --filter @opsagent/agent test                      # agent 单包
pnpm --filter frontend test                             # 前端单测
pnpm --filter backend test                              # 后端单测
pnpm --filter @opsagent/agent gbrain:sync               # GBrain 同步（mock）
cd apps/frontend && pnpm dev                            # 前端 dev :3001
cd apps/backend && pnpm dev                             # 后端 dev :8000
```

## 7. 踩坑记录（供新会话参考）

1. **`pnpm install` 时 `2>&1 |` 会被 shell 误解析**：`2` 被当成 pnpm 位置参数，注入成 `"2": "^3.0.0"` 依赖。已修复。
2. **`Edit` 工具读文件状态敏感**：若同一文件刚被 `sed` / `Bash` 修改，需先 `Read` 重新加载再 `Edit`，否则报 "File has been modified since read"。
3. **`tsx --test` 默认 cwd 继承**：用 `npx tsx --test` 前必须 `cd` 到正确目录或用绝对路径。
4. **zod v4**：`z.record(z.string())` 已被弃用，必须 `z.record(z.string(), z.string())`。
5. **token 估算**：`Math.ceil(text.length / 4)` 在中文场景偏乐观，`assembleContext` 的 `maxTokens` 需要实测调校（本次用 `x.repeat(3000) + maxTokens=753` 才精确截断）。
6. **M3-09 按钮在 dist 中可 grep 到 "AI 分析"**，是 react-markdown 体积较大的警示（chunk 581KB）。

## 8. 下一步一句话

> M3 已闭环。下一步建议：**先实现 `POST /api/analysis` 把 Mastra Agent 与前端接起来跑通一次真实 Incident Report**，再进入 M4 Source Map。或者先决策 git-context-tool 集成测试方案（见上一会话 `docs/devlog/2026-06-11-git-context-tool-integration-testing.md`）。

---

## 9. 同会话追加：`POST /api/analysis` 真实落地（提交 `52d9f0e`）

原本列在"已知遗留"的 `POST /api/analysis` 已在本次会话追加完工。

### 9.1 交付物

| 文件 | 作用 |
|---|---|
| `apps/backend/src/business/analysis.ts` | `createAnalysisService` + `createHttpEvidenceCollector` + `createMockReportRenderer` + `AnalysisResponseSchema` |
| `apps/backend/src/business/analysis.test.ts` | 12 条单测：ID 生成、模板渲染、schema 校验、HTTP collector 命中/5xx/异常降级 |
| `apps/backend/src/http/constants.ts` | 新增 `HTTP_ROUTE.ANALYSIS = "/api/analysis"` + `API_ERROR_CODE.ANALYSIS_FAILED` |
| `apps/backend/src/app.ts` | 注册 `POST /api/analysis`，依赖注入 `AnalysisService`，失败时 503 |

### 9.2 顺手重构：agent gbrain 移入 src/

`apps/agent/tsconfig.json` 的 `rootDir: src` 与 `gbrain/` 平级冲突（TS6059）。整体 git mv 到 `apps/agent/src/gbrain/`，连带修复：

- `src/rag/{citation-audit,context-assembler,context-assembler.test,eval.test}.ts` 的相对导入
- `src/gbrain/in-memory-client.ts` 的 `readdirSync` 加 `{ withFileTypes: false }` 修 TS2345
- `apps/agent/package.json` 的 `test` 脚本（去掉 `'gbrain/**/*.test.ts'` glob，因为现在被 `src/**/*.test.ts` 覆盖）+ `gbrain:sync` 脚本路径

### 9.3 端到端验收证据

```bash
$ curl -X POST http://localhost:8000/api/demo/fail-500  # 触发 3 次
$ sleep 20
$ curl -X POST http://localhost:8000/api/analysis
HTTP 201
{
  "incidentId": "20260611-795",
  "markdown": "... Loki 命中 3 条 ERROR 日志，每条带 traceId ...",
  "provider": "mock"
}
```

- Loki 真实命中：`{"level":"ERROR","traceId":"1d8d6ba5cb310cb1ee8c6e70c5f823c0","method":"POST","route":"/api/demo/fail-500","statusCode":500,...}`
- Prometheus 查询 `sum(rate(http_requests_total{status_code=~"5.."}[5m]))` 返回 `no data`（rate 需要 ≥2 采样点，演示窗口内不足；已知可接受）
- Tempo / Git 证据占位（mock provider 未接）

### 9.4 剩余遗留

1. **真实 LLM 接入**：当前 `provider=mock` 只渲染证据原文；下一步把 Mastra `Agent.generate()` 接入 `createAnalysisService`。
2. **Tempo trace 证据**：`createHttpEvidenceCollector` 未调 Tempo；可在生成 incidentId 时同步查最近 N 条 traceId。
3. **Git 源码证据**：可调用 `createGitContextTool` 取受影响文件的最近 commit。
4. **backend app.test.ts 集成测试**：未覆盖 `POST /api/analysis`，留给下个会话。

### 9.5 测试结果

`./node_modules/.bin/turbo run check-types test`：**12/12 任务通过**

- backend：103/103（新增 12 条 analysis 测试）
- agent：120/120（gbrain move 后全绿）
- frontend/env/shared/db/workflow-gates/ui：保持原状
