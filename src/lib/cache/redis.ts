import Redis, { type Redis as RedisClient } from "ioredis";

let cachedClient: RedisClient | null = null;
let connectionFailed = false;
let warnedDisabled = false;

function logOnce(message: string, error?: unknown): void {
  if (warnedDisabled) return;
  warnedDisabled = true;
  if (error) {
    console.warn(message, error);
  } else {
    console.warn(message);
  }
}

export function getRedis(): RedisClient | null {
  if (connectionFailed) return null;
  if (cachedClient) return cachedClient;

  const host = process.env.REDIS_HOST?.trim();
  if (!host) {
    logOnce("[cache] REDIS_HOST not set; query caching disabled.");
    connectionFailed = true;
    return null;
  }

  const portEnv = process.env.REDIS_PORT?.trim();
  const portParsed = portEnv ? Number.parseInt(portEnv, 10) : Number.NaN;
  const port = Number.isInteger(portParsed) && portParsed > 0 ? portParsed : 6379;

  const dbEnv = process.env.REDIS_DB?.trim();
  const dbParsed = dbEnv ? Number.parseInt(dbEnv, 10) : Number.NaN;
  const db = Number.isInteger(dbParsed) && dbParsed >= 0 ? dbParsed : 0;

  const password = process.env.REDIS_PASSWORD?.trim() || undefined;

  try {
    const client = new Redis({
      host,
      port,
      db,
      password,
      lazyConnect: false,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: (times) => {
        if (times > 3) return null;
        return Math.min(times * 200, 1000);
      },
    });

    client.on("error", (err) => {
      logOnce("[cache] Redis client error; query caching will fail-open.", err);
    });

    cachedClient = client;
    return cachedClient;
  } catch (err) {
    logOnce("[cache] Failed to create Redis client; query caching disabled.", err);
    connectionFailed = true;
    return null;
  }
}

export const CACHE_TTL_SECONDS = 60 * 60;
