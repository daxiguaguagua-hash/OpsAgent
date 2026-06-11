import { createOpsAgent } from "./agents/index.js";
import { createModel, getModelConfigFromEnv } from "./model-provider.js";
import type { IncidentReport } from "@opsagent/shared";
import { INCIDENT_SEVERITY, EVIDENCE_SOURCE } from "@opsagent/shared";

async function main() {
  // M3-02: Model provider abstraction (openai/ollama/mock)
  const modelConfig = getModelConfigFromEnv();
  const model = createModel(modelConfig);

  const opsAgent = createOpsAgent({
    model,
  });

  const report: IncidentReport = {
    id: "m3-01-mastra-init",
    severity: INCIDENT_SEVERITY.LOW,
    summary: "Mastra agent framework initialized successfully.",
    evidence: [
      {
        source: EVIDENCE_SOURCE.AGENT,
        message: `Agent name: ${opsAgent.name}`,
      },
    ],
    recommendations: [
      {
        title: "Proceed to M3-02",
        description: "Implement model provider abstraction (openai/ollama/mock).",
      },
    ],
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error("Agent initialization failed:", error);
  process.exit(1);
});
