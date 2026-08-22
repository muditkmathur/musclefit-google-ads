import { fileStoreGet, fileStoreSet } from "@/lib/cache/file-store";

/** File-store key for the offline refresh token (long-lived). Prefer this over env when set — allows rotation without redeploy. */
export const SEARCH_CONSOLE_REFRESH_TOKEN_STORE_KEY = "sc:oauth:refresh_token";

/**
 * Resolves the Search Console OAuth refresh token.
 *
 * Order: file store (`SEARCH_CONSOLE_REFRESH_TOKEN_STORE_KEY`) if present, else `SEARCH_CONSOLE_REFRESH_TOKEN` env.
 */
export async function resolveSearchConsoleRefreshToken(): Promise<string> {
  const fromStore = await fileStoreGet(SEARCH_CONSOLE_REFRESH_TOKEN_STORE_KEY);
  if (fromStore?.trim()) return fromStore.trim();

  const fromEnv = process.env.SEARCH_CONSOLE_REFRESH_TOKEN?.trim();
  if (fromEnv) return fromEnv;

  throw new Error(
    "No Search Console refresh token: visit /api/search-console/oauth/authorize or set SEARCH_CONSOLE_REFRESH_TOKEN.",
  );
}

/** Persist refresh token to disk for runtime updates (e.g. after an OAuth callback). */
export async function setSearchConsoleRefreshTokenInCache(token: string): Promise<void> {
  const trimmed = token.trim();
  if (!trimmed) {
    throw new Error("Refresh token must be non-empty");
  }

  await fileStoreSet(SEARCH_CONSOLE_REFRESH_TOKEN_STORE_KEY, trimmed);
}
