import { existsSync, readFileSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve as resolvePath, relative as relativePath, normalize } from "node:path";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { GIT_CONTEXT_TOOL } from "./constants.js";

export interface GitContextDeps {
  repoRoot?: string;
  readFile?: (path: string) => string;
  fileExists?: (path: string) => boolean;
  fileSize?: (path: string) => number;
  runGit?: (args: string[], cwd: string) => Promise<string>;
}

interface CommitRecord {
  hash: string;
  author: string;
  date: string;
  message: string;
}

function discoverRepoRoot(fromEnv = process.env.OPSAGENT_REPO_ROOT): string {
  if (fromEnv?.trim()) return fromEnv;
  let dir = process.cwd();
  while (true) {
    try {
      if (statSync(`${dir}/.git`).isDirectory()) return dir;
    } catch {
      // keep walking
    }
    const parent = resolvePath(dir, "..");
    if (parent === dir) return process.cwd();
    dir = parent;
  }
}

function assertWithinRepo(path: string, repoRoot: string): string {
  if (!path || typeof path !== "string") {
    throw new Error(GIT_CONTEXT_TOOL.ERROR.PATH_OUT_OF_REPO);
  }
  const normalized = normalize(resolvePath(repoRoot, path));
  const rel = relativePath(repoRoot, normalized);
  if (rel.startsWith("..") || resolvePath(repoRoot, rel) !== normalized) {
    throw new Error(GIT_CONTEXT_TOOL.ERROR.PATH_OUT_OF_REPO);
  }
  return normalized;
}

function parseGitLog(stdout: string): CommitRecord[] {
  const SEP = "---commit-sep---";
  const FIELD = "---field-sep---";
  return stdout
    .split(SEP)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0)
    .map((chunk) => {
      const [hash, author, date, ...rest] = chunk.split(FIELD);
      return {
        hash: hash?.trim() ?? "",
        author: author?.trim() ?? "",
        date: date?.trim() ?? "",
        message: rest.join(FIELD).trim(),
      };
    });
}

function defaultRunGit(args: string[], cwd: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const child = spawn("git", args, { cwd, shell: false });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`git ${args.join(" ")} exited ${code}: ${stderr.trim()}`));
        return;
      }
      resolve(stdout);
    });
  });
}

export function createGitContextTool(deps: GitContextDeps = {}) {
  const repoRoot = deps.repoRoot ?? discoverRepoRoot();
  const readFile = deps.readFile ?? ((p: string) => readFileSync(p, "utf8"));
  const fileExists = deps.fileExists ?? ((p: string) => existsSync(p));
  const fileSize = deps.fileSize ?? ((p: string) => statSync(p).size);
  const runGit = deps.runGit ?? defaultRunGit;

  return createTool({
    id: GIT_CONTEXT_TOOL.ID,
    description: GIT_CONTEXT_TOOL.DESCRIPTION,
    inputSchema: z.object({
      path: z.string().min(1).describe("仓库内相对路径，例如 apps/backend/src/app.ts"),
      includeRecentCommits: z
        .boolean()
        .optional()
        .describe("是否返回该文件最近 N 条 commit，默认 true"),
      commitLimit: z
        .number()
        .int()
        .min(GIT_CONTEXT_TOOL.COMMIT_LIMIT_MIN)
        .max(GIT_CONTEXT_TOOL.COMMIT_LIMIT_MAX)
        .optional()
        .describe(`返回条数，默认 ${GIT_CONTEXT_TOOL.DEFAULT_COMMIT_LIMIT}`),
    }),
    outputSchema: z.object({
      path: z.string(),
      content: z.string(),
      truncated: z.boolean(),
      originalSizeBytes: z.number(),
      recentCommits: z.array(
        z.object({
          hash: z.string(),
          author: z.string(),
          date: z.string(),
          message: z.string(),
        }),
      ),
      warnings: z.array(z.string()),
    }),
    execute: async ({ path, includeRecentCommits, commitLimit }) => {
      const warnings: string[] = [];
      let absolute: string;
      try {
        absolute = assertWithinRepo(path, repoRoot);
      } catch (error) {
        return {
          path,
          content: "",
          truncated: false,
          originalSizeBytes: 0,
          recentCommits: [],
          warnings: [
            error instanceof Error
              ? error.message
              : GIT_CONTEXT_TOOL.ERROR.PATH_OUT_OF_REPO,
          ],
        };
      }

      if (!fileExists(absolute)) {
        return {
          path,
          content: "",
          truncated: false,
          originalSizeBytes: 0,
          recentCommits: [],
          warnings: [GIT_CONTEXT_TOOL.ERROR.FILE_NOT_FOUND],
        };
      }

      const size = fileSize(absolute);
      let content = "";
      let truncated = false;
      try {
        const raw = readFile(absolute);
        if (size > GIT_CONTEXT_TOOL.MAX_CONTENT_BYTES) {
          content = raw.slice(0, GIT_CONTEXT_TOOL.MAX_CONTENT_BYTES);
          truncated = true;
          warnings.push(GIT_CONTEXT_TOOL.ERROR.CONTENT_TRUNCATED);
        } else {
          content = raw;
        }
      } catch (error) {
        warnings.push(
          `${GIT_CONTEXT_TOOL.ERROR.READ_FAILED}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }

      let recentCommits: CommitRecord[] = [];
      const wantCommits = includeRecentCommits !== false;
      if (wantCommits) {
        const limit = commitLimit ?? GIT_CONTEXT_TOOL.DEFAULT_COMMIT_LIMIT;
        const SEP = "---commit-sep---";
        const FIELD = "---field-sep---";
        const format = `%H${FIELD}%an${FIELD}%aI${FIELD}%s${SEP}`;
        try {
          const stdout = await runGit(
            ["log", `-${limit}`, `--pretty=format:${format}`, "--", path],
            repoRoot,
          );
          recentCommits = parseGitLog(stdout);
        } catch (error) {
          warnings.push(
            `${GIT_CONTEXT_TOOL.ERROR.GIT_FAILED}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }

      return {
        path,
        content,
        truncated,
        originalSizeBytes: size,
        recentCommits,
        warnings,
      };
    },
  });
}
