import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  exchangeAuthorizationCode,
  getSafeRedirectOrigin,
  SEARCH_CONSOLE_OAUTH_PKCE_COOKIE,
  SEARCH_CONSOLE_OAUTH_STATE_COOKIE,
} from "@/lib/search-console/oauth";
import { setSearchConsoleRefreshTokenInCache } from "@/lib/search-console/refresh-token";

export async function GET(request: Request) {
  const origin = getSafeRedirectOrigin(request);
  const home = `${origin}/`;

  const url = new URL(request.url);
  const oauthError = url.searchParams.get("error");
  const oauthDescription = url.searchParams.get("error_description");

  const jar = await cookies();
  const savedState = jar.get(SEARCH_CONSOLE_OAUTH_STATE_COOKIE)?.value;
  const codeVerifier = jar.get(SEARCH_CONSOLE_OAUTH_PKCE_COOKIE)?.value;

  jar.delete(SEARCH_CONSOLE_OAUTH_STATE_COOKIE);
  jar.delete(SEARCH_CONSOLE_OAUTH_PKCE_COOKIE);

  if (oauthError) {
    const reason = [oauthError, oauthDescription].filter(Boolean).join(": ");
    return NextResponse.redirect(
      `${home}?search_console_oauth=denied${reason ? `&search_console_oauth_reason=${encodeURIComponent(reason)}` : ""}`,
    );
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state || !savedState || state !== savedState || !codeVerifier) {
    return NextResponse.redirect(`${home}?search_console_oauth=invalid`);
  }

  try {
    const tokens = await exchangeAuthorizationCode(code, codeVerifier);
    const refresh = tokens.refresh_token;
    if (!refresh) {
      return NextResponse.redirect(`${home}?search_console_oauth=no_refresh`);
    }
    await setSearchConsoleRefreshTokenInCache(refresh);
    return NextResponse.redirect(`${home}?search_console_oauth=success`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "token_exchange_failed";
    return NextResponse.redirect(
      `${home}?search_console_oauth=error&search_console_oauth_reason=${encodeURIComponent(message)}`,
    );
  }
}
