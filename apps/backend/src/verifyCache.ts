import { randomUUID } from "node:crypto";

import {
  CACHE_KEY,
  CACHE_VERIFICATION,
} from "./cache/constants";
import {
  closeCacheClient,
  getCacheClient,
} from "./cache/index";

const cache = await getCacheClient();
const key = `${CACHE_KEY.VERIFICATION_PREFIX}:${randomUUID()}`;

try {
  await cache.set(key, CACHE_VERIFICATION.VALUE);
  const storedValue = await cache.get(key);

  if (storedValue !== CACHE_VERIFICATION.VALUE) {
    throw new Error("Cache verification returned an unexpected value.");
  }

  console.log(JSON.stringify({
    success: true,
    key,
    value: storedValue,
  }));
} finally {
  await cache.del(key);
  await closeCacheClient();
}
