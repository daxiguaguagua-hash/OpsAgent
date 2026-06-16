import type { Tool } from "@mastra/core/tools";
import { createOpsAgent } from "./agents/index.js";
import {
  INCIDENT_MITIGATION_STATUS,
  INCIDENT_PHASE,
  INCIDENT_SEVERITY,
} from "./constants.js";
import {
  createModel,
  getModelConfigFromEnv,
  type ModelConfig,
} from "./model-provider.js";
import {
  type IncidentReport,
} from "./report/incident-report-schema.js";
import {
  createGitContextTool,
  createGlitchtipTool,
  createLokiTool,
  createPrometheusTool,
  createSentryTool,
  createTraceTool,
} from "./tools/index.js";

export interface AnalysisPipelineConfig {
  model?: any;
  modelConfig?: ModelConfig;
  tools?: Tool[];
  now?: () => Date;
}

export interface AnalysisPipeline {
  generate(): Promise<{
    incidentId: string;
    markdown: string;
    generatedAt: string;
    provider: string;
  }>;
}

const ANALYSIS_INSTRUCTIONS = `你是一个 AI 运维分析代理。你的职责是：

1. 使用可用工具采集可观测性证据：
   - **prometheus**：查询指标（5xx 错误率、延迟、请求量）
   - **loki**：查询错误日志（近 1 小时的 ERROR 级别日志）
   - **trace**：通过 traceId 查询链路追踪
   - **git-context**：查询近期源码变更
   - **glitchtip**（**前端错误首选**）：传入 issueId，返回 issue 元信息 +
     最新 event 的 symbolicated stacktrace。每个 frame 的 filename 是已经
     规范化过的源码路径（如 src/routes/index.tsx），lineNo 是源码行号，
     **contextLine 是那一行的真实源代码**，context 是前后若干行的源码窗口。
     在报告的"前端错误"章节里**直接引用 contextLine 和上下文代码**，不要
     只写 "filename:lineNo"，要让读者看到你看到的那行代码。
   - **sentry**：备用前端错误源（仅当 glitchtip 查不到或没有 issueId 时使用）。
     返回的 stacktrace 不带源码上下文，需要再调 git-context 才能看到代码。

2. 前端错误分析的标准流程：
   a. 先用 glitchtip 列出最近 unresolved issues（如果 glitchtip 支持 list 模式，
      否则先用 loki 日志或 sentry list 拿到 issueId）。
   b. 对每个关注的 issueId 调 glitchtip 拿完整 stacktrace + 源码上下文。
   c. 在报告中，每个前端错误列出：Issue 标题 + symbolicated 文件名:行号 +
      contextLine 原文 + 周边 3-5 行 context + 影响的 issue 数量。
   d. 如果想知道"哪个 commit 可能引入这个 bug"，再用 git-context 查该文件的近期提交。

3. 基于证据进行根因分析，输出 Markdown 格式的 Incident Report。

重要规则：
- 每个工具最多调用一次，不要重试失败的查询
- 采集完一轮证据后，立即生成 Markdown 格式的报告
- 报告必须以 "# Incident Report" 开头
- 报告包含六个章节：摘要、证据（指标/日志/链路/前端错误/源码）、根因分析、建议、人类审核
- **前端错误章节必须引用 glitchtip 返回的 contextLine / context 原文**，
  不要自己编造文件名或行号（尤其不要猜 "Checkout.tsx" 这种仓库里不存在的文件）
- 如果某个工具查询失败或返回空数据，在报告中注明并继续分析其他证据
- 中文输出`;

const MOCK_ROOT_CAUSE =
  "当前为 mock 模式，未执行真实 LLM 分析。请配置 MODEL_PROVIDER 环境变量（openai / deepseek / alibaba）以启用智能分析。";

const MOCK_RECOMMENDATION =
  "请配置真实 LLM provider 以获取有效建议。当前为 mock 模式，仅提供占位文本。";

function toToolsRecord(tools: Tool[]): Record<string, Tool> {
  const record: Record<string, Tool> = {};
  for (const tool of tools) {
    record[tool.id] = tool;
  }
  return record;
}

export function generateIncidentId(date: Date): string {
  const y = date.getUTCFullYear().toString();
  const m = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const d = date.getUTCDate().toString().padStart(2, "0");
  const seq = (date.getUTCHours() * 60 + date.getUTCMinutes())
    .toString()
    .padStart(3, "0")
    .slice(-3);
  return `${y}${m}${d}-${seq}`;
}

export function createDefaultTools(): Tool[] {
  return [
    createPrometheusTool(),
    createLokiTool(),
    createTraceTool(),
    createGitContextTool(),
    createSentryTool(),
    createGlitchtipTool(),
  ];
}

