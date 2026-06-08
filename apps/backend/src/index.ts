import { serve } from "@hono/node-server";
import { env } from "@opsagent/env/server";

import { createApp } from "./app";
import { OPENTELEMETRY } from "./observability/constants";
import { createRuntimeLogSink } from "./observability/logger";
import { initializeTelemetry } from "./observability/tracing";

const logSink = createRuntimeLogSink(env.LOG_FILE_PATH);
const telemetry = initializeTelemetry(
  env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
  env.OTEL_TRACES_ENABLED,
);

for (const signal of Object.values(OPENTELEMETRY.SIGNAL)) {
  process.once(signal, () => {
    void telemetry.shutdown().finally(() => process.exit(0));
  });
}

serve(
  {
    fetch: createApp(undefined, undefined, logSink).fetch,
    port: env.PORT,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  },
);
