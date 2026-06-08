import { findUpSync } from "find-up";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

let _repoRoot: string | null = null;

/**
 * 定位 monorepo 根目录。
 * 从当前模块位置出发，向上查找包含 `workspaces` 字段的 package.json。
 * 结果会被缓存，后续调用直接返回。
 */
export function getRepoRoot(): string {
  if (_repoRoot) return _repoRoot;

  const found = findUpSync(
    (directory) => {
      const pkgPath = path.join(directory, "package.json");
      if (!existsSync(pkgPath)) return;
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
        if (pkg.workspaces) return directory;
      } catch {
        // 损坏的 package.json 跳过
      }
    },
    { type: "directory", cwd: import.meta.dirname },
  );

  _repoRoot = found ?? process.cwd();
  return _repoRoot;
}

/**
 * 基于 monorepo 根目录拼接路径，取代容易出错的相对路径。
 * 用法：resolveFromRoot("logs", "backend.jsonl") → /abs/path/to/repo/logs/backend.jsonl
 */
export function resolveFromRoot(...segments: string[]): string {
  return path.join(getRepoRoot(), ...segments);
}