function createMockReport(
  incidentId: string,
  now: Date,
): IncidentReport {
  return {
    incidentId,
    summary: {
      detectedAt: now.toISOString(),
      phase: INCIDENT_PHASE.DETECTED,
      impact: "backend /api/*",
      severity: INCIDENT_SEVERITY.P1,
      mitigationStatus: INCIDENT_MITIGATION_STATUS.UNMITIGATED,
    },
    evidence: {
      metrics: [],
      logs: { query: "", entries: [], traceIds: [] },
      traces: [],
      gitContext: [],
    },
    rootCause: MOCK_ROOT_CAUSE,
    recommendations: {
      shortTerm: MOCK_RECOMMENDATION,
      longTerm: MOCK_RECOMMENDATION,
      prevention: MOCK_RECOMMENDATION,
    },
    review: {
      reviewer: "",
      conclusion: "adopted",
      comments: "",
    },
  };
}

export function renderIncidentMarkdown(report: IncidentReport): string {
  const { summary, evidence, rootCause, recommendations } = report;

  const metricLines =
    evidence.metrics
      .map((m) => `- \`${m.query}\` → ${m.conclusion}`)
      .join("\n") || "- （无指标数据）";

  const logLines =
    evidence.logs.entries
      .map(
        (l) =>
          `- \`${l.timestamp}\` [${l.detectedLevel ?? "ERROR"}] ${l.line.slice(0, 200)}`,
      )
      .join("\n") || "- （无错误日志）";

  const traceLines =
    evidence.traces
      .map((t) => {
        const spanSummary = t.spans
          .map(
            (s) =>
            `  - ${s.operationName} (${s.serviceName}) ${s.durationMs}ms [${s.status}]`,
          )
          .join("\n");
        return `- traceId: \`${t.traceId}\` root=${t.rootService} ${t.durationMs}ms\n${spanSummary}`;
      })
      .join("\n") || "- （无链路数据）";

  const gitLines =
    evidence.gitContext
      .map((g) => {
        const commits = g.recentCommits
          .map((c) => `  - \`${c.hash.slice(0, 7)}\` ${c.message}`)
          .join("\n");
        return `- path: \`${g.path}\`\n${commits}`;
      })
      .join("\n") || "- （无源码上下文）";

  return [
    `# Incident Report: ${report.incidentId}`,
    "",
    "## 1. 摘要",
    `- **Incident ID**：${report.incidentId}`,
    `- **发现时间**：${summary.detectedAt}`,
    `- **当前阶段**：${summary.phase}`,
    `- **影响范围**：${summary.impact}`,
    `- **严重等级**：${summary.severity}`,
    `- **缓解状态**：${summary.mitigationStatus}`,
    "",
    "## 2. 证据",
    "",
    "### 2.1 指标（Prometheus）",
    metricLines,
    "",
    "### 2.2 日志（Loki）",
    logLines,
    "",
    "### 2.3 链路（Tempo）",
    traceLines,
    "",
    "### 2.4 源码上下文（Git）",
    gitLines,
    "",
    "## 3. 根因分析",
    rootCause,
    "",
    "## 4. 建议",
    `- **短期缓解**：${recommendations.shortTerm}`,
    `- **长期修复**：${recommendations.longTerm}`,
    `- **预防改进**：${recommendations.prevention}`,
    "",
    "## 5. 人类审核",
    "- [ ] 审核人：",
    "- [ ] 审核结论：adopted / partially_adopted / rejected",
    "- [ ] 审核意见：",
    "",
  ].join("\n");
}

export function createAnalysisPipeline(
  config: AnalysisPipelineConfig = {},
): AnalysisPipeline {
  const modelConfig = config.modelConfig ?? getModelConfigFromEnv();
  const model = config.model ?? createModel(modelConfig);
  const tools = config.tools ?? createDefaultTools();
  const now = config.now ?? (() => new Date());

  const agent = createOpsAgent({
    model,
    tools: toToolsRecord(tools),
  });

  return {
    generate: async () => {
      const currentDate = now();
      const incidentId = generateIncidentId(currentDate);

      let markdown: string;
      try {
        const response = await agent.generate(
          `请分析当前系统状态并生成 Incident Report。Incident ID: ${incidentId}。请直接输出 Markdown 格式的报告，包含摘要、证据、根因分析、建议、人类审核五个章节。`,
          {
            instructions: ANALYSIS_INSTRUCTIONS,
            maxSteps: 15,
          },
        );
        markdown = response.text;
        const reportStart = markdown.search(/^(# |---)/m);
        if (reportStart > 0) {
          markdown = markdown.slice(reportStart);
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        console.error(
          `[AnalysisPipeline] agent.generate failed (provider=${modelConfig.provider}), falling back to mock report: ${message}`,
        );
        const report = createMockReport(incidentId, currentDate);
        markdown = renderIncidentMarkdown(report);
      }

      return {
        incidentId,
        markdown,
        generatedAt: currentDate.toISOString(),
        provider: modelConfig.provider,
      };
    },
  };
}

export function createDefaultAnalysisPipeline(): AnalysisPipeline {
  const modelConfig = getModelConfigFromEnv();
  const model = createModel(modelConfig);
  const tools = createDefaultTools();
  return createAnalysisPipeline({ model, modelConfig, tools });
}
