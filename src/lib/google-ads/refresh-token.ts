import { fileStoreGet, fileStoreSet } from "@/lib/cache/file-store";

import { resetGoogleAdsCustomerCache } from "./customer-cache";

/** File-store key for the offline refresh token (long-lived). Prefer this over env when set — allows rotation without redeploy. */
export const GOOGLE_ADS_REFRESH_TOKEN_STORE_KEY = "ga:oauth:refresh_token";

/**
 * Resolves the Google Ads OAuth refresh token.
 *
 * Order: file store (`GOOGLE_ADS_REFRESH_TOKEN_STORE_KEY`) if present, else `GOOGLE_ADS_REFRESH_TOKEN` env.
 *
 * **You cannot mint a new refresh token without a user going through the OAuth consent screen** (with
 * `access_type=offline` and usually `prompt=consent` the first time). The Google client library already
 * exchanges this refresh token for short-lived access tokens on each request — that part is already “dynamic”.
 */
export async function resolveGoogleAdsRefreshToken(): Promise<string> {
  const fromStore = await fileStoreGet(GOOGLE_ADS_REFRESH_TOKEN_STORE_KEY);
  if (fromStore?.trim()) return fromStore.trim();

  const fromEnv = process.env.GOOGLE_ADS_REFRESH_TOKEN?.trim();
  if (fromEnv) return fromEnv;

  throw new Error(
    "No Google Ads refresh token: connect Google Ads under Dashboard → Campaigns (OAuth) or set GOOGLE_ADS_REFRESH_TOKEN.",
  );
}

/**
 * Persist refresh token to disk for runtime updates (e.g. after an OAuth callback).
 * Invalidates the in-memory Google Ads client so the next `getCustomer()` uses this token.
 */
export async function setGoogleAdsRefreshTokenInCache(token: string): Promise<void> {
  const trimmed = token.trim();
  if (!trimmed) {
    throw new Error("Refresh token must be non-empty");
  }

  await fileStoreSet(GOOGLE_ADS_REFRESH_TOKEN_STORE_KEY, trimmed);
  resetGoogleAdsCustomerCache();
}
