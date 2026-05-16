# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev              # Next.js dev server
pnpm build            # Production build
pnpm typecheck        # TypeScript type check (no emit)
pnpm check            # Biome lint + format check
pnpm check:fix        # Biome lint + format auto-fix
pnpm lint             # Biome lint only
pnpm format           # Biome format (write)
```

**CLI scripts** (require `.env` to be populated):
```bash
pnpm report [days] [--daily]   # Campaign summary report (default: 30 days)
pnpm search-terms              # Search terms report
pnpm ngram-analysis            # N-gram frequency analysis on search terms
pnpm campaign-keywords         # Keyword list for a campaign
pnpm change-history            # Account change history (last 30 days)
```

## Architecture

### What this is
A Next.js dashboard and CLI toolset for managing and reporting on Google Ads campaigns for muscle fit. All pages under the **Google Ads** sidebar group are active and backed by real API calls: Campaigns, Keyword Analysis, Ad Groups, Schedule (hour×day heatmap), Devices, Quality Score, and Change History. The **Pages** and **Legacy** sidebar groups are stubs or old v1 dashboards kept for reference.

### Request flow
```
UI Component
  → Server Action (src/app/actions/google-ads.ts)
    → lib/google-ads/*.ts          ← business logic / GAQL queries
      → lib/cache/query-cache.ts   ← Redis cache-aside (optional)
        → google-ads-api client    ← actual API call
```

All server actions return `ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }`. Error messages are normalized (invalid_grant → human-readable OAuth hint, missing env vars surface as-is).

### Google Ads API layer (`src/lib/google-ads/`)
- **`client.ts`** — creates and caches the `google-ads-api` `Customer` object per refresh token.
- **`refresh-token.ts`** — resolves the refresh token: Redis key `ga:oauth:refresh_token` takes priority over `GOOGLE_ADS_REFRESH_TOKEN` env var. Updating via `setGoogleAdsRefreshTokenInCache()` also invalidates the in-memory customer cache.
- **`oauth.ts`** — PKCE + OAuth2 flow helpers; authorize route is `/api/google-ads/oauth/authorize`, callback is `/api/google-ads/oauth/callback`.
- **`report.ts`** — campaign summary, daily breakdown (DoD deltas), and demographics (age_range_view / gender_view) reports.
- **`search-terms.ts`**, **`ngram-analysis.ts`**, **`keyword-analysis.ts`**, **`campaign-keywords.ts`** — search term and keyword analysis modules.
- **`ad-group-report.ts`**, **`device-performance.ts`**, **`quality-score.ts`**, **`schedule-performance.ts`**, **`change-history.ts`** — per-dimension reports matching the sidebar pages of the same name.

All monetary values from the API are in micros; divide by `1_000_000` to get INR (₹).

### Caching (`src/lib/cache/`)
- Redis is optional. If `REDIS_HOST` is absent the app runs fine without caching.
- `getOrSetJson(key, loader, ttlSeconds, { forceRefresh })` is the single cache-aside primitive.
- Cache keys are built via `buildCacheKey(namespace, input)` — SHA-1 hash of a stable-stringified input object, prefixed `ga:`.
- Default TTL is 1 hour (`CACHE_TTL_SECONDS = 3600`).
- Pass `forceRefresh: true` on server actions/report functions to bypass the cache.

### UI preferences
Zustand vanilla store (`src/stores/preferences/`) holds theme, font, sidebar variant, etc. It is hydrated server-side via `PreferencesProvider` and persisted client-side. The `isSynced` flag gates whether stored preferences override default props.

### Route structure
- `(main)` route group — the whole app (dashboard + auth pages)
- `(external)` — marketing/landing page
- `(legacy)` route group inside dashboard — old v1 dashboards, kept for reference
- `src/components/ui/` — shadcn/ui components; **excluded from Biome linting**

### Path alias
`@/` resolves to `src/`.

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `GOOGLE_ADS_CLIENT_ID` | Yes | OAuth2 client ID |
| `GOOGLE_ADS_CLIENT_SECRET` | Yes | OAuth2 client secret |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | Yes | Google Ads developer token |
| `GOOGLE_ADS_CUSTOMER_ID` | Yes | Google Ads customer (account) ID |
| `GOOGLE_ADS_REFRESH_TOKEN` | Fallback | Used if no token in Redis |
| `NEXT_PUBLIC_APP_URL` | Yes | Base URL, used to build OAuth redirect URI |
| `GOOGLE_ADS_OAUTH_REDIRECT_URI` | Alt | Explicit redirect URI (overrides NEXT_PUBLIC_APP_URL) |
| `REDIS_HOST` | No | Enables query caching; app works without it |
| `REDIS_PORT` | No | Defaults to 6379 |
| `REDIS_DB` | No | Defaults to 0 |
| `REDIS_PASSWORD` | No | |

## Biome (lint/format)
- 2-space indent, 120-char line width, double quotes, trailing commas.
- Import order enforced: `react` → `next/**` → packages → `@/` aliases → relative paths.
- Notable enforced rules: `noImportCycles`, `noFloatingPromises`, `noMisusedPromises`, `useNullishCoalescing`, `useSortedClasses` (Tailwind).
- `src/components/ui` is excluded from all Biome checks.
- File naming convention is enforced (`useFilenamingConvention`).

## Scripts config
Scripts live in `scripts/` and use `tsx` with `dotenv/config` to load `.env`. They share the same `src/lib/google-ads/` modules as the Next.js app but run outside Next's server context.
