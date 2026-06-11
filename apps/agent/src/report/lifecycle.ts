import {
  INCIDENT_PHASE,
  INCIDENT_PHASE_ORDER,
  INCIDENT_SEVERITY,
  INCIDENT_MITIGATION_STATUS,
  type IncidentPhase,
} from "../constants.js";

export interface PhaseRecord {
  phase: IncidentPhase;
  at: string;
  note?: string;
}

export interface IncidentLifecycle {
  phases: PhaseRecord[];
  current: IncidentPhase;
}

export function isIncidentPhase(value: string): value is IncidentPhase {
  return (INCIDENT_PHASE_ORDER as readonly string[]).includes(value);
}

export function phaseIndex(phase: IncidentPhase): number {
  return INCIDENT_PHASE_ORDER.indexOf(phase);
}

export function phaseIsAfter(a: IncidentPhase, b: IncidentPhase): boolean {
  return phaseIndex(a) > phaseIndex(b);
}

export function latestPhase(records: PhaseRecord[]): IncidentPhase {
  if (records.length === 0) return INCIDENT_PHASE.DETECTED;
  return records.reduce((latest, r) =>
    phaseIndex(r.phase) > phaseIndex(latest.phase) ? r : latest,
  ).phase;
}

export function buildLifecycle(records: PhaseRecord[]): IncidentLifecycle {
  return {
    phases: records,
    current: latestPhase(records),
  };
}

export const INCIDENT_LIFECYCLE = {
  PHASE: INCIDENT_PHASE,
  PHASE_ORDER: INCIDENT_PHASE_ORDER,
  SEVERITY: INCIDENT_SEVERITY,
  MITIGATION_STATUS: INCIDENT_MITIGATION_STATUS,
} as const;
