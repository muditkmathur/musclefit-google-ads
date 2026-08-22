import { CACHE_TTL_SECONDS, fileStoreGet, fileStoreSet } from "./file-store";
import { createHash } from "node:crypto";

const KEY_PREFIX = "ga:";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

export function buildCacheKey(namespace: string, input: JsonValue | Record<string, unknown>): string {
  const hash = createHash("sha1").update(stableStringify(input)).digest("hex");
  return `${KEY_PREFIX}${namespace}:${hash}`;
}

export async function getOrSetJson<T>(
  key: string,
  loader: () => Promise<T>,
  ttlSeconds: number = CACHE_TTL_SECONDS,
  options: { forceRefresh?: boolean } = {},
): Promise<T> {
  const forceRefresh = options.forceRefresh === true;

  if (!forceRefresh) {
    try {
      const hit = await fileStoreGet(key);
      if (hit) {
        return JSON.parse(hit) as T;
      }
    } catch (err) {
      console.warn("[cache] File cache read failed; falling back to loader.", err);
    }
  }

  const value = await loader();

  try {
    await fileStoreSet(key, JSON.stringify(value), ttlSeconds);
  } catch (err) {
    console.warn("[cache] File cache write failed; result not cached.", err);
  }

  return value;
}
