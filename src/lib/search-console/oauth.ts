import { createHash, randomBytes } from "node:crypto";

/** Search Console API OAuth scope (read-only). */
export const SEARCH_CONSOLE_OAUTH_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

export const SEARCH_CONSOLE_OAUTH_STATE_COOKIE = "sc_oauth_state";
export const SEARCH_CONSOLE_OAUTH_PKCE_COOKIE = "sc_oauth_pkce";

const PKCE_MAX_AGE_SECONDS = 600;

export function getPkceCookieMaxAge(): number {
  return PKCE_MAX_AGE_SECONDS;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function normalizeRedirectUri(uri: string): string {
  return uri.trim().replace(/\/+$/, "");
}

/**
 * Must match an authorized redirect URI in Google Cloud Console **exactly** (same scheme, host, port, path).
 * Web client → "Authorized redirect URIs". `127.0.0.1` and `localhost` are different to Google.
 *
 * Env resolution: `SEARCH_CONSOLE_OAUTH_REDIRECT_URI`, else
 * `NEXT_PUBLIC_APP_URL` + `/api/search-console/oauth/callback`.
 */
export function getOAuthRedirectUri(): string {
  const explicit = process.env.SEARCH_CONSOLE_OAUTH_REDIRECT_URI?.trim();
  if (explicit) return normalizeRedirectUri(explicit);

  const base = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (base) return normalizeRedirectUri(`${base}/api/search-console/oauth/callback`);

  throw new Error(
    "Set SEARCH_CONSOLE_OAUTH_REDIRECT_URI (recommended) or NEXT_PUBLIC_APP_URL so the OAuth callback URL is known.",
  );
}

export function getSearchConsoleOAuthClientId(): string {
  return requireEnv("SEARCH_CONSOLE_CLIENT_ID");
}

function getSearchConsoleOAuthClientSecret(): string {
  return requireEnv("SEARCH_CONSOLE_CLIENT_SECRET");
}

export function generateOAuthState(): string {
  return randomBytes(32).toString("hex");
}

export function generatePkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function buildSearchConsoleAuthorizationUrl(state: string, codeChallenge: string): string {
  const params = new URLSearchParams({
    client_id: getSearchConsoleOAuthClientId(),
    redirect_uri: getOAuthRedirectUri(),
    response_type: "code",
    scope: SEARCH_CONSOLE_OAUTH_SCOPE,
    state,
    access_type: "offline",
    prompt: "consent",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
}

export interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
}

export async function exchangeAuthorizationCode(code: string, codeVerifier: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    code,
    client_id: getSearchConsoleOAuthClientId(),
    client_secret: getSearchConsoleOAuthClientSecret(),
    redirect_uri: getOAuthRedirectUri(),
    grant_type: "authorization_code",
    code_verifier: codeVerifier,
  });

  const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = (await res.json()) as TokenResponse & { error?: string; error_description?: string };

  if (!res.ok) {
    const msg = [data.error, data.error_description].filter(Boolean).join(": ") || `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return data;
}

/** Best-effort origin for post-OAuth redirects (callback route). */
export function getSafeRedirectOrigin(request: Request): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host");
  if (!host) return new URL(request.url).origin;

  let proto = request.headers.get("x-forwarded-proto");
  if (!proto) {
    const url = new URL(request.url);
    proto = url.protocol.replace(":", "") || "http";
  }
  return `${proto}://${host}`;
}
