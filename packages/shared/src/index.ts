export const INCIDENT_SEVERITY = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  CRITICAL: "critical",
} as const;

export type IncidentSeverity = (typeof INCIDENT_SEVERITY)[keyof typeof INCIDENT_SEVERITY];

export const EVIDENCE_SOURCE = {
  FRONTEND: "frontend",
  BACKEND: "backend",
  AGENT: "agent",
  OBSERVABILITY: "observability",
  GIT: "git",
} as const;

export interface Evidence {
  source: (typeof EVIDENCE_SOURCE)[keyof typeof EVIDENCE_SOURCE];
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

export * from "./ops.js";
