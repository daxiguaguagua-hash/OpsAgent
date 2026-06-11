export type SyncMode = "on_demand" | "weekly" | "excluded";

export interface GBrainSource {
  id: string;
  path: string;
  description: string;
  searchWeight: number;
  syncMode: SyncMode;
}

export interface KnowledgeChunk {
  id: string;
  sourceId: string;
  path: string;
  title: string;
  content: string;
  score: number;
}

export interface SearchOptions {
  query: string;
  sourceId?: string;
  topK?: number;
}

export interface GBrainClient {
  search(options: SearchOptions): Promise<KnowledgeChunk[]>;
  syncSource(sourceId: string): Promise<{ synced: number }>;
  listSources(): Promise<GBrainSource[]>;
}
