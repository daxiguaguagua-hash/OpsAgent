import { Button } from "@opsagent/ui/components/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@opsagent/ui/components/card";
import { env } from "@opsagent/env/web";
import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  Database,
  Flame,
  Loader2,
  Server,
  TerminalSquare,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { AnalysisReport, type AnalysisState } from "@/components/AnalysisReport";
import {
  requestAnalysis,
  type AnalysisResponseDto,
} from "@/lib/analysisApi";

import {
  EXECUTION_STATUS,
  FRONTEND_ERROR,
  OPS_SCENARIO,
  type ExecutionStatus,
  type OpsScenario,
  UI_CONFIG,
} from "@/lib/constants";
import {
  createOrder,
  getOrderHealth,
  OpsApiError,
  triggerBackendFailure,
  triggerSlowRequest,
} from "@/lib/opsApi";

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

interface ExecutionEvent {
  id: string;
  scenario: OpsScenario;
  title: string;
  status: ExecutionStatus;
  durationMs: number;
  detail: string;
  occurredAt: string;
}

const SCENARIO_DEFINITION = [
  {
    id: OPS_SCENARIO.CREATE_ORDER,
    title: "正常订单",
    description: "写入 PostgreSQL 并返回新订单",
    buttonLabel: "创建订单",
    icon: Database,
    variant: "default" as const,
  },
  {
    id: OPS_SCENARIO.FAIL_500,
    title: "Backend 500（后端异常）",
    description: "触发稳定错误码并保留服务进程",
    buttonLabel: "触发 500",
    icon: Flame,
    variant: "destructive" as const,
  },
  {
    id: OPS_SCENARIO.SLOW,
    title: "Slow request（慢请求）",
    description: "制造超过 2 秒的响应延迟",
    buttonLabel: "触发慢请求",
    icon: Clock3,
    variant: "secondary" as const,
  },
  {
    id: OPS_SCENARIO.FRONTEND_ERROR,
    title: "Frontend error（前端异常）",
    description: "抛出并捕获浏览器端演示异常",
    buttonLabel: "触发前端异常",
    icon: TerminalSquare,
    variant: "outline" as const,
  },
] as const;

