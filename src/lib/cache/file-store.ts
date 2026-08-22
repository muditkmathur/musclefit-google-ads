import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const CACHE_DIR = path.join(process.cwd(), "data", "cache");

export const CACHE_TTL_SECONDS = 60 * 60;

interface StoredEntry {
  value: string;
  expiresAt: number | null;
}

function entryPath(key: string): string {
  const hash = createHash("sha1").update(key).digest("hex");
  return path.join(CACHE_DIR, `${hash}.json`);
}

/** Reads a value previously written by `fileStoreSet`, returning null if missing or expired. */
export async function fileStoreGet(key: string): Promise<string | null> {
  try {
    const raw = await readFile(entryPath(key), "utf8");
    const entry = JSON.parse(raw) as StoredEntry;
    if (entry.expiresAt !== null && entry.expiresAt < Date.now()) {
      await rm(entryPath(key), { force: true });
      return null;
    }
    return entry.value;
  } catch {
    return null;
  }
}

/** Persists a value to disk under `data/cache/`, optionally expiring after `ttlSeconds`. */
export async function fileStoreSet(key: string, value: string, ttlSeconds?: number): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  const entry: StoredEntry = {
    value,
    expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
  };
  await writeFile(entryPath(key), JSON.stringify(entry), "utf8");
}
