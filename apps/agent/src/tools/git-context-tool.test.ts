/**
 * git-context-tool.ts 单元测试
 *
 * 覆盖范围：
 * - 路径逃逸防护：../ 逃出仓库根返回 PATH_OUT_OF_REPO 警告
 * - 文件缺失：返回 FILE_NOT_FOUND 警告
 * - 大文件截断：超过 MAX_CONTENT_BYTES 时返回截断内容 + CONTENT_TRUNCATED 警告
 * - 正常读取：返回内容与 commit 列表
 * - git 失败降级：runGit 抛错时降级为 GIT_FAILED 警告（不抛异常）
 * - includeRecentCommits=false 时不调用 git
 *
 * 运行方式：pnpm --filter @opsagent/agent test
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { createGitContextTool, type GitContextDeps } from "./git-context-tool.js";
import { GIT_CONTEXT_TOOL } from "./constants.js";

interface ToolCallInput {
  path: string;
  includeRecentCommits?: boolean;
  commitLimit?: number;
}

function buildDeps(overrides: Partial<GitContextDeps> = {}): GitContextDeps {
  const files: Record<string, string> = {
    "/repo/apps/backend/src/app.ts": "export const app = {};\n",
    "/repo/docs/issues/M3-07-git-context-tool.md": "x".repeat(
      GIT_CONTEXT_TOOL.MAX_CONTENT_BYTES + 1024,
    ),
  };
  return {
    repoRoot: "/repo",
    readFile: (p: string) => {
      const content = files[p];
      if (content === undefined) throw new Error(`no such file: ${p}`);
      return content;
    },
    fileExists: (p: string) => p in files,
    fileSize: (p: string) => (files[p] ?? "").length,
    runGit: async () =>
      [
        "abc123---field-sep---Alice---field-sep---2026-06-10T10:00:00Z---field-sep---feat: init---commit-sep---",
        "def456---field-sep---Bob---field-sep---2026-06-09T10:00:00Z---field-sep---fix: bug---commit-sep---",
      ].join(""),
    ...overrides,
  };
}

async function callWith(
  input: ToolCallInput,
  overrides: Partial<GitContextDeps> = {},
) {
  const tool = createGitContextTool(buildDeps(overrides));
  const execute = tool.execute;
  if (!execute) throw new Error("tool.execute should exist");
  const result = (await execute(input, {} as any)) as {
    path: string;
    content: string;
    truncated: boolean;
    originalSizeBytes: number;
    recentCommits: { hash: string; author: string; date: string; message: string }[];
    warnings: string[];
  };
  if (!result) throw new Error("tool.execute should return a value");
  return result;
}

describe("createGitContextTool — 路径与读取", () => {
  test("合法路径返回内容与 commit", async () => {
    const result = await callWith({
      path: "apps/backend/src/app.ts",
      includeRecentCommits: true,
      commitLimit: 5,
    });

    assert.equal(result.path, "apps/backend/src/app.ts", "path 应回显");
    assert.equal(result.content, "export const app = {};\n", "content 应为文件原文");
    assert.equal(result.truncated, false, "未超过阈值时 truncated 应为 false");
    assert.equal(result.recentCommits.length, 2, "应解析出 2 条 commit");
    const [first, second] = result.recentCommits;
    assert.ok(first && second, "应至少有两条 commit");
    assert.equal(first.hash, "abc123", "第一条 commit hash 应为");
    assert.equal(second.author, "Bob", "第二条 commit author 应为 Bob");
    assert.deepEqual(result.warnings, [], "无警告");
  });

  test("includeRecentCommits=false 时不调用 git", async () => {
    let called = false;
    const result = await callWith(
      { path: "apps/backend/src/app.ts", includeRecentCommits: false, commitLimit: 5 },
      {
        runGit: async () => {
          called = true;
          return "";
        },
      },
    );

    assert.equal(called, false, "runGit 不应被调用");
    assert.deepEqual(result.recentCommits, [], "recentCommits 应为空数组");
  });

  test("文件缺失返回 FILE_NOT_FOUND 警告", async () => {
    const result = await callWith({
      path: "apps/backend/missing.ts",
      includeRecentCommits: false,
      commitLimit: 5,
    });

    assert.deepEqual(
      result.warnings,
      [GIT_CONTEXT_TOOL.ERROR.FILE_NOT_FOUND],
      "应包含 FILE_NOT_FOUND 警告",
    );
    assert.equal(result.content, "", "缺失时 content 应为空");
  });

  test("超过 256 KB 时截断并标记", async () => {
    const result = await callWith({
      path: "docs/issues/M3-07-git-context-tool.md",
      includeRecentCommits: false,
      commitLimit: 5,
    });

    assert.equal(result.truncated, true, "truncated 应为 true");
    assert.equal(
      result.content.length,
      GIT_CONTEXT_TOOL.MAX_CONTENT_BYTES,
      "content 长度应被截断到阈值",
    );
    assert.ok(
      result.warnings.includes(GIT_CONTEXT_TOOL.ERROR.CONTENT_TRUNCATED),
      "应包含 CONTENT_TRUNCATED 警告",
    );
    assert.equal(
      result.originalSizeBytes,
      GIT_CONTEXT_TOOL.MAX_CONTENT_BYTES + 1024,
      "originalSizeBytes 应记录原始大小",
    );
  });
});

describe("createGitContextTool — 路径逃逸防护", () => {
  test("../etc/passwd 被拦截", async () => {
    const result = await callWith({
      path: "../../etc/passwd",
      includeRecentCommits: false,
      commitLimit: 5,
    });

    assert.ok(
      result.warnings.some((w: string) =>
        w.includes(GIT_CONTEXT_TOOL.ERROR.PATH_OUT_OF_REPO),
      ),
      "应返回 PATH_OUT_OF_REPO 警告",
    );
    assert.equal(result.content, "", "拦截时 content 应为空");
    assert.deepEqual(result.recentCommits, [], "拦截时 recentCommits 应为空");
  });

  test("apps/../../etc/passwd 被拦截", async () => {
    const result = await callWith({
      path: "apps/../../etc/passwd",
      includeRecentCommits: false,
      commitLimit: 5,
    });

    assert.ok(
      result.warnings.some((w: string) =>
        w.includes(GIT_CONTEXT_TOOL.ERROR.PATH_OUT_OF_REPO),
      ),
      "伪装成子目录后再逃逸也应被拦截",
    );
  });

  test("空 path 被 zod min(1) 拦截", async () => {
    const tool = createGitContextTool(buildDeps());
    const execute = tool.execute;
    if (!execute) throw new Error("tool.execute should exist");

    const result = (await execute(
      { path: "", includeRecentCommits: false, commitLimit: 5 },
      {} as any,
    )) as { error?: boolean; message?: string };

    assert.equal(result.error, true, "Mastra 应返回 error: true");
    assert.ok(
      typeof result.message === "string" &&
        result.message.includes("path") &&
        result.message.includes("Too small"),
      "message 应提示 path 字段的 min(1) 校验失败",
    );
  });
});

describe("createGitContextTool — git 失败降级", () => {
  test("runGit 抛错时返回 GIT_FAILED 警告而非抛异常", async () => {
    const result = await callWith(
      { path: "apps/backend/src/app.ts", includeRecentCommits: true, commitLimit: 5 },
      {
        runGit: async () => {
          throw new Error("git not installed");
        },
      },
    );

    assert.equal(result.content, "export const app = {};\n", "文件内容仍应返回");
    assert.deepEqual(result.recentCommits, [], "git 失败时 recentCommits 应为空");
    assert.ok(
      result.warnings.some((w: string) =>
        w.includes(GIT_CONTEXT_TOOL.ERROR.GIT_FAILED),
      ),
      "应包含 GIT_FAILED 警告",
    );
  });
});
