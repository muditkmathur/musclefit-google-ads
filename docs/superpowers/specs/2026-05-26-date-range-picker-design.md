# Date Range Picker — Design Spec

**Date:** 2026-05-26
**Status:** Approved

## Goal

Replace the fixed 4-preset range selector (`last-7-days | last-4-weeks | last-3-months | year-to-date`) across all Google Ads dashboard pages with a full date-range picker: presets panel + interactive calendar, arbitrary start/end dates, applied to all 9 affected pages simultaneously.

## Scope

**In scope:**
- New `DateRangePicker` shared component
- Data layer refactor: `CampaignRangeKey` removed from lib/server boundary; all lib functions accept `DateRange` directly
- 9 dashboard pages updated: Campaigns, Ad Groups, Devices, Quality Score, Schedule, Landing Pages, Keyword ↔ Search Terms, Ad Performance, Auction Insights
- MCP server updated: 9 tools switch from `rangeSchema` enum to `start_date` + `end_date` strings
- New `src/lib/date-presets.ts` utility for preset → `DateRange` resolution

**Out of scope:**
- Period-over-period comparison (Compare toggle)
- Change History page (uses `days: number`)
- Keyword Analysis page (uses `monthsBack: number`)

---

## 1. Data Layer

### `src/lib/date-presets.ts` (new file)

Extracts preset resolution logic out of `report.ts` and makes it available to the UI:

```ts
export type DatePreset =
  | "today"
  | "yesterday"
  | "last-7-days"
  | "last-14-days"
  | "last-30-days"
  | "this-week"
  | "last-week"
  | "this-month"
  | "last-month"
  | "all-time";

export function resolveDatePreset(preset: DatePreset): DateRange
export function last30Days(): DateRange  // default on page mount
```

`all-time` resolves to `{ start: "2020-01-01", end: today }`.

### `src/types/google-ads.ts`

