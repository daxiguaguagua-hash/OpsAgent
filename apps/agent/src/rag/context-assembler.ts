import type { KnowledgeChunk } from "../gbrain/types.js";

export type ContextSourceKind = "task" | "knowledge" | "code";

export interface ContextSnippet {
  source: ContextSourceKind;
  sourceId: string;
  title: string;
  body: string;
  score: number;
}

export interface AssembledContext {
  snippets: ContextSnippet[];
  truncated: boolean;
  totalTokensEstimate: number;
}

export interface TaskFacts {
  taskId: string;
  status: string;
  scope: string;
  acceptanceCriteria: string[];
}

export interface CodeContext {
  path: string;
  symbols: string[];
  body: string;
}

export interface AssembleInput {
  taskFacts?: TaskFacts;
  knowledge?: KnowledgeChunk[];
  codeContext?: CodeContext[];
  maxSnippets?: number;
  maxTokens?: number;
}

const DEFAULT_MAX_SNIPPETS = 12;
const DEFAULT_MAX_TOKENS = 6000;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function snippetFromTask(facts: TaskFacts): ContextSnippet {
  const body = [
    `taskId: ${facts.taskId}`,
    `status: ${facts.status}`,
    `scope: ${facts.scope}`,
    `acceptanceCriteria:`,
    ...facts.acceptanceCriteria.map((ac) => `  - ${ac}`),
  ].join("\n");
  return {
    source: "task",
    sourceId: "opsagent-postgres",
    title: `Task ${facts.taskId}`,
    body,
    score: 1.0,
  };
}

function snippetFromKnowledge(chunk: KnowledgeChunk): ContextSnippet {
  return {
    source: "knowledge",
    sourceId: chunk.sourceId,
    title: chunk.title,
    body: chunk.content,
    score: chunk.score,
  };
}

function snippetFromCode(code: CodeContext): ContextSnippet {
  return {
    source: "code",
    sourceId: "opsagent-codegraph",
    title: code.path,
    body: `symbols: ${code.symbols.join(", ")}\n\n${code.body}`,
    score: 0.9,
  };
}

export function assembleContext(input: AssembleInput): AssembledContext {
  const maxSnippets = input.maxSnippets ?? DEFAULT_MAX_SNIPPETS;
  const maxTokens = input.maxTokens ?? DEFAULT_MAX_TOKENS;

  const candidates: ContextSnippet[] = [];
  if (input.taskFacts) candidates.push(snippetFromTask(input.taskFacts));
  for (const chunk of input.knowledge ?? [])
    candidates.push(snippetFromKnowledge(chunk));
  for (const code of input.codeContext ?? []) candidates.push(snippetFromCode(code));

  candidates.sort((a, b) => {
    const sourceOrder: Record<ContextSourceKind, number> = {
      task: 0,
      code: 1,
      knowledge: 2,
    };
    const so = sourceOrder[a.source] - sourceOrder[b.source];
    if (so !== 0) return so;
    return b.score - a.score;
  });

  const picked: ContextSnippet[] = [];
  let tokens = 0;
  let truncated = false;
  for (const snippet of candidates) {
    if (picked.length >= maxSnippets) {
      truncated = true;
      break;
    }
    const cost = estimateTokens(snippet.body) + estimateTokens(snippet.title);
    if (tokens + cost > maxTokens) {
      truncated = true;
      break;
    }
    picked.push(snippet);
    tokens += cost;
  }

  return {
    snippets: picked,
    truncated,
    totalTokensEstimate: tokens,
  };
}

export function renderPrompt(context: AssembledContext): string {
  const blocks = context.snippets.map((snippet) => {
    const header = `## [${snippet.source}:${snippet.sourceId}] ${snippet.title}`;
    return `${header}\n\n${snippet.body}`;
  });
  const footer = context.truncated
    ? "\n\n<!-- context truncated due to token budget -->"
    : "";
  return blocks.join("\n\n---\n\n") + footer;
}
