# ADR-0010: GlitchTip 接入走 Bearer token 直连，绕过 OAuth MCP

- **日期**：2026-06-16
- **状态**：`accepted`
- **决策者**：项目维护者 + AI agent
- **关联**：
  - [[0007-glitchtip-as-sentry-fallback|ADR-0007]]：本决策解决 ADR-0007 §后续行动 中"评估替换为 GlitchTip 官方 MCP Server"的 TODO
  - [[0006-sentry-release-sourcemap-strategy|ADR-0006]] §GlitchTip 兼容：与 sourcemap legacy upload 修复属同一链路
  - [[0009-port-allocation-strategy|ADR-0009]]：GlitchTip host 端口已让位到 8001，本决策的 DEFAULT_ENDPOINT 沿用 `http://localhost:8001/api/0`

## Context

ADR-0007 后续行动里留了一个 TODO：

> [ ] 评估：把 Mastra agent 的 M4-09 sentry-tool 替换为 GlitchTip 官方 MCP Server（17 个内置 tools，零维护成本）
> - **2026-06-16 实测**：Qoder CLI MCP 客户端 + GlitchTip OAuth 不兼容（`/mcp` 直返 `invalid_token`，浏览器 OAuth 流程未触发）
> - **当前决策**：暂不替换，sentry-tool 保留作为 Mastra agent 主力

但在 2026-06-16 后续排查中发现 sentry-tool 的实际输出存在两个问题：

1. **`contextLine` 永远是 `undefined`**：sentry-tool 的 `SentryRawFrame.contextLine`（camelCase）与 GlitchTip 服务端实际返回的 `context_line`（snake_case）字段名错位，LLM 拿不到源码上下文。
2. **`filename` 带噪音**：GlitchTip 反解后返回 `../../src/routes/index.tsx?tsr-split=component`，相对前缀让 `git-context-tool` 的 `assertWithinRepo` 抛 `PATH_OUT_OF_REPO`，LLM 看不到 git 历史，只能靠猜 —— 实测幻觉出 `Checkout.tsx`（仓库里根本不存在该文件）。

结果：Incident Report 里前端错误章节的文件名和行号不可信，整条"sourcemap 反解 → agent 拿源码上下文"链路在 LLM 这一环失效。

## Decision

**新增 `apps/agent/src/tools/glitchtip-tool.ts`，绕过 OAuth，直连 GlitchTip REST API**。

### 设计要点

1. **直连 Bearer token，不走 OAuth**：GlitchTip 的 `/api/0/...` REST 端点接受 Bearer token（我们已经在 sentry-tool 里验证过），不需要走 Qoder CLI 那条 OAuth 握手失败的路径。
2. **`id: "glitchtip"` 与 `sentry` 不冲突**：`toToolsRecord()` 以 tool.id 为 key 注册，独立 id 避免覆盖。
3. **字段名双兼容**（snake_case 与 camelCase 都收）：
   - `context_line || contextLine`
   - `lineno || lineNo`
   - `abs_path || absPath`
   - 未来切 Sentry SaaS 无需改代码。
4. **路径规范化**：剥 `../../` 前缀 + `?tsr-split=…` 查询串 + `#…` fragment，输出 `src/routes/index.tsx` 风格的可读路径。
5. **context 窗口统一**：同时支持 GlitchTip 的 `context: [[lineNo, text]]` 数组格式和 Sentry 官方的 `pre_context + context_line + post_context` 三段式。
6. **sentry-tool 保留作为 fallback**：`ANALYSIS_INSTRUCTIONS` 里明确指示 agent 优先调 `glitchtip`，sentry 仅在 glitchtip 不可用时兜底。

### 集成路径

| 文件 | 改动 |
|---|---|
| `apps/agent/src/tools/constants.ts` | 新增 `GLITCHTIP_TOOL`（id/description/endpoints/timeouts/error codes） |
| `apps/agent/src/tools/glitchtip-tool.ts` | 新建：`createGlitchtipTool(deps)` + Zod schema + fetch + 字段规范化 |
| `apps/agent/src/tools/index.ts` | 导出 `createGlitchtipTool` + `GlitchtipDeps` |
| `apps/agent/src/analysis-pipeline.ts` | `createDefaultTools()` 追加 + `ANALYSIS_INSTRUCTIONS` 重写"前端错误分析"章节 |

### 为什么不用 GlitchTip 官方 MCP

| 选项 | 评估 |
|---|---|
| **Qoder CLI + GlitchTip OAuth MCP** | ADR-0007 实测失败（`/mcp` 直返 `invalid_token`） |
| **stdio MCP client 桥接（mcp-remote 之类）** | GlitchTip 官方 MCP 是 HTTP 端点不是 stdio，需额外桥接，多一层复杂度 |
| **Bearer token 直连 REST**（本决策）| 复用现有 `SENTRY_AUTH_TOKEN`，零 OAuth 复杂度，与 sentry-tool 同一架构模式 |

## Consequences

### 正面

- **Incident Report 前端错误章节可信度大幅提升**：`contextLine` + `context` 窗口直接出现在 LLM 输出里，LLM 不再幻觉文件名。
- **跨平台兼容**：同一份 tool 可直连 Sentry SaaS 或 GlitchTip，字段名双兼容。
- **git-context-tool 路径可直达**：规范化后的 `src/routes/index.tsx` 不再触发 `PATH_OUT_OF_REPO`，"用 git-context 查该文件近期 commit" 工作流恢复。
- **OAuth 凭证不进 git、不进 settings**：Bearer token 走 `.env`，与 ADR-0006 的凭证管理约定一致。

### 负面

- **两份前端错误工具并存**（`sentry` + `glitchtip`），agent 必须从 instructions 里学会优先选哪个。
- **只实现了 `issueId` 输入模式**（list 模式暂未实现），agent 想列所有 issues 仍需调 sentry。

### 风险

- **Instructions 措辞需要持续维护**：如果未来调整工具优先级，必须同步更新 `ANALYSIS_INSTRUCTIONS`，否则 agent 行为会漂移。
- **GlitchTip 升级后字段命名可能变化**：双兼容写法能吸收一部分差异，但若 GlitchTip 完全统一到 camelCase（或完全 snake_case），需要再审查一次。

## 反向引用

暂无（首次落地，待后续文档引用时回填）。

## 实施记录（2026-06-16）

- 提交 `b46e08e`：4 文件变更，409 行新增
- 端到端验证：`createGlitchtipTool().execute({ issueId: "5" })` 返回
  - `filename: "src/routes/index.tsx"`（已规范化，无 `../../` 和 `?tsr-split=`）
  - `lineNo: 207`
  - `contextLine: "        title: definition.title,"`
  - `context: [[202,...], ..., [212,...]]`（11 行源码窗口）
- agent 包 137/137 测试全过，`tsc --noEmit` 通过