function HomeComponent() {
  const [events, setEvents] = useState<ExecutionEvent[]>([]);
  const [activeScenario, setActiveScenario] = useState<OpsScenario>();
  const [health, setHealth] = useState<{
    database: string;
    cache: string;
    orderCount: number;
  }>();
  const [analysis, setAnalysis] = useState<AnalysisState>({ kind: "idle" });

  const refreshHealth = useCallback(async () => {
    try {
      const result = await getOrderHealth(env.VITE_SERVER_URL);
      setHealth({
        database: result.services.database,
        cache: result.services.cache,
        orderCount: result.orderCount,
      });
    } catch {
      setHealth(undefined);
    }
  }, []);

  async function runAnalysis() {
    setAnalysis({ kind: "loading" });
    try {
      const report: AnalysisResponseDto = await requestAnalysis(
        env.VITE_SERVER_URL,
      );
      setAnalysis({ kind: "success", report });
      toast.success(`Incident ${report.incidentId} 已生成`);
    } catch (error) {
      const message =
        error instanceof OpsApiError
          ? `${error.code} · HTTP ${error.status} · ${error.message}`
          : error instanceof Error
            ? error.message
            : "未知错误";
      setAnalysis({ kind: "error", message });
      toast.error(`AI 分析失败：${message}`);
    }
  }

  useEffect(() => {
    void refreshHealth();
  }, [refreshHealth]);

  async function executeScenario(scenario: OpsScenario) {
    const definition = SCENARIO_DEFINITION.find((item) => item.id === scenario);

    if (!definition) {
      return;
    }

    setActiveScenario(scenario);
    const startedAt = performance.now();

    try {
      let detail = "";

      switch (scenario) {
        case OPS_SCENARIO.CREATE_ORDER: {
          const result = await createOrder(
            env.VITE_SERVER_URL,
            {
              customerName: UI_CONFIG.DEFAULT_ORDER_CUSTOMER,
              totalCents: UI_CONFIG.DEFAULT_ORDER_TOTAL_CENTS,
            },
          );
          detail = `${result.order.reference} · $${(result.order.totalCents / 100).toFixed(2)}`;
          await refreshHealth();
          break;
        }
        case OPS_SCENARIO.FAIL_500:
          await triggerBackendFailure(env.VITE_SERVER_URL);
          break;
        case OPS_SCENARIO.SLOW: {
          const result = await triggerSlowRequest(env.VITE_SERVER_URL);
          detail = `Configured ${result.configuredDelayMs} ms`;
          break;
        }
        case OPS_SCENARIO.FRONTEND_ERROR: {
          try {
            throw new Error(FRONTEND_ERROR.MESSAGE);
          } catch (error) {
            window.dispatchEvent(new ErrorEvent(FRONTEND_ERROR.EVENT_TYPE, {
              error,
              message: FRONTEND_ERROR.MESSAGE,
            }));
            throw error;
          }
        }
      }

      addEvent({
        scenario,
        title: definition.title,
        status: EXECUTION_STATUS.SUCCESS,
        durationMs: performance.now() - startedAt,
        detail: detail || "Request completed",
      });
      toast.success(`${definition.title} completed`);
    } catch (error) {
      const detail = error instanceof OpsApiError
        ? `${error.code} · HTTP ${error.status}`
        : error instanceof Error
          ? error.message
          : "Unknown error";
      addEvent({
        scenario,
        title: definition.title,
        status: EXECUTION_STATUS.FAILURE,
        durationMs: performance.now() - startedAt,
        detail,
      });
      toast.error(`${definition.title}: ${detail}`);
    } finally {
      setActiveScenario(undefined);
    }
  }

  function addEvent(
    event: Omit<ExecutionEvent, "id" | "occurredAt">,
  ) {
    const nextEvent: ExecutionEvent = {
      ...event,
      id: crypto.randomUUID(),
      occurredAt: new Date().toLocaleTimeString(),
    };
    setEvents((current) => (
      [nextEvent, ...current].slice(0, UI_CONFIG.MAX_EVENTS)
    ));
  }

  return (
    <main className="h-full overflow-auto bg-muted/30">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6">
        <section className="grid gap-4 border-b pb-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="mb-2 flex items-center gap-2 text-xs font-medium uppercase text-muted-foreground">
              <Activity className="size-3.5" />
              M1 · Minimum business system（最小业务系统）
            </p>
            <h1 className="text-2xl font-semibold tracking-normal sm:text-3xl">
              Failure Control（故障控制台）
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              触发真实业务请求和受控故障，为后续日志、指标、链路追踪与 AI 分析提供事件入口。
            </p>
          </div>
          <div className="grid min-w-64 grid-cols-3 border bg-background text-xs">
            <StatusCell
              label="PostgreSQL"
              value={health?.database ?? "offline"}
              healthy={health?.database === "connected"}
            />
            <StatusCell
              label="Redis"
              value={health?.cache ?? "offline"}
              healthy={health?.cache === "connected"}
            />
            <StatusCell
              label="Orders"
              value={String(health?.orderCount ?? 0)}
              healthy={Boolean(health)}
            />
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold">Scenario launcher（场景启动器）</h2>
              <p className="text-xs text-muted-foreground">每次只执行一个场景，结果写入下方事件流。</p>
            </div>
            <Button
              aria-label="Refresh health"
              onClick={() => void refreshHealth()}
              size="sm"
              variant="ghost"
            >
              <Server />
              刷新状态
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {SCENARIO_DEFINITION.map((scenario) => {
              const Icon = scenario.icon;
              const isRunning = activeScenario === scenario.id;

              return (
                <Card key={scenario.id} className="min-h-44 justify-between">
                  <CardHeader>
                    <div className="mb-2 flex size-8 items-center justify-center border bg-muted">
                      <Icon className="size-4" />
                    </div>
                    <CardTitle>{scenario.title}</CardTitle>
                    <CardDescription>{scenario.description}</CardDescription>
                  </CardHeader>
                  <CardFooter>
                    <Button
                      className="w-full"
                      disabled={Boolean(activeScenario)}
                      onClick={() => void executeScenario(scenario.id)}
                      variant={scenario.variant}
                    >
                      {isRunning
                        ? <Loader2 className="animate-spin" />
                        : <Icon />}
                      {isRunning ? "执行中" : scenario.buttonLabel}
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold">AI Analysis（AI 分析）</h2>
              <p className="text-xs text-muted-foreground">
                Agent 汇总 Prometheus / Loki / Tempo / Git 证据后生成 Incident Report。
              </p>
            </div>
            <Button
              disabled={analysis.kind === "loading"}
              onClick={() => void runAnalysis()}
              size="sm"
              variant="default"
            >
              {analysis.kind === "loading"
                ? <Loader2 className="animate-spin" />
                : <BrainCircuit />}
              {analysis.kind === "loading" ? "生成中…" : "AI 分析"}
            </Button>
          </div>
          <AnalysisReport
            state={analysis}
            onRetry={() => void runAnalysis()}
          />
        </section>

        <section className="min-h-64 border bg-background">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">Event stream（事件流）</h2>
              <p className="text-xs text-muted-foreground">最近 {UI_CONFIG.MAX_EVENTS} 次人工触发记录</p>
            </div>
            <span className="font-mono text-xs text-muted-foreground">
              {events.length} events
            </span>
          </div>
          {events.length === 0
            ? (
                <div className="flex min-h-48 flex-col items-center justify-center gap-2 px-4 text-center text-muted-foreground">
                  <AlertTriangle className="size-5" />
                  <p className="text-sm">尚未触发故障场景</p>
                  <p className="text-xs">从上方选择一个入口开始演示。</p>
                </div>
              )
            : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-160 text-left text-xs">
                    <thead className="bg-muted/60 text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2 font-medium">Status</th>
                        <th className="px-4 py-2 font-medium">Scenario</th>
                        <th className="px-4 py-2 font-medium">Result</th>
                        <th className="px-4 py-2 font-medium">Duration</th>
                        <th className="px-4 py-2 font-medium">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {events.map((event) => (
                        <tr key={event.id} className="border-t">
                          <td className="px-4 py-3">
                            <EventStatus status={event.status} />
                          </td>
                          <td className="px-4 py-3 font-medium">{event.title}</td>
                          <td className="max-w-96 truncate px-4 py-3 font-mono text-muted-foreground">
                            {event.detail}
                          </td>
                          <td className="px-4 py-3 font-mono">
                            {Math.round(event.durationMs)} ms
                          </td>
                          <td className="px-4 py-3 font-mono text-muted-foreground">
                            {event.occurredAt}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
        </section>
      </div>
    </main>
  );
}

function StatusCell({
  label,
  value,
  healthy,
}: {
  label: string;
  value: string;
  healthy: boolean;
}) {
  return (
    <div className="border-r px-3 py-2 last:border-r-0">
      <div className="mb-1 flex items-center gap-1.5 text-muted-foreground">
        <span className={`size-1.5 ${healthy ? "bg-emerald-500" : "bg-red-500"}`} />
        {label}
      </div>
      <div className="truncate font-mono">{value}</div>
    </div>
  );
}

function EventStatus({ status }: { status: ExecutionStatus }) {
  const succeeded = status === EXECUTION_STATUS.SUCCESS;

  return (
    <span className={`inline-flex items-center gap-1.5 font-medium ${
      succeeded ? "text-emerald-600" : "text-red-600"
    }`}>
      {succeeded
        ? <CheckCircle2 className="size-3.5" />
        : <AlertTriangle className="size-3.5" />}
      {status}
    </span>
  );
}
