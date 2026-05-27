# Scope Picker Design

**Date:** 2026-05-27
**Status:** Approved

## Overview

A global hierarchical scope selector that persists across all dashboard pages. The user can scope all data views to "All campaigns", a specific campaign, or a specific ad group. Scope is stored in URL params so it survives refresh and is shareable.

## Placement

A trigger button sits in the persistent dashboard header on the right side, to the left of `LayoutControls` and `ThemeSwitcher`. The date picker stays per-page (not in the header). The scope button is always visible during navigation.

## Scope levels

| Level | URL params | Example |
|---|---|---|
| All campaigns | (none) | `?` |
| Campaign | `?campaign=<name>` | `?campaign=Search+%7C+WhatsApp` |
| Ad group | `?campaign=<name>&adGroup=<name>` | `?campaign=…&adGroup=AG-WA-Primary` |

Names are URL-encoded via `encodeURIComponent`. No IDs — names are stable enough for this internal tool and are more readable in the URL bar.

## New files

### `src/types/google-ads.ts` additions

```ts
export interface ScopeCampaign {
  name: string;
  status: string;          // "ENABLED" | "PAUSED" | etc.
  type: string;            // advertising_channel_type enum value
  adGroups: Array<{ name: string; status: string }>;
}

export interface ScopeOptions {
  generatedAt: string;
  campaigns: ScopeCampaign[];
}
```

### `src/lib/google-ads/scope-options.ts`

Single GAQL query against the `ad_group` resource:

```gaql
SELECT
  campaign.name,
  campaign.status,
  campaign.advertising_channel_type,
  ad_group.name,
  ad_group.status
FROM ad_group
WHERE campaign.status IN ('ENABLED', 'PAUSED')
  AND ad_group.status IN ('ENABLED', 'PAUSED')
ORDER BY campaign.name, ad_group.name
```

Results are grouped by campaign name into `ScopeCampaign[]`. Cache key: `scope-options:v1` + customer ID. TTL: `CACHE_TTL_SECONDS` (1 hour). Supports `forceRefresh` via `getOrSetJson`.

### `src/hooks/use-scope.ts`

```ts
export interface Scope {
  campaign: string | null;
  adGroup: string | null;
}

export function useScope(): Scope
```

Reads `?campaign` and `?adGroup` from `useSearchParams()`. Pages import this hook; they never touch `useSearchParams` directly for scope.

### `src/components/scope-picker.tsx`

Client component. Responsibilities:
- Fetch `ScopeOptions` on mount via `getScopeOptions()` server action; store in local state.
- Render trigger button with label derived from current URL params.
- Render Popover panel when open.
- On item selection: call `router.replace()` with updated params, close popover.

**Trigger label states:**
- No params → "All campaigns" (LayoutGrid icon)
- `?campaign=X` → campaign name, truncated to ~30 chars (campaign-type icon)
- `?campaign=X&adGroup=Y` → `"<campaign> › <adGroup>"` truncated (campaign-type icon)

**Panel structure:**
1. Header: "Select campaign or ad group" title + controlled search input (client-side filter, no extra fetches).
2. "All campaigns" row: always visible, not filtered away, shows total campaign count. Clicking clears both params.
3. Campaign rows: type icon | name | status dot | "N ad groups" count | expand chevron. Clicking the **row body** sets `?campaign=<name>` and clears `adGroup`. Clicking the **chevron only** toggles expansion without changing scope.
4. Ad group rows (under expanded campaign): indented, name + status dot. Clicking sets both `?campaign` and `?adGroup`.

**Campaign type icons** (from `lucide-react`):
| `advertising_channel_type` | Icon |
|---|---|
| `SEARCH` | `Search` |
| `PERFORMANCE_MAX` | `Zap` |
| `DISPLAY` | `MonitorPlay` |
| `SHOPPING` | `ShoppingBag` |
| `VIDEO` | `Youtube` |
| anything else | `LayoutGrid` |

**Loading state:** skeleton trigger button (disabled, no label).
**Error state:** disabled "All campaigns" button, no panel.

## Changed files

### `src/app/(main)/dashboard/layout.tsx`

Add `<ScopePicker />` import and render it inside the header `<div className="flex items-center gap-2">` on the right side, before `<LayoutControls />`. The layout stays a server component — `ScopePicker` is a client component dropped in as a leaf.

### `src/app/actions/google-ads.ts`

Add `getScopeOptions()` action wrapping `runScopeOptions()`.

For each of the 9 existing actions, add `campaign?: string | null` and `adGroup?: string | null` params (where not already present). Pass them through to the lib function.

### Tier 1 pages — already have `campaignFilter`

Search Terms, Keyword Analysis, Landing Pages, Keyword Search Terms, Ad Performance, Auction Insights.

- Remove any per-page campaign selector UI.
- Pass `scope.campaign` as the campaign filter.
- Keyword Search Terms and Ad Performance: also pass `scope.adGroup` to their lib function (which adds `AND ad_group.name = '...'` to WHERE). Others: lib function accepts `adGroup` but ignores it (no WHERE clause added).

### Tier 2 pages — no campaign filter yet

Campaign Report, Ad Groups, Schedule Performance, Device Performance, Quality Score, Change History.

Each lib function gains `campaign?: string | null`. When non-null, appends `AND campaign.name = '${campaign}'` to the GAQL WHERE clause. Campaign names are internal, API-sourced values — not user text — so interpolation is safe. `adGroup` is accepted by the server action for forward-compatibility but not passed to these lib functions (ad group scope silently falls back to campaign level on these pages).

Cache keys for all modified lib functions add `campaign` (and `adGroup` where applicable) as fields in `buildCacheKey(...)` so scoped and unscoped results cache separately.

### All 11 dashboard page components

Each page:
1. Imports `useScope`.
2. Calls `const scope = useScope()` at component top.
3. Adds `scope.campaign` (and `scope.adGroup` where supported) to the `useCallback` fetch function arguments.
4. Adds `scope.campaign` and `scope.adGroup` to the `useEffect` dep array as strings (same pattern as `dateRange.start` / `dateRange.end`).

## MCP server

No changes. MCP tools already accept `campaign` where applicable. The scope picker is a UI-only concern.

## Out of scope

- Paused campaigns are shown in the picker (user may want to inspect historical data for them) but displayed with a paused status indicator.
- No "Show filters" button (present in the Google Ads UI reference screenshot) — not needed for v1.
- No URL sharing of ad group scope for pages that only support campaign-level filtering (the `adGroup` param is present in the URL but has no effect on those pages; this is acceptable and clearly documented by the fallback rule).
