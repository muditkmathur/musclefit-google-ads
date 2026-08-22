import { GOOGLE_TOKEN_ENDPOINT, getSearchConsoleOAuthClientId } from "./oauth";
import { resolveSearchConsoleRefreshToken } from "./refresh-token";

const SEARCH_CONSOLE_API_BASE = "https://www.googleapis.com/webmasters/v3";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

interface AccessTokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

/** Exchanges the stored refresh token for a short-lived access token. */
export async function getAccessToken(): Promise<string> {
  const refreshToken = await resolveSearchConsoleRefreshToken();
  const body = new URLSearchParams({
    client_id: getSearchConsoleOAuthClientId(),
    client_secret: requireEnv("SEARCH_CONSOLE_CLIENT_SECRET"),
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = (await res.json()) as AccessTokenResponse;

  if (!res.ok || !data.access_token) {
    const msg = [data.error, data.error_description].filter(Boolean).join(": ") || `HTTP ${res.status}`;
    throw new Error(`Failed to refresh Search Console access token: ${msg}`);
  }

  return data.access_token;
}

export interface SearchConsoleSite {
  siteUrl: string;
  permissionLevel: string;
}

/** Lists all sites/properties the authorized account can access in Search Console. */
export async function listSearchConsoleSites(): Promise<SearchConsoleSite[]> {
  const accessToken = await getAccessToken();

  const res = await fetch(`${SEARCH_CONSOLE_API_BASE}/sites`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Search Console sites.list failed: HTTP ${res.status} ${text}`);
  }

  const data = (await res.json()) as { siteEntry?: SearchConsoleSite[] };
  return data.siteEntry ?? [];
}

/**
 * Resolves the site to query: `SEARCH_CONSOLE_SITE_URL` env var if set, else the sole site
 * returned by `sites.list`. Throws if there are zero or multiple sites and none was specified.
 */
export async function resolveSearchConsoleSiteUrl(): Promise<string> {
  const fromEnv = process.env.SEARCH_CONSOLE_SITE_URL?.trim();
  if (fromEnv) return fromEnv;

  const sites = await listSearchConsoleSites();
  if (sites.length === 1) return sites[0].siteUrl;
  if (sites.length === 0) {
    throw new Error("No Search Console sites found for this account.");
  }
  throw new Error(
    `Multiple Search Console sites found (${sites.map((s) => s.siteUrl).join(", ")}); set SEARCH_CONSOLE_SITE_URL or pass siteUrl explicitly.`,
  );
}
