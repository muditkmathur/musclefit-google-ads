import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  buildSearchConsoleAuthorizationUrl,
  generateOAuthState,
  generatePkcePair,
  getPkceCookieMaxAge,
  SEARCH_CONSOLE_OAUTH_PKCE_COOKIE,
  SEARCH_CONSOLE_OAUTH_STATE_COOKIE,
} from "@/lib/search-console/oauth";

function cookieOptions() {
  const secure = process.env.NODE_ENV === "production";
  return {
    httpOnly: true as const,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: getPkceCookieMaxAge(),
  };
}

export async function GET() {
  try {
    const state = generateOAuthState();
    const { verifier, challenge } = generatePkcePair();

    const jar = await cookies();
    jar.set(SEARCH_CONSOLE_OAUTH_STATE_COOKIE, state, cookieOptions());
    jar.set(SEARCH_CONSOLE_OAUTH_PKCE_COOKIE, verifier, cookieOptions());

    const location = buildSearchConsoleAuthorizationUrl(state, challenge);
    return NextResponse.redirect(location);
  } catch (err) {
    const message = err instanceof Error ? err.message : "OAuth configuration error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
