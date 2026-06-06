import { serve } from "@hono/node-server";
import { env } from "@opsagent/env/server";

import { createApp } from "./app";

serve(
  {
    fetch: createApp().fetch,
    port: env.PORT,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  },
);
