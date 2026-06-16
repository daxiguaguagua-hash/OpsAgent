import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";

import { getRepoRoot, resolveFromRoot } from "./repo-root.ts";

describe("getRepoRoot() 函数，这里是验证是否能够正确找到根目录", () => {
  test("getRepoRoot() 返回 monorepo 根目录", () => {
    const root = getRepoRoot();
    assert.ok(root, "repoRoot 不能为空");
    assert.ok(path.isAbsolute(root), "repoRoot 必须是绝对路径");

    const pkgPath = path.join(root, "package.json");
    assert.ok(existsSync(pkgPath), `根目录应包含 package.json: ${pkgPath}`);

    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    // pnpm / yarn berry 风格：{ workspaces: { packages: [...] } }
    // npm / yarn classic 风格：{ workspaces: [...] }
    // 两种都是合法的 monorepo 根，断言任一形态即可。
    const hasWorkspaces =
      (Array.isArray(pkg.workspaces) && pkg.workspaces.length > 0) ||
      (pkg.workspaces &&
        typeof pkg.workspaces === "object" &&
        Array.isArray(pkg.workspaces.packages) &&
        pkg.workspaces.packages.length > 0);
    assert.ok(hasWorkspaces, "根 package.json 必须有 workspaces 字段（数组或 { packages: [] }）");
  });

  test("getRepoRoot() 结果会被缓存，多次调用返回同一值", () => {
    const first = getRepoRoot();
    const second = getRepoRoot();
    assert.equal(first, second, "缓存后两次调用应返回相同值");
  });

  test("resolveFromRoot() 拼接为绝对路径", () => {
    const result = resolveFromRoot("logs", "backend.jsonl");
    assert.ok(path.isAbsolute(result), "resolveFromRoot 应返回绝对路径");
    assert.ok(
      result.startsWith(getRepoRoot()),
      "resolveFromRoot 应以 repoRoot 开头",
    );
    assert.equal(
      result,
      path.join(getRepoRoot(), "logs", "backend.jsonl"),
      "resolveFromRoot 等效于 path.join(repoRoot, ...segments)",
    );
  });

  test("resolveFromRoot() 无参数时返回 repoRoot 本身", () => {
    assert.equal(resolveFromRoot(), getRepoRoot());
  });
});
