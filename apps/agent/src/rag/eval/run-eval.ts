import { readFileSync } from "node:fs";
import type { GBrainClient, KnowledgeChunk } from "../../gbrain/types.js";

export interface EvalQuestion {
  id: string;
  question: string;
  expectedSourceId: string;
  category: "architecture" | "workflow" | "knowledge";
}

export interface EvalHit {
  questionId: string;
  hit: boolean;
  retrievedSourceIds: string[];
  topSourceId?: string;
}

export interface EvalReport {
  questions: number;
  hits: number;
  hitRate: number;
  results: EvalHit[];
  seed: number;
}

export interface RunEvalOptions {
  topK?: number;
  seed?: number;
  questions?: EvalQuestion[];
  questionsPath?: string;
}

export function loadQuestions(
  path: string = new URL("./questions.json", import.meta.url).pathname,
): EvalQuestion[] {
  const raw = readFileSync(path, "utf8");
  return JSON.parse(raw) as EvalQuestion[];
}

export async function runEval(
  client: GBrainClient,
  options: RunEvalOptions = {},
): Promise<EvalReport> {
  const topK = options.topK ?? 3;
  const seed = options.seed ?? 42;
  const questions = options.questions ?? loadQuestions(options.questionsPath);
  const shuffled = stableShuffle(questions, seed);

  const results: EvalHit[] = [];
  for (const q of shuffled) {
    const chunks: KnowledgeChunk[] = await client.search({
      query: q.question,
      topK,
    });
    const retrievedSourceIds = chunks.map((c) => c.sourceId);
    const topSourceId = chunks[0]?.sourceId;
    const hit = retrievedSourceIds.includes(q.expectedSourceId);
    results.push({
      questionId: q.id,
      hit,
      retrievedSourceIds,
      topSourceId,
    });
  }

  const hits = results.filter((r) => r.hit).length;
  return {
    questions: results.length,
    hits,
    hitRate: results.length === 0 ? 0 : hits / results.length,
    results,
    seed,
  };
}

function stableShuffle<T>(items: T[], seed: number): T[] {
  const arr = [...items];
  let s = seed;
  for (let i = arr.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}
