export const MODEL_PROVIDER = {
  OPENAI: "openai",
  DEEPSEEK: "deepseek",
  ALIBABA: "alibaba",
  OLLAMA: "ollama",
  MOCK: "mock",
} as const;

export type ModelProvider = (typeof MODEL_PROVIDER)[keyof typeof MODEL_PROVIDER];

export const INCIDENT_PHASE = {
  DETECTED: "detected",
  DIAGNOSED: "diagnosed",
  MITIGATED: "mitigated",
  REVIEWED: "reviewed",
} as const;

export type IncidentPhase =
  (typeof INCIDENT_PHASE)[keyof typeof INCIDENT_PHASE];

export const INCIDENT_PHASE_ORDER: readonly IncidentPhase[] = [
  INCIDENT_PHASE.DETECTED,
  INCIDENT_PHASE.DIAGNOSED,
  INCIDENT_PHASE.MITIGATED,
  INCIDENT_PHASE.REVIEWED,
] as const;

export const INCIDENT_SEVERITY = {
  P0: "P0",
  P1: "P1",
  P2: "P2",
} as const;

export type IncidentSeverity =
  (typeof INCIDENT_SEVERITY)[keyof typeof INCIDENT_SEVERITY];

export const INCIDENT_MITIGATION_STATUS = {
  MITIGATED: "mitigated",
  UNMITIGATED: "unmitigated",
} as const;

export type IncidentMitigationStatus =
  (typeof INCIDENT_MITIGATION_STATUS)[keyof typeof INCIDENT_MITIGATION_STATUS];