- `CampaignRangeKey` type retained but renamed in usage to a UI-only concern (no removal — the type alias stays so existing references don't break, but no new lib/action code should reference it).
- `CampaignReport.range: CampaignRangeKey` field **removed** (replaced by the existing `date_range: DateRange` field which already carries the canonical dates).
- `CampaignGranularity` type unchanged.

### Lib functions (9 files)

Each lib function changes its options interface from `range: CampaignRangeKey` to `dateRange: DateRange`:

| File | Function | Old | New |
|------|----------|-----|-----|
| `src/lib/google-ads/report.ts` | `runCampaignReport` | `range?: CampaignRangeKey; days?: number` | `dateRange: DateRange` |
| `src/lib/google-ads/ad-group-report.ts` | `runAdGroupReport` | `range: CampaignRangeKey` | `dateRange: DateRange` |
| `src/lib/google-ads/device-performance.ts` | `runDevicePerformance` | `range: CampaignRangeKey` | `dateRange: DateRange` |
| `src/lib/google-ads/quality-score.ts` | `runQualityScore` | `range: CampaignRangeKey` | `dateRange: DateRange` |
| `src/lib/google-ads/schedule-performance.ts` | `runSchedulePerformance` | `range: CampaignRangeKey` | `dateRange: DateRange` |
| `src/lib/google-ads/landing-page-report.ts` | `runLandingPageReport` | `range: CampaignRangeKey` | `dateRange: DateRange` |
| `src/lib/google-ads/keyword-search-term-map.ts` | `runKeywordSearchTermMap` | `range: CampaignRangeKey` | `dateRange: DateRange` |
| `src/lib/google-ads/ad-performance.ts` | `runAdPerformance` | `range: CampaignRangeKey` | `dateRange: DateRange` |
| `src/lib/google-ads/auction-insights.ts` | `runAuctionInsights` | `range: CampaignRangeKey` | `dateRange: DateRange` |

Internal `dateRangeForRangeKey()` calls inside these functions are removed — the caller now passes resolved dates.

`dateRangeForRangeKey`, `daysForRange`, and `dateRangeForLastNDays` move from `report.ts` to `src/lib/date-presets.ts`. `report.ts` re-exports them for any existing imports that reference them from `report.ts`.

### Server actions (`src/app/actions/google-ads.ts`)

Each affected action input type changes:

```ts
// Before
export interface CampaignReportActionInput {
  range?: CampaignRangeKey;
  granularity?: CampaignGranularity;
  forceRefresh?: boolean;
}

// After
export interface CampaignReportActionInput {
  start: string;          // ISO date "YYYY-MM-DD"
  end: string;            // ISO date "YYYY-MM-DD"
  granularity?: CampaignGranularity;
  forceRefresh?: boolean;
}
```

**Validation in each action:** Replace the `VALID_RANGES.includes()` guard with:
```ts
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
if (!ISO_DATE.test(start) || !ISO_DATE.test(end) || start > end) {
  return { ok: false, error: "Invalid date range" };
}
```

`VALID_RANGES` constant and `VALID_GRANULARITIES` constant: `VALID_RANGES` removed; `VALID_GRANULARITIES` kept.

### MCP server (`scripts/mcp-server.ts`)

The shared `rangeSchema` is replaced by:
```ts
const startDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Start date in YYYY-MM-DD format');
const endDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('End date in YYYY-MM-DD format');
```

Each of the 9 affected tools replaces `range: rangeSchema` with `start_date: startDateSchema, end_date: endDateSchema` and passes them as `{ start: start_date, end: end_date }` to the lib function.

---

## 2. DateRangePicker Component

**File:** `src/components/date-range-picker.tsx`

### API

```tsx
interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  className?: string;
}
```

### Trigger button

Displays the selected range as `"May 1 – May 26, 2026"`. If the current value matches a known preset exactly, shows the preset label instead (e.g. "Last 30 days"). Uses a `CalendarIcon` (lucide-react) on the left.

### Popover layout

Two-column layout inside a shadcn `Popover`:

**Left panel — Presets (fixed width ~180px):**

| Preset | Resolves to |
|--------|-------------|
| Today | today → today |
| Yesterday | yesterday → yesterday |
| Last 7 days | today−6 → today |
| Last 14 days | today−13 → today |
| Last 30 days | today−29 → today |
| This week | most recent Mon → today |
| Last week | Mon−6d → Sun−1d |
| This month | 1st of current month → today |
| Last month | 1st → last day of previous month |
| All time | 2020-01-01 → today |

Below the preset list, two editable number inputs:
- `[N] days up to today` (default 30) — applies immediately on input blur/Enter
- `[N] days up to yesterday` (default 30) — same

Active preset is highlighted with a muted background.

**Right panel — Calendar:**

- shadcn `Calendar` component in range mode (`mode="range"`)
- Shows a single month; prev/next arrows to navigate
- Two text inputs above: `Start date` and `End date` (format `DD/MM/YYYY` matching Indian convention, stored internally as ISO)
- Date inputs sync with calendar selection bidirectionally

**Footer:**
- Cancel button (closes popover, reverts to `value`)
- Apply button (calls `onChange` with pending selection, closes popover)

**Preset click behaviour:** immediately calls `onChange` and closes popover (no Apply needed).

### Internal state

The component holds a `pending: DateRange | null` state. Calendar interactions update `pending`; Apply commits `pending` → `onChange`. On open, `pending` is initialised from `value`.

### Dependencies

`react-day-picker` is already installed (transitive via shadcn `Calendar`). No new packages needed. Lucide icons (`CalendarIcon`) already imported elsewhere in the project.

---

## 3. Page Integration

### Default date range

All 9 pages mount with `last30Days()` as the initial value (today−29 → today). This replaces the old default of `"last-4-weeks"`.

### State change pattern

```tsx
// Before
const [range, setRange] = useState<CampaignRangeKey>("last-4-weeks");

// After
const [dateRange, setDateRange] = useState<DateRange>(() => last30Days());
```

### Effect dependency change

To avoid object-reference churn in `useEffect`, depend on the string values:

```tsx
useEffect(() => {
  void fetchReport(dateRange);
}, [fetchReport, dateRange.start, dateRange.end]);
```

### Controls bar

Replace the shadcn `Select` (4 options) with `<DateRangePicker value={dateRange} onChange={setDateRange} />` in each page's controls bar. The refresh button and any other controls stay as-is.

**Campaigns page only:** retains the `granularity` selector (`day/week/month`) alongside the date picker.

### Server action call site

```ts
// Before
await getCampaignReport({ range, granularity, forceRefresh });

// After
await getCampaignReport({ start: dateRange.start, end: dateRange.end, granularity, forceRefresh });
```

### Pages affected

| Page | Component file |
|------|---------------|
| Campaigns | `src/app/(main)/dashboard/campaigns/_components/campaign-report-card.tsx` |
| Ad Groups | `src/app/(main)/dashboard/ad-groups/_components/ad-groups-card.tsx` |
| Devices | `src/app/(main)/dashboard/devices/_components/device-performance-card.tsx` |
| Quality Score | `src/app/(main)/dashboard/quality-score/_components/quality-score-card.tsx` |
| Schedule | `src/app/(main)/dashboard/schedule/_components/schedule-heatmap-card.tsx` |
| Landing Pages | `src/app/(main)/dashboard/landing-pages/_components/landing-pages-card.tsx` |
| Keyword ↔ Search Terms | `src/app/(main)/dashboard/keyword-search-terms/_components/keyword-search-terms-card.tsx` |
| Ad Performance | `src/app/(main)/dashboard/ad-performance/_components/ad-performance-card.tsx` |
| Auction Insights | `src/app/(main)/dashboard/auction-insights/_components/auction-insights-card.tsx` |

---

## Files Changed Summary

| File | Change type |
|------|-------------|
| `src/lib/date-presets.ts` | **New** — preset resolution utilities |
| `src/components/date-range-picker.tsx` | **New** — picker component |
| `src/types/google-ads.ts` | Modify — remove `CampaignReport.range` field |
| `src/lib/google-ads/report.ts` | Modify — accept `dateRange: DateRange`; move helpers to date-presets.ts |
| `src/lib/google-ads/ad-group-report.ts` | Modify — accept `dateRange: DateRange` |
| `src/lib/google-ads/device-performance.ts` | Modify — accept `dateRange: DateRange` |
| `src/lib/google-ads/quality-score.ts` | Modify — accept `dateRange: DateRange` |
| `src/lib/google-ads/schedule-performance.ts` | Modify — accept `dateRange: DateRange` |
| `src/lib/google-ads/landing-page-report.ts` | Modify — accept `dateRange: DateRange` |
| `src/lib/google-ads/keyword-search-term-map.ts` | Modify — accept `dateRange: DateRange` |
| `src/lib/google-ads/ad-performance.ts` | Modify — accept `dateRange: DateRange` |
| `src/lib/google-ads/auction-insights.ts` | Modify — accept `dateRange: DateRange` |
| `src/app/actions/google-ads.ts` | Modify — 9 action inputs accept `start`/`end` strings |
| `scripts/mcp-server.ts` | Modify — 9 tools use `start_date`/`end_date` schemas |
| 9 page component files | Modify — replace Select with DateRangePicker |

## Out of Scope

- Period-over-period Compare toggle
- Change History and Keyword Analysis pages (different time input shapes)
- Server-side date validation beyond ISO format + start ≤ end
- URL-based date state persistence
