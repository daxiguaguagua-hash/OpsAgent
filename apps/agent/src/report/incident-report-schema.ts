import { z } from "zod";
import {
  INCIDENT_PHASE,
  INCIDENT_SEVERITY,
  INCIDENT_MITIGATION_STATUS,
} from "../constants.js";

export const EvidenceMetricSchema = z.object({
  query: z.string(),
  results: z.array(z.record(z.string(), z.unknown())),
  conclusion: z.string(),
});

export const EvidenceLogEntrySchema = z.object({
  timestamp: z.string(),
  line: z.string(),
  labels: z.record(z.string(), z.string()),
  detectedLevel: z.string().optional(),
});

export const EvidenceLogsSchema = z.object({
  query: z.string(),
  entries: z.array(EvidenceLogEntrySchema),
  traceIds: z.array(z.string()),
});

export const EvidenceTraceSpanSchema = z.object({
  spanId: z.string(),
  parentSpanId: z.string().optional(),
  operationName: z.string(),
  serviceName: z.string(),
  durationMs: z.number(),
  status: z.enum([
    INCIDENT_PHASE ? "OK" : "OK",
    "ERROR",
    "UNSET",
  ] as unknown as ["OK", "ERROR", "UNSET"]),
  attributes: z.record(z.string(), z.string()).optional(),
});

export const EvidenceTraceSchema = z.object({
  traceId: z.string(),
  rootService: z.string(),
  durationMs: z.number(),
  spans: z.array(EvidenceTraceSpanSchema),
});

export const EvidenceGitCommitSchema = z.object({
  hash: z.string(),
  author: z.string(),
  date: z.string(),
  message: z.string(),
});

export const EvidenceGitContextSchema = z.object({
  path: z.string(),
  recentCommits: z.array(EvidenceGitCommitSchema),
  suspiciousChange: z.string().optional(),
});

export const EvidenceSchema = z.object({
  metrics: z.array(EvidenceMetricSchema),
  logs: EvidenceLogsSchema,
  traces: z.array(EvidenceTraceSchema),
  gitContext: z.array(EvidenceGitContextSchema),
});

export const SummarySchema = z.object({
  detectedAt: z.string(),
  phase: z.enum([
    INCIDENT_PHASE.DETECTED,
    INCIDENT_PHASE.DIAGNOSED,
    INCIDENT_PHASE.MITIGATED,
    INCIDENT_PHASE.REVIEWED,
  ] as const),
  impact: z.string(),
  severity: z.enum([
    INCIDENT_SEVERITY.P0,
    INCIDENT_SEVERITY.P1,
    INCIDENT_SEVERITY.P2,
  ] as const),
  mitigationStatus: z.enum([
    INCIDENT_MITIGATION_STATUS.MITIGATED,
    INCIDENT_MITIGATION_STATUS.UNMITIGATED,
  ] as const),
});

export const RecommendationsSchema = z.object({
  shortTerm: z.string(),
  longTerm: z.string(),
  prevention: z.string(),
});

export const ReviewSchema = z.object({
  reviewer: z.string(),
  conclusion: z.enum(["adopted", "partially_adopted", "rejected"] as const),
  comments: z.string(),
});

export const PhaseRecordSchema = z.object({
  phase: z.enum([
    INCIDENT_PHASE.DETECTED,
    INCIDENT_PHASE.DIAGNOSED,
    INCIDENT_PHASE.MITIGATED,
    INCIDENT_PHASE.REVIEWED,
  ] as const),
  at: z.string(),
  note: z.string().optional(),
});

export const LifecycleSchema = z.object({
  phases: z.array(PhaseRecordSchema),
  current: z.enum([
    INCIDENT_PHASE.DETECTED,
    INCIDENT_PHASE.DIAGNOSED,
    INCIDENT_PHASE.MITIGATED,
    INCIDENT_PHASE.REVIEWED,
  ] as const),
});

export const IncidentReportSchema = z.object({
  incidentId: z.string().regex(/^[0-9]{8}-[0-9]{3}$/),
  summary: SummarySchema,
  evidence: EvidenceSchema,
  rootCause: z.string().min(20),
  recommendations: RecommendationsSchema,
  review: ReviewSchema,
  lifecycle: LifecycleSchema.optional(),
});

export type IncidentReport = z.infer<typeof IncidentReportSchema>;
export type IncidentSummary = z.infer<typeof SummarySchema>;
export type IncidentEvidence = z.infer<typeof EvidenceSchema>;
export type IncidentRecommendations = z.infer<typeof RecommendationsSchema>;
export type IncidentReview = z.infer<typeof ReviewSchema>;
