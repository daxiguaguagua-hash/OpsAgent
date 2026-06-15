import { createOpsAgent } from "./agents/index.js";
import { createModel, getModelConfigFromEnv } from "./model-provider.js";

async function main() {
  const modelConfig = getModelConfigFromEnv();
  const model = createModel(modelConfig);

  const opsAgent = createOpsAgent({ model });

  console.log(
    `[Agent] ${opsAgent.name} 启动，provider: ${modelConfig.provider || "mock"}`,
  );

  const response = await opsAgent.generate("你好，请用一句话介绍你自己。");
  console.log(`[Agent 回复]\n${response.text}`);
}

main().catch((error) => {
  console.error("Agent initialization failed:", error);
  process.exit(1);
});
