export interface HookPayload {
  tool_name?: string;
  tool_input?: {
    command?: string;
    file_path?: string;
    path?: string;
    edits?: Array<{
      file_path?: string;
    }>;
  };
}

export function parseHookPayload(input: string): HookPayload {
  if (!input.trim()) {
    return {};
  }

  try {
    return JSON.parse(input) as HookPayload;
  } catch {
    return {};
  }
}

export function extractPaths(payload: HookPayload): string[] {
  const toolInput = payload.tool_input ?? {};
  const paths: string[] = [];

  for (const key of ["file_path", "path"] as const) {
    const value = toolInput[key];
    if (typeof value === "string") {
      paths.push(value);
    }
  }

  for (const edit of toolInput.edits ?? []) {
    if (typeof edit.file_path === "string") {
      paths.push(edit.file_path);
    }
  }

  return paths;
}

