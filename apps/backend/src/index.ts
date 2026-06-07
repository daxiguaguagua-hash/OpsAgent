import { serve } from "@hono/node-server";
import { env } from "@opsagent/env/server";

import { createApp } from "./app";
import { createRuntimeLogSink } from "./observability/logger";

const logSink = createRuntimeLogSink(env.LOG_FILE_PATH);

serve(
  {
    fetch: createApp(undefined, undefined, logSink).fetch,
    port: env.PORT,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  },
);
