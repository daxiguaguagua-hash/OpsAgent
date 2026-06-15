import { AlertTriangle, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { Button } from "@opsagent/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@opsagent/ui/components/card";

import type { AnalysisResponseDto } from "@/lib/analysisApi";

export type AnalysisState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "success"; report: AnalysisResponseDto };

export function AnalysisReport({
  state,
  onRetry,
}: {
  state: AnalysisState;
  onRetry?: () => void;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b">
        <CardTitle className="text-base">AI Incident Report（AI 故障报告）</CardTitle>
        <CardDescription>
          {state.kind === "idle" && "点击「AI 分析」让 Agent 汇总指标、日志、链路与源码上下文。"}
          {state.kind === "loading" && "Agent 正在查询数据并生成报告，请稍候…"}
          {state.kind === "error" && "生成失败，请检查 Agent 是否在线后重试。"}
          {state.kind === "success" &&
            `Incident ${state.report.incidentId} · ${new Date(
              state.report.generatedAt,
            ).toLocaleString()} · provider ${state.report.provider}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {state.kind === "idle" && (
          <div className="flex min-h-48 flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
            <p className="text-sm">尚未生成报告</p>
            <p className="text-xs">触发故障后点击「AI 分析」。</p>
          </div>
        )}

        {state.kind === "loading" && (
          <div className="flex min-h-48 items-center justify-center gap-2 p-6 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            <span className="text-sm">generating…</span>
          </div>
        )}

        {state.kind === "error" && (
          <div className="flex min-h-48 flex-col items-center justify-center gap-3 p-6 text-center">
            <AlertTriangle className="size-5 text-red-600" />
            <p className="max-w-md text-sm text-red-600">{state.message}</p>
            {onRetry && (
              <Button size="sm" variant="outline" onClick={onRetry}>
                重试
              </Button>
            )}
          </div>
        )}

        {state.kind === "success" && (
          <article className="prose prose-sm dark:prose-invert max-w-none p-6">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {state.report.markdown}
            </ReactMarkdown>
          </article>
        )}
      </CardContent>
    </Card>
  );
}
