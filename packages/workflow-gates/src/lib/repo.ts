import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { spawnSync } from "node:child_process";

export function fileExists(path: string): boolean {
  return existsSync(path);
}

export function readActiveGoal(): string | null {
  if (!existsSync(".claude/active-goal")) {
    return null;
  }

  return readFileSync(".claude/active-goal", "utf8").split(/\r?\n/)[0]?.trim() || null;
}

export function baseName(path: string): string {
  return basename(path);
}

export function runCommand(command: string, args: string[]): { ok: boolean; output: string } {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  return {
    ok: result.status === 0,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

export function isGitTracked(path: string): boolean {
  const result = spawnSync("git", ["ls-files", "--error-unmatch", path], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  return result.status === 0;
}

