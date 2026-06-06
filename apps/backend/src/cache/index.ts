import { env } from "@opsagent/env/server";
import { createClient } from "redis";

type RedisClient = ReturnType<typeof createClient>;

let cacheClient: RedisClient | undefined;

export async function getCacheClient(): Promise<RedisClient> {
  cacheClient ??= createClient({
    url: env.REDIS_URL,
  });

  if (!cacheClient.isOpen) {
    await cacheClient.connect();
  }

  return cacheClient;
}

export async function closeCacheClient(): Promise<void> {
  if (cacheClient?.isOpen) {
    await cacheClient.quit();
  }
}
