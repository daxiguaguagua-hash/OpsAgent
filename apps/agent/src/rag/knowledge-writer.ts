/**
 * 任务完工时，自动生成一份 markdown 草稿文件到 docs/knowledge/tasks/ 目录。
 */

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

export interface TaskSummary {
  taskId: string;
  title: string;
  status: "completed" | "accepted";
  conclusion: string;
  keyEvidence: string[];
  completedAt: string;
}

export interface DraftResult {
  path: string;
  skipped: boolean;
  reason?: string;
}

export interface KnowledgeWriterDeps {
  writeText?: (path: string, content: string) => void;
  exists?: (path: string) => boolean;
  knowledgeRoot?: string;
}

export const KNOWLEDGE_CAPTURE = {
  DRAFT_PREFIX: "<!-- auto-draft: please review before merging -->",
  FILE_EXTENSION: ".md",
} as const;

export function defaultKnowledgeRoot(): string {
  return join(process.cwd(), "docs/knowledge/tasks");
}

export function buildDraft(summary: TaskSummary): string {
  const evidence =
    summary.keyEvidence.length > 0
      ? summary.keyEvidence.map((e) => `- ${e}`).join("\n")
      : "- （待补充关键证据）";
  return [
    KNOWLEDGE_CAPTURE.DRAFT_PREFIX,
    `# ${summary.taskId}：${summary.title}`,
    "",
    `> **状态**：${summary.status}  `,
    `> **完成时间**：${summary.completedAt}`,
    "",
    "## 结论",
    summary.conclusion || "（待补充结论）",
    "",
    "## 关键证据",
    evidence,
    "",
    "## 待人工审核",
    "- [ ] 内容是否准确？",
    "- [ ] 是否可沉淀为稳定知识？",
    "- [ ] 是否需要改写为 ADR 或故障经验？",
    "",
  ].join("\n");
}

export function captureTaskSummary(
  summary: TaskSummary,
  deps: KnowledgeWriterDeps = {},
): DraftResult {
  const root = deps.knowledgeRoot ?? defaultKnowledgeRoot();
  const writeText = deps.writeText ?? ((p, c) => {
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, c, "utf8");
  });
  const exists = deps.exists ?? ((p) => existsSync(p));

  if (!summary.taskId || !/^[A-Za-z0-9-]+$/.test(summary.taskId)) {
    return {
      path: "",
      skipped: true,
      reason: `invalid taskId: "${summary.taskId}"`,
    };
  }
  if (summary.status !== "completed" && summary.status !== "accepted") {
    return {
      path: "",
      skipped: true,
      reason: `status "${summary.status}" is not eligible for capture`,
    };
  }

  const file = join(root, `${summary.taskId}${KNOWLEDGE_CAPTURE.FILE_EXTENSION}`);
  if (exists(file)) {
    return { path: file, skipped: true, reason: "draft already exists" };
  }

  const content = buildDraft(summary);
  writeText(file, content);
  return { path: file, skipped: false };
}

export const MANUAL_REVIEW_REQUIRED = {
  adr: "docs/decisions/",
  incident: "docs/knowledge/incidents/",
} as const;

export function requiresManualReview(path: string): boolean {
  return Object.values(MANUAL_REVIEW_REQUIRED).some((dir) =>
    path.startsWith(dir),
  );
}
