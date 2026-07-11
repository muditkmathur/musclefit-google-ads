# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev              # Next.js dev server
pnpm build            # Production build
pnpm start            # Run production build
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

There is **no test suite** — no testing framework is installed.

## Architecture

### What this is
A Next.js dashboard and CLI toolset for managing and reporting on Google Ads campaigns for muscle fit. All pages under the **Google Ads** sidebar group are active and backed by real API calls: Campaigns, Keyword Analysis, Ad Groups, Schedule (hour×day heatmap), Devices, Quality Score, Landing pages, Keyword ↔ Search terms, Ad performance, Auction insights, and Change history. The **Pages** sidebar group has auth page stubs (login/register v1/v2). The **Legacy** sidebar group contains old v1 dashboards kept for reference.

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
- **`client.ts`** — creates the `google-ads-api` `Customer` object per refresh token.
- **`customer-cache.ts`** — module-level in-memory singleton that caches the `Customer` object keyed by refresh token. Invalidated by `resetGoogleAdsCustomerCache()` when the token changes via OAuth flow.
- **`refresh-token.ts`** — resolves the refresh token: Redis key `ga:oauth:refresh_token` takes priority over `GOOGLE_ADS_REFRESH_TOKEN` env var. Updating via `setGoogleAdsRefreshTokenInCache()` also invalidates the in-memory customer cache.
- **`oauth.ts`** — PKCE + OAuth2 flow helpers; authorize route is `/api/google-ads/oauth/authorize`, callback is `/api/google-ads/oauth/callback`.
- **`report.ts`** — campaign summary, daily breakdown (DoD deltas), and demographics (age_range_view / gender_view) reports.
- **`search-terms.ts`**, **`ngram-analysis.ts`**, **`keyword-analysis.ts`**, **`campaign-keywords.ts`** — search term and keyword analysis modules.
- **`ad-group-report.ts`**, **`device-performance.ts`**, **`quality-score.ts`**, **`schedule-performance.ts`**, **`change-history.ts`** — per-dimension reports matching the sidebar pages of the same name.
- **`landing-page-report.ts`** — `landing_page_view` aggregated by unexpanded final URL with waste flag and ad-group attribution.
- **`keyword-search-term-map.ts`** — `search_term_view` segmented by `segments.keyword.info.text` to attribute each query to the triggering keyword, with intent-mismatch / broad-trigger / waste flags. DSA traffic is excluded by the keyword segment.
- **`ad-performance.ts`** — `ad_group_ad` + `ad_group_ad_asset_view` for per-ad metrics, RSA ad strength, and per-asset (headline / description) performance labels.
- **`auction-insights.ts`** — `keyword_view` with `segments.auction_insight_domain` to surface competitor domains; pre-aggregated per campaign (impression-weighted) plus raw keyword × domain rows.

All monetary values from the API are in micros; divide by `1_000_000` to get INR (₹).

All domain TypeScript types are centralized in **`src/types/google-ads.ts`** — the canonical reference when adding new report shapes.

### Caching (`src/lib/cache/`)
There are two caching layers:
1. **In-memory**: `customer-cache.ts` holds a module-level `Customer` singleton, keyed by refresh token. Survives the process lifetime; reset on token rotation.
2. **Redis cache-aside**: `query-cache.ts` wraps report calls. Redis is optional — if `REDIS_HOST` is absent the app runs fine without it.

`getOrSetJson(key, loader, ttlSeconds, { forceRefresh })` is the single cache-aside primitive. Cache keys are built via `buildCacheKey(namespace, input)` — SHA-1 hash of a stable-stringified input object, prefixed `ga:`. Default TTL is 1 hour (`CACHE_TTL_SECONDS = 3600`). Pass `forceRefresh: true` to bypass.

### Server actions
- **`src/app/actions/google-ads.ts`** — all Google Ads data fetching actions.
- **`src/server/server-actions.ts`** — cookie helpers (`getValueFromCookie`, `setValueToCookie`, `getPreference`) used for persisting UI preferences server-side.

### UI preferences
Zustand vanilla store (`src/stores/preferences/`) holds theme, font, sidebar variant, etc. It is hydrated server-side via `PreferencesProvider` and persisted client-side. The `isSynced` flag gates whether stored preferences override default props.

### Route structure
- `(main)` route group — the whole app (dashboard + auth pages)
- `(external)` — marketing/landing page
- `(legacy)` route group inside dashboard — old v1 dashboards, kept for reference
- `src/components/ui/` — shadcn/ui components; **excluded from Biome linting**

### Path alias
`@/` resolves to `src/`.

### `data/` directory
Stores CLI script output files (JSON, CSV). The `saveToDisk: true` option on `runCampaignReport` writes JSON here. Also used for manual data exports (e.g., keyword CSVs from Google Ads UI).

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `GOOGLE_ADS_CLIENT_ID` | Yes | OAuth2 client ID |
| `GOOGLE_ADS_CLIENT_SECRET` | Yes | OAuth2 client secret |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | Yes | Google Ads developer token |
| `GOOGLE_ADS_CUSTOMER_ID` | Yes | Google Ads customer (account) ID |
| `ANTHROPIC_API_KEY` | Yes (for Overview page) | Claude API key used by the Overview insights page and its follow-up chat |
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

## MCP server (`scripts/mcp-server.ts`)

Registered in `.mcp.json` and `.cursor/mcp.json`. Cursor must enable the **google-ads** server (Settings → Tools & MCP). All tools accept optional `force_refresh: boolean` to bypass Redis cache.

| Tool | Lib function |
|------|----------------|
| `get_campaign_report` | `runCampaignReport` |
| `get_search_terms` | `runSearchTermsReport` |
| `get_keyword_analysis` | `runKeywordAnalysisBundle` |
| `get_ad_groups` | `runAdGroupReport` |
| `get_device_performance` | `runDevicePerformance` |
| `get_quality_score` | `runQualityScore` |
| `get_schedule_performance` | `runSchedulePerformance` |
| `get_change_history` | `runChangeHistory` |
| `get_campaign_keywords` | `runCampaignKeywords` |
| `get_landing_page_report` | `runLandingPageReport` |
| `get_keyword_search_term_map` | `runKeywordSearchTermMap` |
| `get_ad_performance` | `runAdPerformance` |
| `get_auction_insights` | `runAuctionInsights` |

## Scripts config
Scripts live in `scripts/` and use `tsx` with `dotenv/config` to load `.env`. They share the same `src/lib/google-ads/` modules as the Next.js app but run outside Next's server context.
