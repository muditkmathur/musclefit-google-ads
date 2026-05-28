# Global Filters Store

**Date:** 2026-05-28
**Status:** Approved

## Goal

Move the date range picker and campaign/ad-group scope picker out of individual page cards and into the dashboard navbar as globally shared controls. Both are backed by a single Zustand store so state persists across page navigations within the dashboard session.

## Context

- 9 of 11 Google Ads dashboard pages embed a `DateRangePicker` inside their card component with local `useState`. Each card independently manages its own date range.
- The `ScopePicker` (campaign / ad-group filter) lives in the navbar but reads/writes `?campaign=` and `?adGroup=` URL search params via `useRouter` / `useSearchParams`.
- `useScope()` reads those URL params and is called by every card.
- The keyword-analysis page uses a `months` number input, not a date range — it is out of scope.

## Approach

A new standalone Zustand vanilla store (`filters-store`) holds both the date range and campaign scope. No server hydration is required. The store is provided once at the dashboard layout level. Both navbar pickers write to the store; all cards read from it via hooks.

URL params for campaign/adGroup are removed — the store is the single source of truth. State resets on hard refresh (acceptable trade-off chosen over URL params).

## Store

**File:** `src/stores/filters/filters-store.ts`

```ts
type FiltersState = {
  dateRange: DateRange;
  campaign: string | null;
  adGroup: string | null;
  setDateRange: (range: DateRange) => void;
  setScope: (campaign: string | null, adGroup: string | null) => void;
};
```

Defaults: `dateRange = last30Days()`, `campaign = null`, `adGroup = null`.

Uses `createStore` from `zustand/vanilla` (same pattern as preferences store).

## Provider

**File:** `src/stores/filters/filters-provider.tsx`

- Creates the store once via `useState`
- Exposes it via React context
- Exports `useFiltersStore<T>(selector)` hook (same shape as `usePreferencesStore`)
- No server-side init props needed

## Hooks

**`src/hooks/use-date-range.ts`** (new)
```ts
export function useDateRange(): [DateRange, (r: DateRange) => void]
```
Reads `dateRange` + `setDateRange` from the filters store.

**`src/hooks/use-scope.ts`** (updated)
```ts
export function useScope(): Scope
```
Changed from reading `useSearchParams()` to reading `campaign` / `adGroup` from the filters store. Return type and shape unchanged — all callers are unaffected.

## Navbar

**`src/app/(main)/dashboard/layout.tsx`**

- Wrap `<SidebarProvider>` with `<FiltersProvider>`
- Add `<NavDateRangePicker />` to the header `<div className="flex items-center gap-2">` next to `<ScopePicker />`

**`src/components/nav-date-range-picker.tsx`** (new)

Thin client component. Calls `useDateRange()`, renders `<DateRangePicker value={dateRange} onChange={setDateRange} />` with `size="sm"` styling to match the navbar height.

## ScopePicker refactor

**`src/components/scope-picker.tsx`**

- Remove `useRouter`, `useSearchParams`, `router.push`
- Read `campaign` / `adGroup` from `useFiltersStore`
- Call `setScope(c, ag)` on selection instead of pushing URL params

## Card components (9 files)

For each card that currently owns a local date range:

| File | Change |
|------|--------|
| `campaigns/_components/campaign-report-card.tsx` | Remove `useState<DateRange>` + `<DateRangePicker>`. Call `useDateRange()`. |
| `ad-groups/_components/ad-groups-card.tsx` | Same |
| `devices/_components/device-performance-card.tsx` | Same |
| `quality-score/_components/quality-score-card.tsx` | Same |
| `schedule/_components/schedule-heatmap-card.tsx` | Same |
| `landing-pages/_components/landing-pages-card.tsx` | Same |
| `keyword-search-terms/_components/keyword-search-terms-card.tsx` | Same |
| `ad-performance/_components/ad-performance-card.tsx` | Same |
| `auction-insights/_components/auction-insights-card.tsx` | Same |

`history/_components/change-history-card.tsx` uses a `days` number input (not `DateRangePicker`) — leave unchanged, same as keyword-analysis.

## Out of scope

- `keyword-analysis` card uses a `months` number input, not a date range. Leave unchanged.
- Granularity picker (day/week/month) on the campaigns page stays inside the card — it is page-specific, not global.
- No URL persistence. State resets on hard refresh.

## File summary

| Action | File |
|--------|------|
| New | `src/stores/filters/filters-store.ts` |
| New | `src/stores/filters/filters-provider.tsx` |
| New | `src/hooks/use-date-range.ts` |
| New | `src/components/nav-date-range-picker.tsx` |
| Update | `src/hooks/use-scope.ts` |
| Update | `src/components/scope-picker.tsx` |
| Update | `src/app/(main)/dashboard/layout.tsx` |
| Update | 9 card components (remove local date state + picker) |
