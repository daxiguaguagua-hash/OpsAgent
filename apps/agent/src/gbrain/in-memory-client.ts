import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type {
  GBrainClient,
  GBrainSource,
  KnowledgeChunk,
  SearchOptions,
} from "./types.js";
import { findSource, listSyncable, loadSources } from "./sources.js";

export interface InMemoryClientOptions {
  sourcesPath?: string;
  repoRoot?: string;
}

export class InMemoryGBrainClient implements GBrainClient {
  private readonly sources: GBrainSource[];
  private readonly repoRoot: string;
  private chunks: KnowledgeChunk[] = [];

  constructor(options: InMemoryClientOptions = {}) {
    this.sources = loadSources(options.sourcesPath);
    this.repoRoot = options.repoRoot ?? process.cwd();
    for (const source of listSyncable(this.sources)) {
      this.ingestSource(source);
    }
  }

  async listSources(): Promise<GBrainSource[]> {
    return this.sources;
  }

  async syncSource(sourceId: string): Promise<{ synced: number }> {
    const source = findSource(this.sources, sourceId);
    if (!source) {
      throw new Error(`unknown GBrain source: ${sourceId}`);
    }
    if (source.syncMode === "excluded") {
      return { synced: 0 };
    }
    this.chunks = this.chunks.filter((c) => c.sourceId !== sourceId);
    const before = this.chunks.length;
    this.ingestSource(source);
    return { synced: this.chunks.length - before };
  }

  async search(options: SearchOptions): Promise<KnowledgeChunk[]> {
    const { query, sourceId, topK = 5 } = options;
    if (!query || query.trim().length === 0) {
      return [];
    }
    const needle = query.toLowerCase();
    let candidates = this.chunks;
    if (sourceId) {
      if (!findSource(this.sources, sourceId)) {
        throw new Error(`unknown GBrain source: ${sourceId}`);
      }
      candidates = candidates.filter((c) => c.sourceId === sourceId);
    }
    const scored = candidates
      .map((chunk) => ({
        chunk,
        score: this.scoreChunk(chunk, needle),
      }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
    return scored.map((row) => ({ ...row.chunk, score: row.score }));
  }

  private ingestSource(source: GBrainSource) {
    const dir = join(this.repoRoot, source.path);
    let files: string[] = [];
    try {
      files = this.walk(dir);
    } catch {
      return;
    }
    for (const file of files) {
      if (!file.endsWith(".md")) continue;
      try {
        const content = readFileSync(file, "utf8");
        const title = this.extractTitle(content) ?? file;
        this.chunks.push({
          id: `${source.id}:${file}`,
          sourceId: source.id,
          path: file.replace(this.repoRoot, ""),
          title,
          content,
          score: 0,
        });
      } catch {
        // ignore unreadable files
      }
    }
  }

  private walk(dir: string): string[] {
    const out: string[] = [];
    let entries: string[] = [];
    try {
      entries = readdirSync(dir, { withFileTypes: false }) as string[];
    } catch {
      return out;
    }
    for (const name of entries) {
      const full = join(dir, name as string);
      let stat;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        out.push(...this.walk(full));
      } else if (stat.isFile()) {
        out.push(full);
      }
    }
    return out;
  }

  private extractTitle(content: string): string | undefined {
    const match = /^#\s+(.+)$/m.exec(content);
    return match ? match[1]?.trim() : undefined;
  }

  private scoreChunk(chunk: KnowledgeChunk, needle: string): number {
    const source = findSource(this.sources, chunk.sourceId);
    const weight = source?.searchWeight ?? 0;
    const hay = `${chunk.title}\n${chunk.content}`.toLowerCase();
    const terms = needle.split(/\s+/).filter(Boolean);
    if (terms.length === 0) return 0;
    const hits = terms.filter((t) => hay.includes(t)).length;
    return (hits / terms.length) * weight;
  }
}
