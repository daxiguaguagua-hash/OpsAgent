import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { SENTRY_TOOL } from "./constants.js";

export interface SentryDeps {
  endpoint?: string;
  authToken?: string;
  org?: string;
  project?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

interface SentryIssue {
  id: string;
  shortId?: string;
  title?: string;
  culprit?: string;
  count?: string | number;
  userCount?: number;
  firstSeen?: string;
  lastSeen?: string;
  status?: string;
  level?: string;
  platform?: string;
  project?: { slug?: string; name?: string };
}

interface SentryRawFrame {
  filename?: string;
  absPath?: string;
  function?: string;
  lineNo?: number;
  colNo?: number;
  inApp?: boolean;
  module?: string;
  // sourcemap 反解后的源码位置（Sentry/GlitchTip 服务端解析后下发）
  contextLine?: string;
  context?: Array<[number, string]>;
  origLineNo?: number;
  origColNo?: number;
  origFilename?: string;
  origAbsPath?: string;
  origFunction?: string;
}

interface SentryBreadcrumb {
  type?: string;
  category?: string;
  message?: string;
  timestamp?: string | number;
  level?: string;
  data?: Record<string, unknown>;
}

interface SentryEvent {
  id?: string;
  eventID?: string;
  title?: string;
  platform?: string;
  timestamp?: string | number;
  entries?: Array<{
    type: string;
    data?: Record<string, unknown>;
  }>;
  contexts?: Record<string, Record<string, unknown>>;
}

export interface SentryStacktraceFrame {
  filename: string | undefined;
  function: string | undefined;
  lineNo: number | undefined;
  colNo: number | undefined;
  inApp: boolean;
  // sourcemap 反解后的源码位置（可选：服务端未解析时为空）
  contextLine: string | undefined;
  context: Array<[number, string]>;
  origLineNo: number | undefined;
  origColNo: number | undefined;
  origFilename: string | undefined;
  origFunction: string | undefined;
}

export interface SentryBreadcrumbView {
  type: string | undefined;
  category: string | undefined;
  message: string | undefined;
  timestamp: string | undefined;
}

export interface SentryIssueView {
  id: string;
  shortId: string | undefined;
  title: string;
  culprit: string | undefined;
  count: string;
  userCount: number;
  firstSeen: string | undefined;
  lastSeen: string | undefined;
  level: string | undefined;
  platform: string | undefined;
}

export interface SentryEventView {
  issueId: string;
  eventId: string | undefined;
  title: string;
  platform: string | undefined;
  timestamp: string | undefined;
  stacktrace: SentryStacktraceFrame[];
  breadcrumbs: SentryBreadcrumbView[];
  contexts: Record<string, Record<string, unknown>>;
}

export interface SentryListResult {
  status: "success" | "error";
  mode: "list";
  issues: SentryIssueView[];
  error?: string;
}

export interface SentryEventResult {
  status: "success" | "error";
  mode: "event";
  event: SentryEventView | null;
  error?: string;
}

function makeError(code: (typeof SENTRY_TOOL.ERROR)[keyof typeof SENTRY_TOOL.ERROR], message: string): string {
  return `${code}: ${message}`;
}

function readConfig(deps: SentryDeps): {
  endpoint: string;
  authToken: string | undefined;
  org: string | undefined;
  project: string | undefined;
  fetchImpl: typeof fetch;
  timeoutMs: number;
} {
  const rawToken = deps.authToken ?? process.env.SENTRY_AUTH_TOKEN;
  const rawOrg = deps.org ?? process.env.SENTRY_ORG;
  const rawProject = deps.project ?? process.env.SENTRY_PROJECT;
  return {
    endpoint: deps.endpoint ?? process.env.SENTRY_API_ENDPOINT ?? SENTRY_TOOL.DEFAULT_ENDPOINT,
    authToken: rawToken && rawToken.length > 0 ? rawToken : undefined,
    org: rawOrg && rawOrg.length > 0 ? rawOrg : undefined,
    project: rawProject && rawProject.length > 0 ? rawProject : undefined,
    fetchImpl: deps.fetch ?? globalThis.fetch,
    timeoutMs: deps.timeoutMs ?? SENTRY_TOOL.TIMEOUT_MS,
  };
}

function buildIssuesPath(org: string, project: string): string {
  return SENTRY_TOOL.API_PATH.PROJECT_ISSUES.replace("{org}", encodeURIComponent(org)).replace(
    "{project}",
    encodeURIComponent(project),
  );
}

function buildLatestEventPath(issueId: string): string {
  return SENTRY_TOOL.API_PATH.ISSUE_LATEST_EVENT.replace("{issueId}", encodeURIComponent(issueId));
}

function extractStacktrace(event: SentryEvent): SentryStacktraceFrame[] {
  const frames: SentryStacktraceFrame[] = [];

  for (const entry of event.entries ?? []) {
    if (entry.type !== "exception" && entry.type !== "stacktrace") continue;
    const data = entry.data;
    if (!data) continue;

    const candidates: SentryRawFrame[][] = [];
    if (entry.type === "exception" && Array.isArray(data.values)) {
      for (const value of data.values as Array<{ stacktrace?: { frames?: SentryRawFrame[] } }>) {
        if (value?.stacktrace?.frames) candidates.push(value.stacktrace.frames);
      }
    } else if (entry.type === "stacktrace" && data.frames) {
      candidates.push(data.frames as SentryRawFrame[]);
    }

    for (const frameList of candidates) {
      // Sentry 返回的 frames 是"最老的在前"，agent 通常关心最近的调用，反转后截断
      const reversed = [...frameList].reverse();
      for (const frame of reversed.slice(0, SENTRY_TOOL.MAX_STACKTRACE_FRAMES)) {
        frames.push({
          filename: frame.filename ?? frame.absPath,
          function: frame.function,
          lineNo: typeof frame.lineNo === "number" ? frame.lineNo : undefined,
          colNo: typeof frame.colNo === "number" ? frame.colNo : undefined,
          inApp: frame.inApp === true,
          contextLine: typeof frame.contextLine === "string" ? frame.contextLine : undefined,
          context: Array.isArray(frame.context) ? frame.context : [],
          origLineNo: typeof frame.origLineNo === "number" ? frame.origLineNo : undefined,
          origColNo: typeof frame.origColNo === "number" ? frame.origColNo : undefined,
          origFilename: frame.origFilename,
          origFunction: frame.origFunction,
        });
      }
      if (frames.length > 0) break;
    }
    if (frames.length > 0) break;
  }

  return frames;
}

function extractBreadcrumbs(event: SentryEvent): SentryBreadcrumbView[] {
  for (const entry of event.entries ?? []) {
    if (entry.type !== "breadcrumbs") continue;
    const raw = entry.data?.values;
    if (!Array.isArray(raw)) continue;
    const crumbs: SentryBreadcrumbView[] = [];
    const values = raw as SentryBreadcrumb[];
    for (const crumb of values.slice(-SENTRY_TOOL.MAX_BREADCRUMBS)) {
      crumbs.push({
        type: crumb.type,
        category: crumb.category,
        message: crumb.message,
        timestamp:
          typeof crumb.timestamp === "number"
            ? new Date(crumb.timestamp * 1000).toISOString()
            : crumb.timestamp,
      });
    }
    return crumbs;
  }
  return [];
}

function normalizeContexts(
  event: SentryEvent,
): Record<string, Record<string, unknown>> {
  const contexts = event.contexts ?? {};
  const result: Record<string, Record<string, unknown>> = {};
  for (const [key, value] of Object.entries(contexts)) {
    if (value && typeof value === "object") {
      result[key] = value;
    }
  }
  return result;
}

async function request<T>(
  url: string,
  config: {
    fetchImpl: typeof fetch;
    timeoutMs: number;
    authToken: string;
  },
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  let response: Response;
  try {
    response = await config.fetchImpl(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${config.authToken}`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: makeError(SENTRY_TOOL.ERROR.FETCH_FAILED, message) };
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return {
      ok: false,
      error: makeError(
        SENTRY_TOOL.ERROR.FETCH_FAILED,
        `HTTP ${response.status} ${text}`.trim(),
      ),
    };
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: makeError(SENTRY_TOOL.ERROR.INVALID_RESPONSE, message),
    };
  }
  return { ok: true, data: data as T };
}

const issueSchema = z.object({
  status: z.enum(["success", "error"]),
  mode: z.literal("list"),
  issues: z.array(
    z.object({
      id: z.string(),
      shortId: z.string().optional(),
      title: z.string(),
      culprit: z.string().optional(),
      count: z.string(),
      userCount: z.number(),
      firstSeen: z.string().optional(),
      lastSeen: z.string().optional(),
      level: z.string().optional(),
      platform: z.string().optional(),
    }),
  ),
  error: z.string().optional(),
});

const eventSchema = z.object({
  status: z.enum(["success", "error"]),
  mode: z.literal("event"),
  event: z
    .object({
      issueId: z.string(),
      eventId: z.string().optional(),
      title: z.string(),
      platform: z.string().optional(),
      timestamp: z.string().optional(),
      stacktrace: z.array(
        z.object({
          filename: z.string().optional(),
          function: z.string().optional(),
          lineNo: z.number().optional(),
          colNo: z.number().optional(),
          inApp: z.boolean(),
          contextLine: z.string().optional(),
          context: z.array(z.tuple([z.number(), z.string()])),
          origLineNo: z.number().optional(),
          origColNo: z.number().optional(),
          origFilename: z.string().optional(),
          origFunction: z.string().optional(),
        }),
      ),
      breadcrumbs: z.array(
        z.object({
          type: z.string().optional(),
          category: z.string().optional(),
          message: z.string().optional(),
          timestamp: z.string().optional(),
        }),
      ),
      contexts: z.record(z.string(), z.record(z.string(), z.unknown())),
    })
    .nullable(),
  error: z.string().optional(),
});

export function createSentryTool(deps: SentryDeps = {}) {
  const config = readConfig(deps);

  return createTool({
    id: SENTRY_TOOL.ID,
    description: SENTRY_TOOL.DESCRIPTION,
    inputSchema: z.object({
      issueId: z
        .string()
        .min(1)
        .optional()
        .describe("指定查询某个 Issue 的最新 event；不传则列出最近的 Issue"),
      query: z
        .string()
        .min(1)
        .optional()
        .describe(`Sentry 搜索语法，默认 "${SENTRY_TOOL.DEFAULT_QUERY}"`),
      limit: z
        .number()
        .int()
        .min(SENTRY_TOOL.MIN_LIMIT)
        .max(SENTRY_TOOL.MAX_LIMIT)
        .optional()
        .describe(`列表返回条数，默认 ${SENTRY_TOOL.DEFAULT_LIMIT}`),
    }),
    outputSchema: z.discriminatedUnion("mode", [issueSchema, eventSchema]),
    execute: async ({ issueId, query, limit }): Promise<SentryListResult | SentryEventResult> => {
      if (!config.authToken || !config.org || !config.project) {
        const missing = [
          !config.authToken && "SENTRY_AUTH_TOKEN",
          !config.org && "SENTRY_ORG",
          !config.project && "SENTRY_PROJECT",
        ]
          .filter(Boolean)
          .join(", ");
        if (issueId) {
          return {
            status: "error",
            mode: "event",
            event: null,
            error: makeError(SENTRY_TOOL.ERROR.MISSING_CONFIG, missing),
          };
        }
        return {
          status: "error",
          mode: "list",
          issues: [],
          error: makeError(SENTRY_TOOL.ERROR.MISSING_CONFIG, missing),
        };
      }

      const base = config.endpoint.endsWith("/")
        ? config.endpoint.slice(0, -1)
        : config.endpoint;
      const reqConfig = {
        fetchImpl: config.fetchImpl,
        timeoutMs: config.timeoutMs,
        authToken: config.authToken,
      };

      if (issueId) {
        const url = `${base}${buildLatestEventPath(issueId)}`;
        const res = await request<SentryEvent>(url, reqConfig);
        if (!res.ok) {
          return { status: "error", mode: "event", event: null, error: res.error };
        }
        const event = res.data;
        return {
          status: "success",
          mode: "event",
          event: {
            issueId,
            eventId: event.eventID ?? event.id,
            title: event.title ?? "",
            platform: event.platform,
            timestamp:
              typeof event.timestamp === "number"
                ? new Date(event.timestamp * 1000).toISOString()
                : event.timestamp,
            stacktrace: extractStacktrace(event),
            breadcrumbs: extractBreadcrumbs(event),
            contexts: normalizeContexts(event),
          },
        };
      }

      const effectiveLimit = limit ?? SENTRY_TOOL.DEFAULT_LIMIT;
      const effectiveQuery = query ?? SENTRY_TOOL.DEFAULT_QUERY;
      const url = new URL(`${base}${buildIssuesPath(config.org, config.project)}`);
      url.searchParams.set("query", effectiveQuery);
      url.searchParams.set("limit", String(effectiveLimit));

      const res = await request<SentryIssue[]>(url.toString(), reqConfig);
      if (!res.ok) {
        return { status: "error", mode: "list", issues: [], error: res.error };
      }
      if (!Array.isArray(res.data)) {
        return {
          status: "error",
          mode: "list",
          issues: [],
          error: makeError(SENTRY_TOOL.ERROR.INVALID_RESPONSE, "expected array of issues"),
        };
      }

      return {
        status: "success",
        mode: "list",
        issues: res.data.map((issue) => ({
          id: String(issue.id ?? ""),
          shortId: issue.shortId,
          title: issue.title ?? "",
          culprit: issue.culprit,
          count: String(issue.count ?? "0"),
          userCount: typeof issue.userCount === "number" ? issue.userCount : 0,
          firstSeen: issue.firstSeen,
          lastSeen: issue.lastSeen,
          level: issue.level,
          platform: issue.platform,
        })),
      };
    },
  });
}
