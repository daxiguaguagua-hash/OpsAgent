import type { GBrainClient, KnowledgeChunk } from "../../gbrain/types.js";

export interface CitationAuditResult {
  valid: string[];
  missing: string[];
  total: number;
}

export async function auditCitations(
  client: GBrainClient,
  usedSourceIds: string[],
): Promise<CitationAuditResult> {
  const sources = await client.listSources();
  const known = new Set(sources.map((s) => s.id));
  const valid: string[] = [];
  const missing: string[] = [];
  for (const id of usedSourceIds) {
    if (known.has(id)) valid.push(id);
    else missing.push(id);
  }
  return { valid, missing, total: usedSourceIds.length };
}

export async function requireCitations(
  client: GBrainClient,
  reportMarkdown: string,
): Promise<CitationAuditResult> {
  const used = extractCitations(reportMarkdown);
  return auditCitations(client, used);
}

export function extractCitations(markdown: string): string[] {
  const pattern = /sourceId:\s*([A-Za-z0-9_-]+)/g;
  const ids = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(markdown)) !== null) {
    const id = match[1];
    if (id) ids.add(id);
  }
  return [...ids];
}

export interface CoverageCheck {
  covered: boolean;
  missingChunks: string[];
  coveredCount: number;
  totalCount: number;
}

export async function checkReportCoverage(
  client: GBrainClient,
  reportChunks: KnowledgeChunk[],
): Promise<CoverageCheck> {
  const sources = await client.listSources();
  const known = new Map(sources.map((s) => [s.id, s.description]));
  const usedIds = new Set(reportChunks.map((c) => c.sourceId));
  const missingChunks: string[] = [];
  for (const [id, desc] of known) {
    if (!usedIds.has(id)) missingChunks.push(`${id} (${desc})`);
  }
  return {
    covered: missingChunks.length === 0,
    missingChunks,
    coveredCount: usedIds.size,
    totalCount: known.size,
  };
}
