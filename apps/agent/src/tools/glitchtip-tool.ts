import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { GLITCHTIP_TOOL } from "./constants.js";

export interface GlitchtipDeps {
  endpoint?: string;
  authToken?: string;
  org?: string;
  project?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

// GlitchTip / Sentry 服务端下发的原始 frame，字段命名 snake_case 与 camelCase 混杂
// （GlitchTip 6.1.8 实测：lineNo / colNo / absPath 已 camelCase，context_line 仍是 snake_case）。
// 这份接口两边都接受，避免未来切到 Sentry SaaS 时又要改一次。
interface RawFrame {
  filename?: string;
  absPath?: string;
  abs_path?: string;
  function?: string;
  lineNo?: number;
  lineno?: number;
  colNo?: number;
  colno?: number;
  inApp?: boolean;
  in_app?: boolean;
  module?: string;
  contextLine?: string;
  context_line?: string;
  context?: Array<[number, string]>;
  pre_context?: string[];
  post_context?: string[];
  origFilename?: string;
  orig_filename?: string;
  origLineNo?: number;
  orig_lineno?: number;
  origFunction?: string;
  orig_function?: string;
}

interface RawExceptionValue {
  type?: string;
  value?: string;
  stacktrace?: { frames?: RawFrame[] };
}

interface RawEntry {
  type: string;
  data?: { values?: RawExceptionValue[]; frames?: RawFrame[] };
}

interface GlitchtipIssue {
  id: string | number;
  shortId?: string;
  title?: string;
  culprit?: string;
  level?: string;
  status?: string;
  count?: string | number;
  firstSeen?: string;
  lastSeen?: string;
  metadata?: { type?: string; value?: string; filename?: string; function?: string };
}

interface GlitchtipEvent {
  id?: string;
  eventID?: string;
  title?: string;
  platform?: string;
  timestamp?: string | number;
  entries?: RawEntry[];
  contexts?: Record<string, Record<string, unknown>>;
}

function makeError(
  code: (typeof GLITCHTIP_TOOL.ERROR)[keyof typeof GLITCHTIP_TOOL.ERROR],
  message: string,
): string {
  return `${code}: ${message}`;
}

function readConfig(deps: GlitchtipDeps): {
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
    endpoint: deps.endpoint ?? process.env.SENTRY_API_ENDPOINT ?? GLITCHTIP_TOOL.DEFAULT_ENDPOINT,
    authToken: rawToken && rawToken.length > 0 ? rawToken : undefined,
    org: rawOrg && rawOrg.length > 0 ? rawOrg : undefined,
    project: rawProject && rawProject.length > 0 ? rawProject : undefined,
    fetchImpl: deps.fetch ?? globalThis.fetch,
    timeoutMs: deps.timeoutMs ?? GLITCHTIP_TOOL.TIMEOUT_MS,
  };
}

// 规范化 GlitchTip 反解后的源码路径，去掉 ../../ 前缀、?tsr-split=… 查询串、#… fragment，
// 让 git-context 工具能直接拿去用（assertWithinRepo 看到 ".." 会抛 PATH_OUT_OF_REPO）。
function normalizeSourcePath(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let p = raw;
  const hashIdx = p.indexOf("#");
  if (hashIdx >= 0) p = p.slice(0, hashIdx);
  const qIdx = p.indexOf("?");
  if (qIdx >= 0) p = p.slice(0, qIdx);
  while (p.startsWith("./")) p = p.slice(2);
  while (p.startsWith("../")) p = p.slice(3);
  p = p.replace(/^\/+/, "");
  return p.length > 0 ? p : undefined;
}

function readLineNo(f: RawFrame): number | undefined {
  return typeof f.lineNo === "number" ? f.lineNo : typeof f.lineno === "number" ? f.lineno : undefined;
}

function readColNo(f: RawFrame): number | undefined {
  return typeof f.colNo === "number" ? f.colNo : typeof f.colno === "number" ? f.colno : undefined;
}

function readInApp(f: RawFrame): boolean {
  return f.inApp === true || f.in_app === true;
}

function readContextLine(f: RawFrame): string | undefined {
  if (typeof f.contextLine === "string") return f.contextLine;
  if (typeof f.context_line === "string") return f.context_line;
  return undefined;
}

// GlitchTip 把 pre_context + context_line + post_context 合并成 context: [[lineNo, text]]；
// Sentry SaaS 仍是三段分开的字段。这里把两种形态统一成 [[lineNo, text]] 数组。
function readContextWindow(f: RawFrame, lineNo: number | undefined): Array<[number, string]> {
  if (Array.isArray(f.context) && f.context.length > 0) {
    return f.context.slice(0, GLITCHTIP_TOOL.MAX_CONTEXT_LINES);
  }
  const line = typeof lineNo === "number" ? lineNo : 0;
  const pre = Array.isArray(f.pre_context) ? f.pre_context : [];
  const cur = readContextLine(f);
  const post = Array.isArray(f.post_context) ? f.post_context : [];
  const window: Array<[number, string]> = [
    ...pre.map<[number, string]>((text, i) => [line - pre.length + i, text]),
    ...(typeof cur === "string" ? ([[line, cur]] as Array<[number, string]>) : []),
    ...post.map<[number, string]>((text, i) => [line + 1 + i, text]),
  ];
  return window.slice(0, GLITCHTIP_TOOL.MAX_CONTEXT_LINES);
}

