export type IncidentSeverity = "low" | "medium" | "high" | "critical";

export interface Evidence {
  source: "frontend" | "backend" | "agent" | "observability" | "git";
  message: string;
  metadata?: Record<string, string>;
}

export interface Recommendation {
  title: string;
  description: string;
  filePath?: string;
  line?: number;
}

export interface IncidentReport {
  id: string;
  severity: IncidentSeverity;
  summary: string;
  evidence: Evidence[];
  recommendations: Recommendation[];
}

