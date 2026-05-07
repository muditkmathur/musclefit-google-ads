import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  exchangeAuthorizationCode,
  GOOGLE_ADS_OAUTH_PKCE_COOKIE,
  GOOGLE_ADS_OAUTH_STATE_COOKIE,
  getSafeRedirectOrigin,
} from "@/lib/google-ads/oauth";
import { setGoogleAdsRefreshTokenInCache } from "@/lib/google-ads/refresh-token";

export async function GET(request: Request) {
  const origin = getSafeRedirectOrigin(request);
  const campaigns = `${origin}/dashboard/campaigns`;

  const url = new URL(request.url);
  const oauthError = url.searchParams.get("error");
  const oauthDescription = url.searchParams.get("error_description");

  const jar = await cookies();
  const savedState = jar.get(GOOGLE_ADS_OAUTH_STATE_COOKIE)?.value;
  const codeVerifier = jar.get(GOOGLE_ADS_OAUTH_PKCE_COOKIE)?.value;

  jar.delete(GOOGLE_ADS_OAUTH_STATE_COOKIE);
  jar.delete(GOOGLE_ADS_OAUTH_PKCE_COOKIE);

  if (oauthError) {
    const reason = [oauthError, oauthDescription].filter(Boolean).join(": ");
    return NextResponse.redirect(
      `${campaigns}?google_ads_oauth=denied${reason ? `&google_ads_oauth_reason=${encodeURIComponent(reason)}` : ""}`,
    );
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state || !savedState || state !== savedState || !codeVerifier) {
    return NextResponse.redirect(`${campaigns}?google_ads_oauth=invalid`);
  }

  try {
    const tokens = await exchangeAuthorizationCode(code, codeVerifier);
    const refresh = tokens.refresh_token;
    if (!refresh) {
      return NextResponse.redirect(`${campaigns}?google_ads_oauth=no_refresh`);
    }
    await setGoogleAdsRefreshTokenInCache(refresh);
    return NextResponse.redirect(`${campaigns}?google_ads_oauth=success`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "token_exchange_failed";
    return NextResponse.redirect(
      `${campaigns}?google_ads_oauth=error&google_ads_oauth_reason=${encodeURIComponent(message)}`,
    );
  }
}
