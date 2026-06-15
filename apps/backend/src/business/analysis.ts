import { createDefaultAnalysisPipeline } from "@opsagent/agent";
import { z } from "zod";

export interface AnalysisResponse {
  incidentId: string;
  markdown: string;
  generatedAt: string;
  provider: string;
}

export const AnalysisResponseSchema = z.object({
  incidentId: z.string().regex(/^[0-9]{8}-[0-9]{3}$/),
  markdown: z.string().min(20),
  generatedAt: z.string(),
  provider: z.string(),
});

export interface AnalysisService {
  generate(): Promise<AnalysisResponse>;
}

export function createDefaultAnalysisService(): AnalysisService {
  const pipeline = createDefaultAnalysisPipeline();
  return {
    generate: () => pipeline.generate(),
  };
}
