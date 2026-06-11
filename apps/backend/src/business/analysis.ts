import { env } from "@opsagent/env";
import { z } from "zod";

export interface MetricEvidence {
  query: string;
  result: string;
}

export interface LogEvidence {
  timestamp: string;
  level: string;
  line: string;
}

export interface TraceEvidence {
  traceId: string;
  operation: string;
  durationMs: number;
  status: string;
}

export interface GitEvidence {
  path: string;
  hash: string;
  author: string;
  message: string;
}

export interface EvidenceBundle {
  metrics: MetricEvidence[];
  logs: LogEvidence[];
  traces: TraceEvidence[];
  git: GitEvidence[];
  warnings: string[];
}

export interface AnalysisResponse {
  incidentId: string;
  markdown: string;
  generatedAt: string;
  provider: string;
}

export const AnalysisResponseSchema = z.object({
  incidentId: z.string().regex(/^[0-9]{8}-[0-9]{3}$/),
  markdown: z.string().min(20),
  generatedAt: z.string(),
  provider: z.string(),
});

export interface EvidenceCollector {
  collect(): Promise<EvidenceBundle>;
}

export interface ReportRenderer {
  render(incidentId: string, evidence: EvidenceBundle): string;
}

export interface AnalysisProvider {
  generate(evidence: EvidenceBundle): Promise<AnalysisResponse>;
}

export interface AnalysisServiceDeps {
  collector: EvidenceCollector;
  renderer: ReportRenderer;
  now?: () => Date;
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

export function createAnalysisService(
  deps: AnalysisServiceDeps,
): { generate: () => Promise<AnalysisResponse> } {
  return {
    generate: async () => {
      const now = deps.now ? deps.now() : new Date();
      const evidence = await deps.collector.collect();
      const incidentId = generateIncidentId(now);
      const markdown = deps.renderer.render(incidentId, evidence);
      const response: AnalysisResponse = {
        incidentId,
        markdown,
        generatedAt: now.toISOString(),
        provider: "mock",
      };
      AnalysisResponseSchema.parse(response);
      return response;
    },
  };
}

export function createHttpEvidenceCollector(
  fetcher: typeof fetch = fetch,
): EvidenceCollector {
  return {
    collect: async () => {
      const warnings: string[] = [];
      const metrics: MetricEvidence[] = [];
      const logs: LogEvidence[] = [];
      const traces: TraceEvidence[] = [];
      const git: GitEvidence[] = [];

      try {
        const url = new URL("/api/v1/query", env.PROMETHEUS_URL);
        url.searchParams.set(
          "query",
          'sum(rate(http_requests_total{status_code=~"5.."}[5m]))',
        );
        const res = await fetcher(url.toString());
        if (res.ok) {
          const body = (await res.json()) as {
            data?: { result?: Array<{ value?: [number, string] }> };
          };
          const value = body.data?.result?.[0]?.value?.[1];
          metrics.push({
            query: 'sum(rate(http_requests_total{status_code=~"5.."}[5m]))',
            result: value ?? "no data",
          });
        } else {
          warnings.push(`prometheus returned ${res.status}`);
        }
      } catch (error) {
        warnings.push(
          `prometheus: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      try {
        const end = new Date();
        const start = new Date(end.getTime() - 60 * 60 * 1000);
        const url = new URL("/loki/api/v1/query_range", env.LOKI_URL);
        url.searchParams.set("query", '{job="opsagent-backend"} | json | level="ERROR"');
        url.searchParams.set("start", (start.getTime() * 1_000_000).toString());
        url.searchParams.set("end", (end.getTime() * 1_000_000).toString());
        url.searchParams.set("limit", "5");
        const res = await fetcher(url.toString());
        if (res.ok) {
          const body = (await res.json()) as {
            data?: {
              result?: Array<{
                stream?: Record<string, string>;
                values?: Array<[string, string]>;
              }>;
            };
          };
          for (const stream of body.data?.result ?? []) {
            for (const [nano, line] of stream.values ?? []) {
              const ms = Number(BigInt(nano) / 1_000_000n);
              logs.push({
                timestamp: new Date(ms).toISOString(),
                level: stream.stream?.level ?? stream.stream?.detected_level ?? "ERROR",
                line,
              });
            }
          }
        } else {
          warnings.push(`loki returned ${res.status}`);
        }
      } catch (error) {
        warnings.push(
          `loki: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      return { metrics, logs, traces, git, warnings };
    },
  };
}

export function createMockReportRenderer(): ReportRenderer {
  return {
    render: (incidentId, evidence) => {
      const metricLines =
        evidence.metrics
          .map((m) => `- \`${m.query}\` → \`${m.result}\``)
          .join("\n") || "- （无指标数据）";
      const logLines =
        evidence.logs
          .map((l) => `- \`${l.timestamp}\` [${l.level}] ${l.line.slice(0, 200)}`)
          .join("\n") || "- （无错误日志）";
      const warnings =
        evidence.warnings.length > 0
          ? `\n> ⚠️ 采集警告：${evidence.warnings.join("；")}\n`
          : "";
      return [
        `# Incident Report: ${incidentId}`,
        "",
        "## 1. 摘要",
        `- **Incident ID**：${incidentId}`,
        `- **发现时间**：${new Date().toISOString()}`,
        `- **当前阶段**：detected`,
        `- **影响范围**：backend /api/*`,
        `- **严重等级**：P1`,
        `- **缓解状态**：unmitigated`,
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
        "- （mock provider 暂未接入链路证据）",
        "",
        "### 2.4 源码上下文（Git）",
        "- （mock provider 暂未接入源码证据）",
        warnings,
        "",
        "## 3. 根因分析",
        "（mock provider：待 LLM 生成）",
        "",
        "## 4. 建议",
        "- **短期缓解**：检查后端错误日志与 5xx 速率。",
        "- **长期修复**：结合 Loki 日志与 Tempo 链路定位根因。",
        "- **预防改进**：完善 SLO 与告警。",
        "",
        "## 5. 人类审核",
        "- [ ] 审核人：",
        "- [ ] 审核结论：adopted / partially_adopted / rejected",
        "- [ ] 审核意见：",
        "",
      ].join("\n");
    },
  };
}

export function createDefaultAnalysisService() {
  return createAnalysisService({
    collector: createHttpEvidenceCollector(),
    renderer: createMockReportRenderer(),
  });
}