async function request<T>(
  url: string,
  config: { fetchImpl: typeof fetch; timeoutMs: number; authToken: string },
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
    return { ok: false, error: makeError(GLITCHTIP_TOOL.ERROR.FETCH_FAILED, message) };
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return {
      ok: false,
      error: makeError(
        GLITCHTIP_TOOL.ERROR.FETCH_FAILED,
        `HTTP ${response.status} ${text}`.trim(),
      ),
    };
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: makeError(GLITCHTIP_TOOL.ERROR.INVALID_RESPONSE, message) };
  }
  return { ok: true, data: data as T };
}

const frameSchema = z.object({
  filename: z.string().optional(),
  function: z.string().optional(),
  lineNo: z.number().optional(),
  colNo: z.number().optional(),
  inApp: z.boolean(),
  contextLine: z.string().optional(),
  context: z.array(z.tuple([z.number(), z.string()])),
});

const issueResultSchema = z.object({
  status: z.literal("success"),
  issue: z.object({
    id: z.string(),
    shortId: z.string().optional(),
    title: z.string().optional(),
    culprit: z.string().optional(),
    level: z.string().optional(),
    count: z.string(),
    firstSeen: z.string().optional(),
    lastSeen: z.string().optional(),
    metadataFilename: z.string().optional(),
    metadataFunction: z.string().optional(),
  }),
  event: z
    .object({
      eventId: z.string().optional(),
      title: z.string().optional(),
      platform: z.string().optional(),
      timestamp: z.string().optional(),
      exceptionType: z.string().optional(),
      exceptionValue: z.string().optional(),
      stacktrace: z.array(frameSchema),
    })
    .nullable(),
});

const errorResultSchema = z.object({
  status: z.literal("error"),
  error: z.string(),
});

export function createGlitchtipTool(deps: GlitchtipDeps = {}) {
  const config = readConfig(deps);

  return createTool({
    id: GLITCHTIP_TOOL.ID,
    description: GLITCHTIP_TOOL.DESCRIPTION,
    inputSchema: z.object({
      issueId: z
        .string()
        .min(1)
        .describe("GlitchTip issue id (numeric string, e.g. '5'). The tool returns the issue together with its latest event's symbolicated stacktrace."),
    }),
    outputSchema: z.discriminatedUnion("status", [issueResultSchema, errorResultSchema]),
    execute: async ({ issueId }) => {
      if (!config.authToken || !config.org || !config.project) {
        const missing = [
          !config.authToken && "SENTRY_AUTH_TOKEN",
          !config.org && "SENTRY_ORG",
          !config.project && "SENTRY_PROJECT",
        ]
          .filter(Boolean)
          .join(", ");
        return { status: "error" as const, error: makeError(GLITCHTIP_TOOL.ERROR.MISSING_CONFIG, missing) };
      }

      const authToken: string = config.authToken;

      const base = config.endpoint.endsWith("/") ? config.endpoint.slice(0, -1) : config.endpoint;
      const reqConfig = {
        fetchImpl: config.fetchImpl,
        timeoutMs: config.timeoutMs,
        authToken,
      };

      const issueUrl = `${base}${GLITCHTIP_TOOL.API_PATH.ISSUE_DETAIL.replace(
        "{issueId}",
        encodeURIComponent(issueId),
      )}`;
      const issueRes = await request<GlitchtipIssue>(issueUrl, reqConfig);
      if (!issueRes.ok) return { status: "error" as const, error: issueRes.error };
      const issue = issueRes.data;

      const eventUrl = `${base}${GLITCHTIP_TOOL.API_PATH.ISSUE_LATEST_EVENT.replace(
        "{issueId}",
        encodeURIComponent(String(issue.id)),
      )}`;
      const eventRes = await request<GlitchtipEvent>(eventUrl, reqConfig);
      if (!eventRes.ok) return { status: "error" as const, error: eventRes.error };
      const event = eventRes.data;

      let frames: RawFrame[] = [];
      let exceptionType: string | undefined;
      let exceptionValue: string | undefined;
      for (const entry of event.entries ?? []) {
        if (entry.type !== "exception") continue;
        const values = entry.data?.values ?? [];
        const first = values[0];
        if (first) {
          exceptionType = first.type;
          exceptionValue = first.value;
        }
        for (const v of values) {
          const stFrames = v.stacktrace?.frames;
          if (stFrames && stFrames.length > 0) {
            frames = stFrames;
            break;
          }
        }
        if (frames.length > 0) break;
      }

      // Sentry 返回的 frames 是"最老的在前"，反转后截断，agent 关心最近的调用
      const reversed = [...frames].reverse().slice(0, GLITCHTIP_TOOL.MAX_STACKTRACE_FRAMES);
      const normalizedFrames = reversed.map((f) => {
        const lineNo = readLineNo(f);
        const rawName = f.filename ?? f.absPath ?? f.abs_path;
        return {
          filename: normalizeSourcePath(rawName) ?? rawName,
          function: f.function,
          lineNo,
          colNo: readColNo(f),
          inApp: readInApp(f),
          contextLine: readContextLine(f),
          context: readContextWindow(f, lineNo),
        };
      });

      const timestamp =
        typeof event.timestamp === "number"
          ? new Date(event.timestamp * 1000).toISOString()
          : event.timestamp;

      return {
        status: "success" as const,
        issue: {
          id: String(issue.id),
          shortId: issue.shortId,
          title: issue.title ?? "",
          culprit: issue.culprit,
          level: issue.level,
          count: String(issue.count ?? "0"),
          firstSeen: issue.firstSeen,
          lastSeen: issue.lastSeen,
          metadataFilename: issue.metadata?.filename,
          metadataFunction: issue.metadata?.function,
        },
        event: {
          eventId: event.eventID ?? event.id,
          title: event.title ?? "",
          platform: event.platform,
          timestamp,
          exceptionType,
          exceptionValue,
          stacktrace: normalizedFrames,
        },
      };
    },
  });
}
