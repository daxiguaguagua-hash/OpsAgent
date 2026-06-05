import { env } from "@opsagent/env/server";
import type { IncidentReport } from "@opsagent/shared";

const report: IncidentReport = {
  id: "m0-smoke-incident",
  severity: "low",
  summary: "OpsAgent agent service is ready for the first AI Ops loop.",
  evidence: [
    {
      source: "agent",
      message: `MODEL_PROVIDER=${env.MODEL_PROVIDER}`,
    },
  ],
  recommendations: [
    {
      title: "Keep M0 focused",
      description: "Use mock analysis until observability data sources are wired.",
    },
  ],
};

console.log(JSON.stringify(report, null, 2));

