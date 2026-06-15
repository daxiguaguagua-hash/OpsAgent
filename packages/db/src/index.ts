import { env } from "@opsagent/env";
import { drizzle } from "drizzle-orm/node-postgres";

import * as schema from "./schema/index.js";

export function createDb() {
  return drizzle(env.DATABASE_URL, { schema });
}

export const db = createDb();
