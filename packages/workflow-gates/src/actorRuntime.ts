import { spawn } from "node:child_process";
import type {
  ActorRegistry,
  ExecutionBrief,
  ExecutionRequest,
  ExecutionResult,
} from "./taskTypes.ts";

interface ProcessResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

interface ClaudeResultEnvelope {
  is_error?: boolean;
  result?: string;
  session_id?: string;
  duration_ms?: number;
  total_cost_usd?: number;
}

type ProcessRunner = (
  command: string,
  args: string[],
  options: { cwd: string; timeoutMs: number },
) => Promise<ProcessResult>;

export function createExecutionRequest(
  brief: ExecutionBrief,
  registry: ActorRegistry,
  cwd = process.cwd(),
): ExecutionRequest {
  const profile = registry.actors[brief.actor];
  if (!profile) {
    throw new Error(`Actor '${brief.actor}' is not registered`);
  }

  return {
    taskId: brief.taskId,
    role: brief.currentRole,
    actor: brief.actor,
    adapter: profile.adapter,
    mode: profile.mode,
    prompt: brief.prompt,
    cwd,
    executable: profile.executable,
    allowedTools: profile.allowedTools ?? [],
    disallowedTools: profile.disallowedTools ?? [],
    permissionMode: profile.permissionMode,
    dangerouslySkipPermissions: profile.dangerouslySkipPermissions ?? false,
    bootstrapPrompt: profile.bootstrapPrompt,
    settingSources: profile.settingSources ?? [],
    freshSession: profile.freshSession ?? true,
    externalProvider: profile.externalProvider,
    requiresExternalDataApproval: profile.requiresExternalDataApproval ?? false,
    timeoutMs: profile.timeoutMs ?? 600_000,
  };
}

export function buildClaudeCodeArgs(
  request: ExecutionRequest,
  prompt = request.prompt,
): string[] {
  if (request.adapter !== "claude-code") {
    throw new Error(`Actor '${request.actor}' uses manual execution`);
  }

  // Keep the positional prompt before variadic tool options so Claude Code
  // cannot consume it as another --allowedTools/--disallowedTools value.
  const args = ["-p", prompt, "--output-format", "json"];
  if (request.freshSession) {
    args.push("--no-session-persistence");
  }
  if (request.settingSources.length > 0) {
    args.push("--setting-sources", request.settingSources.join(","));
  }
  if (request.dangerouslySkipPermissions) {
    args.push("--dangerously-skip-permissions");
  } else if (request.permissionMode) {
    args.push("--permission-mode", request.permissionMode);
  }
  if (request.allowedTools.length > 0) {
    args.push("--allowedTools", request.allowedTools.join(","));
  }
  if (request.disallowedTools.length > 0) {
    args.push("--disallowedTools", request.disallowedTools.join(","));
  }
  return args;
}

export function assertExecutionApproved(
  request: ExecutionRequest,
  externalDataApproved: boolean,
): void {
  if (request.requiresExternalDataApproval && !externalDataApproved) {
    throw new Error(
      `Actor '${request.actor}' may send repository context to external provider `
      + `'${request.externalProvider ?? "unknown"}'. Re-run with `
      + "`--approve-external-data` only after explicit human approval.",
    );
  }
}

export async function executeActor(
  request: ExecutionRequest,
  runner: ProcessRunner = runProcess,
): Promise<ExecutionResult> {
  if (request.adapter === "manual") {
    throw new Error(
      `Actor '${request.actor}' requires manual execution; no runtime adapter is configured`,
    );
  }

  let bootstrapOutput: string | undefined;
  if (request.bootstrapPrompt) {
    const bootstrapResult = await runner(
      request.executable ?? "claude",
      buildClaudeCodeArgs(request, request.bootstrapPrompt),
      { cwd: request.cwd, timeoutMs: request.timeoutMs },
    );
    const bootstrapEnvelope = requireSuccessfulClaudeResult(
      request,
      bootstrapResult,
      "bootstrap",
    );
    bootstrapOutput = bootstrapEnvelope.result ?? "";
  }

  const processResult = await runner(
    request.executable ?? "claude",
    buildClaudeCodeArgs(request),
    { cwd: request.cwd, timeoutMs: request.timeoutMs },
  );

  const envelope = requireSuccessfulClaudeResult(request, processResult, "execution");

  return {
    taskId: request.taskId,
    role: request.role,
    actor: request.actor,
    success: true,
    output: envelope.result ?? "",
    bootstrapOutput,
    sessionId: envelope.session_id,
    durationMs: envelope.duration_ms,
    costUsd: envelope.total_cost_usd,
    completedAt: new Date().toISOString(),
  };
}

function requireSuccessfulClaudeResult(
  request: ExecutionRequest,
  processResult: ProcessResult,
  stage: "bootstrap" | "execution",
): ClaudeResultEnvelope {
  if (processResult.exitCode !== 0) {
    const detail = processResult.stderr.trim() || processResult.stdout.trim();
    throw new Error(
      `Actor '${request.actor}' ${stage} failed with exit code `
      + `${processResult.exitCode}: ${detail}`,
    );
  }

  const envelope = parseClaudeEnvelope(processResult.stdout);
  if (envelope.is_error) {
    throw new Error(
      `Actor '${request.actor}' ${stage} returned an error: `
      + `${envelope.result ?? "unknown error"}`,
    );
  }
  return envelope;
}

function parseClaudeEnvelope(stdout: string): ClaudeResultEnvelope {
  const trimmed = stdout.trim();
  try {
    return JSON.parse(trimmed) as ClaudeResultEnvelope;
  } catch {
    const jsonLine = trimmed
      .split(/\r?\n/)
      .find((line) => line.trim().startsWith("{") && line.trim().endsWith("}"));
    if (!jsonLine) {
      throw new Error("Claude Code returned invalid JSON output");
    }
    return JSON.parse(jsonLine) as ClaudeResultEnvelope;
  }
}

function runProcess(
  command: string,
  args: string[],
  options: { cwd: string; timeoutMs: number },
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, options.timeoutMs);

    child.on("close", (exitCode) => {
      clearTimeout(timeout);
      if (timedOut) {
        reject(new Error(`Actor process timed out after ${options.timeoutMs}ms`));
        return;
      }
      resolve({ exitCode, stdout, stderr });
    });
  });
}
