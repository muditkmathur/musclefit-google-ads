# Date Range Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed 4-preset range selector across all 9 Google Ads dashboard pages with a full date-range picker (presets panel + interactive calendar), refactoring the entire stack from lib → server actions → UI components.

**Architecture:** New `src/lib/date-presets.ts` owns all preset resolution logic and is shared by the UI picker and lib layer. Each lib function switches from `range: CampaignRangeKey` to `dateRange: DateRange` (caller resolves dates before calling). The `DateRangePicker` component is a two-column Popover (presets left, calendar right) that calls `onChange` immediately on preset click and requires Apply for calendar selections.

**Tech Stack:** Next.js 14, TypeScript, shadcn/ui (Popover, Calendar, Button, Input), react-day-picker (range mode, already installed), lucide-react (CalendarIcon), Biome (lint/format via `pnpm check:fix`)

---

## Files

| File | Change |
|------|--------|
| `src/lib/date-presets.ts` | **New** — DatePreset type, PRESET_LABELS, resolveDatePreset, last30Days, backward-compat dateRangeForRangeKey/dateRangeForLastNDays |
| `src/types/google-ads.ts` | Modify — remove `range: CampaignRangeKey` from `CampaignReport` |
| `src/lib/google-ads/report.ts` | Modify — RunCampaignReportOptions uses `dateRange: DateRange`; re-export helpers from date-presets |
| `scripts/report.ts` | Modify — update CLI to use `dateRange: dateRangeForLastNDays(days)` |
| `src/lib/google-ads/ad-group-report.ts` | Modify — `range → dateRange` |
| `src/lib/google-ads/device-performance.ts` | Modify — `range → dateRange` |
| `src/lib/google-ads/quality-score.ts` | Modify — `range → dateRange` |
| `src/lib/google-ads/schedule-performance.ts` | Modify — `range → dateRange` |
| `src/lib/google-ads/landing-page-report.ts` | Modify — `range → dateRange` |
| `src/lib/google-ads/keyword-search-term-map.ts` | Modify — `range → dateRange` |
| `src/lib/google-ads/ad-performance.ts` | Modify — `range → dateRange` |
| `src/lib/google-ads/auction-insights.ts` | Modify — `range → dateRange` |
| `src/app/actions/google-ads.ts` | Modify — 9 action inputs accept `start`/`end` strings with ISO validation |
| `src/components/date-range-picker.tsx` | **New** — full picker component |
| `src/app/(main)/dashboard/campaigns/_components/campaign-report-card.tsx` | Modify — DateRangePicker replaces range Select |
| `src/app/(main)/dashboard/ad-groups/_components/ad-groups-card.tsx` | Modify |
| `src/app/(main)/dashboard/devices/_components/device-performance-card.tsx` | Modify |
| `src/app/(main)/dashboard/quality-score/_components/quality-score-card.tsx` | Modify |
| `src/app/(main)/dashboard/schedule/_components/schedule-heatmap-card.tsx` | Modify |
| `src/app/(main)/dashboard/landing-pages/_components/landing-pages-card.tsx` | Modify |
| `src/app/(main)/dashboard/keyword-search-terms/_components/keyword-search-terms-card.tsx` | Modify |
| `src/app/(main)/dashboard/ad-performance/_components/ad-performance-card.tsx` | Modify |
| `src/app/(main)/dashboard/auction-insights/_components/auction-insights-card.tsx` | Modify |
| `scripts/mcp-server.ts` | Modify — 9 tools use start_date/end_date |

---

## Task 1: Create `src/lib/date-presets.ts`

**Files:**
- Create: `src/lib/date-presets.ts`

- [ ] **Step 1: Create the file**

```ts
import type { CampaignRangeKey, DateRange } from "@/types/google-ads";

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

export const PRESET_LABELS: Record<DatePreset, string> = {
  today: "Today",
  yesterday: "Yesterday",
  "last-7-days": "Last 7 days",
  "last-14-days": "Last 14 days",
  "last-30-days": "Last 30 days",
  "this-week": "This week",
  "last-week": "Last week",
  "this-month": "This month",
  "last-month": "Last month",
  "all-time": "All time",
};

function fmtYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function resolveDatePreset(preset: DatePreset): DateRange {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  switch (preset) {
    case "today":
      return { start: fmtYmd(today), end: fmtYmd(today) };

    case "yesterday": {
      const d = new Date(today);
      d.setDate(d.getDate() - 1);
      return { start: fmtYmd(d), end: fmtYmd(d) };
    }

    case "last-7-days": {
      const start = new Date(today);
      start.setDate(start.getDate() - 6);
      return { start: fmtYmd(start), end: fmtYmd(today) };
    }

    case "last-14-days": {
      const start = new Date(today);
      start.setDate(start.getDate() - 13);
      return { start: fmtYmd(start), end: fmtYmd(today) };
    }

    case "last-30-days": {
      const start = new Date(today);
      start.setDate(start.getDate() - 29);
      return { start: fmtYmd(start), end: fmtYmd(today) };
    }

    case "this-week": {
      const d = new Date(today);
      const dow = d.getDay(); // 0=Sun
      const diff = dow === 0 ? -6 : 1 - dow;
      d.setDate(d.getDate() + diff);
      return { start: fmtYmd(d), end: fmtYmd(today) };
    }

    case "last-week": {
      const dow = today.getDay();
      const thisMon = new Date(today);
      thisMon.setDate(today.getDate() + (dow === 0 ? -6 : 1 - dow));
      const lastSun = new Date(thisMon);
      lastSun.setDate(lastSun.getDate() - 1);
      const lastMon = new Date(lastSun);
      lastMon.setDate(lastMon.getDate() - 6);
      return { start: fmtYmd(lastMon), end: fmtYmd(lastSun) };
    }

    case "this-month": {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return { start: fmtYmd(start), end: fmtYmd(today) };
    }

    case "last-month": {
      const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastOfPrev = new Date(firstOfMonth);
      lastOfPrev.setDate(lastOfPrev.getDate() - 1);
      const firstOfPrev = new Date(lastOfPrev.getFullYear(), lastOfPrev.getMonth(), 1);
      return { start: fmtYmd(firstOfPrev), end: fmtYmd(lastOfPrev) };
    }

    case "all-time":
      return { start: "2020-01-01", end: fmtYmd(today) };
  }
}

export function last30Days(): DateRange {
  return resolveDatePreset("last-30-days");
}

// ─── Backward-compat helpers (previously in report.ts) ───────────────────────

export function dateRangeForLastNDays(n: number): DateRange {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - (n - 1));
  return { start: fmtYmd(start), end: fmtYmd(end) };
}

function daysForRangeKey(range: CampaignRangeKey): number {
  const now = new Date();
  switch (range) {
    case "last-7-days":
      return 7;
    case "last-4-weeks":
      return 28;
    case "last-3-months":
      return 90;
    case "year-to-date": {
      const start = new Date(now.getFullYear(), 0, 1);
      return Math.round((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    }
  }
}

export function dateRangeForRangeKey(range: CampaignRangeKey): DateRange {
  const end = new Date();
  if (range === "year-to-date") {
    const start = new Date(end.getFullYear(), 0, 1);
    return { start: fmtYmd(start), end: fmtYmd(end) };
  }
  const days = daysForRangeKey(range);
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  return { start: fmtYmd(start), end: fmtYmd(end) };
}
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```

Expected: no errors in `src/lib/date-presets.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/date-presets.ts
git commit -m "feat: add date-presets utility with DatePreset type and resolveDatePreset"
```

---

## Task 2: Update `src/types/google-ads.ts` — remove `CampaignReport.range`

**Files:**
- Modify: `src/types/google-ads.ts`

`CampaignReport` currently has:
```ts
export interface CampaignReport {
  generated_at: string;
  period: string;
  range: CampaignRangeKey;   // ← remove this line
  granularity: CampaignGranularity;
  date_range: DateRange;
  ...
}
```

- [ ] **Step 1: Remove the `range` field**

In `src/types/google-ads.ts`, delete the line:
```ts
  range: CampaignRangeKey;
```
from the `CampaignReport` interface. Leave `CampaignRangeKey` type alias itself intact (line `export type CampaignRangeKey = ...`).

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```

Expected: TypeScript will report errors wherever `report.range` is accessed — note them; they'll be fixed in Task 3/Task 7.

- [ ] **Step 3: Commit**

```bash
git add src/types/google-ads.ts
git commit -m "types: remove range field from CampaignReport (date_range is the canonical field)"
```

---

## Task 3: Refactor `src/lib/google-ads/report.ts` and `scripts/report.ts`

**Files:**
- Modify: `src/lib/google-ads/report.ts`
- Modify: `scripts/report.ts`

The goal is to:
1. Remove `dateRangeForLastNDays`, `dateRangeForRangeKey`, `daysForRange` function bodies (they now live in `date-presets.ts`); re-export them.
2. Remove `rangeLabel` (no longer needed — `period` becomes a date string).
3. Change `RunCampaignReportOptions` to use `dateRange: DateRange` instead of `range` + `days`.
4. Update `runCampaignReport` body to use `options.dateRange`.
5. Remove `range` from `CampaignRangeKey` imports and `CampaignReport` result shape (already done in types).

- [ ] **Step 1: Update imports and remove helper functions in `report.ts`**

Change the imports block at the top of `src/lib/google-ads/report.ts`:

Remove from `import type { ... } from "@/types/google-ads"`: `CampaignRangeKey`

Add a new import after the existing imports:
```ts
import { dateRangeForLastNDays as _dateRangeForLastNDays, dateRangeForRangeKey as _dateRangeForRangeKey } from "@/lib/date-presets";
```

Add re-exports (for backward compat with any external import from `report.ts`):
```ts
export { dateRangeForLastNDays, dateRangeForRangeKey } from "@/lib/date-presets";
```

Delete these entire function definitions from `report.ts`:
- `export function dateRangeForLastNDays(...)` (lines ~42-47)
- `export function dateRangeForRangeKey(...)` (lines ~49-59)
- `function daysForRange(...)` (lines ~61-75)
- `function rangeLabel(...)` (lines ~86-97)

Keep `formatYmd`, `addDays`, `daysBetween`, `previousRange` — they're still needed for daily/period comparisons.

- [ ] **Step 2: Update `RunCampaignReportOptions`**

Replace:
```ts
export interface RunCampaignReportOptions {
  /** Preferred input. Computed range key. */
  range?: CampaignRangeKey;
  /** Metadata only — pass-through to the returned report. */
  granularity?: CampaignGranularity;
  /** Backwards-compatible: if `range` is not provided, use `days` for an ad-hoc window. */
  days?: number;
  /** Whether to include daily breakdown in the result. Defaults to true. */
  includeDaily?: boolean;
  /** Whether to include demographic breakdown in the result. Defaults to true. */
  includeDemographics?: boolean;
  /** Whether to include previous-period totals. Defaults to true. */
  includePrevious?: boolean;
  saveToDisk?: boolean;
  outputDir?: string;
  forceRefresh?: boolean;
}
```

With:
```ts
export interface RunCampaignReportOptions {
  dateRange: DateRange;
  granularity?: CampaignGranularity;
  includeDaily?: boolean;
  includeDemographics?: boolean;
  includePrevious?: boolean;
  saveToDisk?: boolean;
  outputDir?: string;
  forceRefresh?: boolean;
}
```

- [ ] **Step 3: Update `runCampaignReport` body**

Replace the existing `runCampaignReport` function body. The full new function:

```ts
export async function runCampaignReport(options: RunCampaignReportOptions): Promise<RunCampaignReportResult> {
  const { dateRange } = options;
  const granularity: CampaignGranularity = options.granularity ?? "day";
  const includeDaily = options.includeDaily ?? true;
  const includeDemographics = options.includeDemographics ?? false;
  const includePrevious = options.includePrevious ?? true;
  const saveToDisk = options.saveToDisk ?? false;

  const { start: rangeStart, end: rangeEnd } = dateRange;
  const period = `${rangeStart} to ${rangeEnd}`;
  const forceRefresh = options.forceRefresh === true;

  const current = await queryCampaignSummary(rangeStart, rangeEnd, { forceRefresh });

  const previousDateRange = previousRange(dateRange);
  let previous: CampaignQueryResult | null = null;
  if (includePrevious) {
    previous = await queryCampaignSummary(previousDateRange.start, previousDateRange.end, { forceRefresh });
  }

  const generatedAt = new Date().toISOString();
  const result: CampaignReport = {
    generated_at: generatedAt,
    period,
    granularity,
    date_range: dateRange,
    previous_date_range: previousDateRange,
    campaigns: current.campaigns,
    totals: current.totals,
    totals_raw: current.totalsRaw,
    previous_totals:
      previous?.totals ??
      ({
        campaign: "TOTAL",
        status: "—",
        impressions: 0,
        clicks: 0,
        ctr: "0.00%",
        avg_cpc: "—",
        spend: "₹0.00",
        conversions: 0,
        cpa: "N/A",
      } satisfies CampaignTotals),
    previous_totals_raw:
      previous?.totalsRaw ??
      ({
        impressions: 0,
        clicks: 0,
        ctr: 0,
        spend: 0,
        conversions: 0,
        cpa: 0,
      } satisfies CampaignTotalsRaw),
  };

  let daily: CampaignDailyReport | undefined;
  if (includeDaily) {
    daily = await getCampaignDailyReport({
      rangeStart,
      rangeEnd,
      periodLabel: period,
      forceRefresh,
    });
    result.daily = daily;
  }

  let demographics: CampaignDemographicsReport | undefined;
  if (includeDemographics) {
    try {
      demographics = await getCampaignDemographicsReport({
        rangeStart,
        rangeEnd,
        periodLabel: period,
        forceRefresh,
      });
      result.demographics = demographics;
    } catch (err) {
      console.warn("[report] Failed to fetch demographics; continuing without demographics section.", err);
    }
  }

  if (saveToDisk) {
    const outputDir = options.outputDir ?? join(process.cwd(), "output", "reports");
    await mkdir(outputDir, { recursive: true });
    const timestamp = generatedAt.replace(/[:.]/g, "-");
    const tag = `${rangeStart}_${rangeEnd}`;
    const summaryFilename = join(outputDir, `campaign-report-${tag}-${timestamp}.json`);
    await writeFile(summaryFilename, JSON.stringify(result, null, 2), "utf8");
    result.saved_to = { summary: summaryFilename };

    if (daily) {
      const dailyFilename = join(outputDir, `campaign-report-daily-${tag}-${timestamp}.json`);
      await mkdir(dirname(dailyFilename), { recursive: true });
      await writeFile(dailyFilename, JSON.stringify(daily, null, 2), "utf8");
      result.saved_to = { ...result.saved_to, daily: dailyFilename };
    }

    if (demographics) {
      const demographicsFilename = join(outputDir, `campaign-report-demographics-${tag}-${timestamp}.json`);
      await mkdir(dirname(demographicsFilename), { recursive: true });
      await writeFile(demographicsFilename, JSON.stringify(demographics, null, 2), "utf8");
      result.saved_to = { ...result.saved_to, demographics: demographicsFilename };
    }
  }

  return result;
}
```

- [ ] **Step 4: Update `scripts/report.ts`**

Replace:
```ts
    const result = await runCampaignReport({
      days,
      includeDaily,
      saveToDisk: true,
    });
```

With:
```ts
    const { dateRangeForLastNDays } = await import("../src/lib/date-presets");
    const result = await runCampaignReport({
      dateRange: dateRangeForLastNDays(days),
      includeDaily,
      saveToDisk: true,
    });
```

Also add the import at the top of the file (static import is cleaner):

Replace the import line in `scripts/report.ts`:
```ts
import { runCampaignReport } from "../src/lib/google-ads/report";
```

With:
```ts
import { dateRangeForLastNDays } from "../src/lib/date-presets";
import { runCampaignReport } from "../src/lib/google-ads/report";
```

And replace the `runCampaignReport` call:
```ts
    const result = await runCampaignReport({
      dateRange: dateRangeForLastNDays(days),
      includeDaily,
      saveToDisk: true,
    });
```

- [ ] **Step 5: Run typecheck and lint**

```bash
pnpm typecheck && pnpm check:fix
```

Expected: errors only from the 8 lib files (still using old `range` param) and the server actions / MCP server — those are fixed in subsequent tasks.

- [ ] **Step 6: Commit**

```bash
git add src/lib/google-ads/report.ts scripts/report.ts
git commit -m "refactor(report): accept dateRange: DateRange; move helpers to date-presets"
```

---

## Task 4: Refactor 8 lib files — `range: CampaignRangeKey → dateRange: DateRange`

**Files:**
- Modify: `src/lib/google-ads/ad-group-report.ts`
- Modify: `src/lib/google-ads/device-performance.ts`
- Modify: `src/lib/google-ads/quality-score.ts`
- Modify: `src/lib/google-ads/schedule-performance.ts`
- Modify: `src/lib/google-ads/landing-page-report.ts`
- Modify: `src/lib/google-ads/keyword-search-term-map.ts`
- Modify: `src/lib/google-ads/ad-performance.ts`
- Modify: `src/lib/google-ads/auction-insights.ts`

Each file has the same pattern. Apply identically to all 8:

1. Remove `CampaignRangeKey` from the `import type` block.
2. Remove `import { dateRangeForRangeKey } from "./report"`.
3. If `DateRange` is not already imported, add it to the `import type` from `@/types/google-ads`.
4. Change the options interface from `range: CampaignRangeKey` to `dateRange: DateRange`.
5. Remove `const dateRange = dateRangeForRangeKey(options.range)` (or the equivalent) from the function body.
6. Replace all references to `options.range` (in cache key construction) with `options.dateRange.start`/`options.dateRange.end`, and pass `options.dateRange` to the inner fetch function.

- [ ] **Step 1: Apply to `ad-group-report.ts`**

Before:
```ts
import type { AdGroupReport, AdGroupRow, CampaignRangeKey } from "@/types/google-ads";
import { getCustomer, getCustomerId } from "./client";
import { dateRangeForRangeKey } from "./report";

export interface RunAdGroupReportOptions {
  range: CampaignRangeKey;
  forceRefresh?: boolean;
}

export async function runAdGroupReport(options: RunAdGroupReportOptions): Promise<AdGroupReport> {
  const dateRange = dateRangeForRangeKey(options.range);
  const cacheKey = buildCacheKey("ad-groups:v1", {
    customerId: getCustomerId(),
    rangeStart: dateRange.start,
    rangeEnd: dateRange.end,
  });
  return getOrSetJson<AdGroupReport>(cacheKey, () => fetchAdGroupReport(dateRange), CACHE_TTL_SECONDS, {
    forceRefresh: options.forceRefresh === true,
  });
}
```

After:
```ts
import type { AdGroupReport, AdGroupRow, DateRange } from "@/types/google-ads";
import { getCustomer, getCustomerId } from "./client";

export interface RunAdGroupReportOptions {
  dateRange: DateRange;
  forceRefresh?: boolean;
}

export async function runAdGroupReport(options: RunAdGroupReportOptions): Promise<AdGroupReport> {
  const cacheKey = buildCacheKey("ad-groups:v1", {
    customerId: getCustomerId(),
    rangeStart: options.dateRange.start,
    rangeEnd: options.dateRange.end,
  });
  return getOrSetJson<AdGroupReport>(cacheKey, () => fetchAdGroupReport(options.dateRange), CACHE_TTL_SECONDS, {
    forceRefresh: options.forceRefresh === true,
  });
}
```

- [ ] **Step 2: Apply to `device-performance.ts`**

Current imports include `CampaignRangeKey` (no `DateRange` import yet). Current options:
```ts
export interface RunDevicePerformanceOptions {
  range: CampaignRangeKey;
  forceRefresh?: boolean;
}
export async function runDevicePerformance(options: RunDevicePerformanceOptions): Promise<DevicePerformanceReport> {
  const dateRange = dateRangeForRangeKey(options.range);
  const cacheKey = buildCacheKey("device-performance:v1", {
    customerId: getCustomerId(),
    rangeStart: dateRange.start,
    rangeEnd: dateRange.end,
  });
  return getOrSetJson<DevicePerformanceReport>(cacheKey, () => fetchDevicePerformance(dateRange), CACHE_TTL_SECONDS, {
    forceRefresh: options.forceRefresh === true,
  });
}
```

After:
- Remove `CampaignRangeKey` from imports, add `DateRange`
- Remove `import { dateRangeForRangeKey } from "./report"`
- Change options interface + function body (same pattern as ad-group-report):

```ts
export interface RunDevicePerformanceOptions {
  dateRange: DateRange;
  forceRefresh?: boolean;
}
export async function runDevicePerformance(options: RunDevicePerformanceOptions): Promise<DevicePerformanceReport> {
  const cacheKey = buildCacheKey("device-performance:v1", {
    customerId: getCustomerId(),
    rangeStart: options.dateRange.start,
    rangeEnd: options.dateRange.end,
  });
  return getOrSetJson<DevicePerformanceReport>(cacheKey, () => fetchDevicePerformance(options.dateRange), CACHE_TTL_SECONDS, {
    forceRefresh: options.forceRefresh === true,
  });
}
```

- [ ] **Step 3: Apply to `quality-score.ts`**

Current:
```ts
export interface RunQualityScoreOptions {
  range?: CampaignRangeKey;
  forceRefresh?: boolean;
}
export async function runQualityScore(options: RunQualityScoreOptions = {}): Promise<QualityScoreReport> {
  const range: CampaignRangeKey = options.range ?? "last-4-weeks";
  const dateRange = dateRangeForRangeKey(range);
  const cacheKey = buildCacheKey("quality-score:v4", {
    customerId: getCustomerId(),
    rangeStart: dateRange.start,
    rangeEnd: dateRange.end,
  });
  return getOrSetJson<QualityScoreReport>(cacheKey, () => fetchQualityScore(dateRange), CACHE_TTL_SECONDS, {
    forceRefresh: options.forceRefresh === true,
  });
}
```

After:
```ts
import type {
  DateRange,
  QualityScoreBottleneck,
  QualityScoreComponent,
  QualityScoreReport,
  QualityScoreRow,
} from "@/types/google-ads";

// (remove CampaignRangeKey from imports, remove dateRangeForRangeKey import)

export interface RunQualityScoreOptions {
  dateRange: DateRange;
  forceRefresh?: boolean;
}
export async function runQualityScore(options: RunQualityScoreOptions): Promise<QualityScoreReport> {
  const cacheKey = buildCacheKey("quality-score:v4", {
    customerId: getCustomerId(),
    rangeStart: options.dateRange.start,
    rangeEnd: options.dateRange.end,
  });
  return getOrSetJson<QualityScoreReport>(cacheKey, () => fetchQualityScore(options.dateRange), CACHE_TTL_SECONDS, {
    forceRefresh: options.forceRefresh === true,
  });
}
```

- [ ] **Step 4: Apply to `schedule-performance.ts`**

Current:
```ts
import type { CampaignRangeKey, DateRange, DayOfWeek, ScheduleCell, SchedulePerformanceReport } from "@/types/google-ads";
import { dateRangeForRangeKey } from "./report";

export interface RunSchedulePerformanceOptions {
  range: CampaignRangeKey;
  forceRefresh?: boolean;
}
export async function runSchedulePerformance(options: RunSchedulePerformanceOptions): Promise<SchedulePerformanceReport> {
  const dateRange = dateRangeForRangeKey(options.range);
  ...
}
```

After:
```ts
import type { DateRange, DayOfWeek, ScheduleCell, SchedulePerformanceReport } from "@/types/google-ads";
// (remove dateRangeForRangeKey import)

export interface RunSchedulePerformanceOptions {
  dateRange: DateRange;
  forceRefresh?: boolean;
}
export async function runSchedulePerformance(options: RunSchedulePerformanceOptions): Promise<SchedulePerformanceReport> {
  // use options.dateRange directly where dateRange was used
  const cacheKey = buildCacheKey("schedule:v1", {
    customerId: getCustomerId(),
    rangeStart: options.dateRange.start,
    rangeEnd: options.dateRange.end,
  });
  return getOrSetJson<SchedulePerformanceReport>(cacheKey, () => fetchSchedulePerformance(options.dateRange), CACHE_TTL_SECONDS, {
    forceRefresh: options.forceRefresh === true,
  });
}
```

- [ ] **Step 5: Apply to `landing-page-report.ts`, `keyword-search-term-map.ts`, `ad-performance.ts`, `auction-insights.ts`**

These four files already import `DateRange` and have `campaign` (and optionally `top`) extra parameters. Apply the same pattern:

**`landing-page-report.ts`:**
- Remove `CampaignRangeKey` from imports; already has `DateRange`
- Remove `dateRangeForRangeKey` import from `"./report"`
- Change `RunLandingPageReportOptions.range: CampaignRangeKey` → `dateRange: DateRange`
- In `runLandingPageReport`: remove `const dateRange = dateRangeForRangeKey(options.range)`, use `options.dateRange`

**`keyword-search-term-map.ts`:**
- Remove `CampaignRangeKey` from imports; already has `DateRange`
- Remove `dateRangeForRangeKey` import from `"./report"`
- Change `RunKeywordSearchTermMapOptions.range: CampaignRangeKey` → `dateRange: DateRange`
- In `runKeywordSearchTermMap`: remove `const dateRange = dateRangeForRangeKey(options.range)`, use `options.dateRange`

**`ad-performance.ts`:**
- Remove `CampaignRangeKey` from imports; already has `DateRange`
- Remove `dateRangeForRangeKey` import from `"./report"`
- Change `RunAdPerformanceOptions.range: CampaignRangeKey` → `dateRange: DateRange`
- In `runAdPerformance`: remove `const dateRange = dateRangeForRangeKey(options.range)`, use `options.dateRange`

**`auction-insights.ts`:**
- Remove `CampaignRangeKey` from imports; already has `DateRange`
- Remove `dateRangeForRangeKey` import from `"./report"`
- Change `RunAuctionInsightsOptions.range: CampaignRangeKey` → `dateRange: DateRange`
- In `runAuctionInsights`: remove `const dateRange = dateRangeForRangeKey(options.range)`, use `options.dateRange`

- [ ] **Step 6: Run typecheck**

```bash
pnpm typecheck
```

Expected: no errors in the 8 lib files. Errors will still exist in `google-ads.ts` (server actions) and `mcp-server.ts` — those are Task 5 and Task 8.

- [ ] **Step 7: Commit**

```bash
git add src/lib/google-ads/ad-group-report.ts src/lib/google-ads/device-performance.ts src/lib/google-ads/quality-score.ts src/lib/google-ads/schedule-performance.ts src/lib/google-ads/landing-page-report.ts src/lib/google-ads/keyword-search-term-map.ts src/lib/google-ads/ad-performance.ts src/lib/google-ads/auction-insights.ts
git commit -m "refactor: lib functions accept dateRange: DateRange instead of range: CampaignRangeKey"
```

---

## Task 5: Update server actions (`src/app/actions/google-ads.ts`)

**Files:**
- Modify: `src/app/actions/google-ads.ts`

9 action input interfaces change from `range?: CampaignRangeKey` to `start: string; end: string`. Each action replaces the `VALID_RANGES.includes()` guard with an ISO date regex check and passes `{ dateRange: { start, end } }` to the lib function.

- [ ] **Step 1: Update imports and remove `VALID_RANGES`**

In the `import type { ... }` block, remove `CampaignRangeKey` from the list (it is no longer used by any action).

Delete the constant:
```ts
const VALID_RANGES: readonly CampaignRangeKey[] = ["last-7-days", "last-4-weeks", "last-3-months", "year-to-date"];
```

Add a new constant after the removed line:
```ts
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function validateDateRange(start: string, end: string): string | null {
  if (!ISO_DATE.test(start) || !ISO_DATE.test(end) || start > end) {
    return "Invalid date range: provide ISO dates (YYYY-MM-DD) with start ≤ end";
  }
  return null;
}
```

- [ ] **Step 2: Update `CampaignReportActionInput` and `getCampaignReport`**

Replace:
```ts
export interface CampaignReportActionInput {
  range?: CampaignRangeKey;
  granularity?: CampaignGranularity;
  saveToDisk?: boolean;
  forceRefresh?: boolean;
}

export async function getCampaignReport(input: CampaignReportActionInput = {}): Promise<ActionResult<CampaignReport>> {
  try {
    const range: CampaignRangeKey = VALID_RANGES.includes(input.range as CampaignRangeKey)
      ? (input.range as CampaignRangeKey)
      : "last-4-weeks";
    const granularity: CampaignGranularity = VALID_GRANULARITIES.includes(input.granularity as CampaignGranularity)
      ? (input.granularity as CampaignGranularity)
      : "day";

    const data = await runCampaignReport({
      range,
      granularity,
      includeDaily: true,
      includeDemographics: true,
      includePrevious: true,
      saveToDisk: Boolean(input.saveToDisk),
      forceRefresh: Boolean(input.forceRefresh),
    });
    return { ok: true, data };
  } catch (err) {
    console.error(err);
    return { ok: false, error: toError(err) };
  }
}
```

With:
```ts
export interface CampaignReportActionInput {
  start: string;
  end: string;
  granularity?: CampaignGranularity;
  saveToDisk?: boolean;
  forceRefresh?: boolean;
}

export async function getCampaignReport(input: CampaignReportActionInput): Promise<ActionResult<CampaignReport>> {
  try {
    const rangeError = validateDateRange(input.start, input.end);
    if (rangeError) return { ok: false, error: rangeError };

    const granularity: CampaignGranularity = VALID_GRANULARITIES.includes(input.granularity as CampaignGranularity)
      ? (input.granularity as CampaignGranularity)
      : "day";

    const data = await runCampaignReport({
      dateRange: { start: input.start, end: input.end },
      granularity,
      includeDaily: true,
      includeDemographics: true,
      includePrevious: true,
      saveToDisk: Boolean(input.saveToDisk),
      forceRefresh: Boolean(input.forceRefresh),
    });
    return { ok: true, data };
  } catch (err) {
    console.error(err);
    return { ok: false, error: toError(err) };
  }
}
```

- [ ] **Step 3: Update `QualityScoreActionInput` and `getQualityScore`**

Replace:
```ts
export interface QualityScoreActionInput {
  range?: CampaignRangeKey;
  forceRefresh?: boolean;
}

export async function getQualityScore(input: QualityScoreActionInput = {}): Promise<ActionResult<QualityScoreReport>> {
  try {
    const range: CampaignRangeKey = VALID_RANGES.includes(input.range as CampaignRangeKey)
      ? (input.range as CampaignRangeKey)
      : "last-4-weeks";
    const data = await runQualityScore({ range, forceRefresh: Boolean(input.forceRefresh) });
    return { ok: true, data };
  } catch (err) {
    console.error(err);
    return { ok: false, error: toError(err) };
  }
}
```

With:
```ts
export interface QualityScoreActionInput {
  start: string;
  end: string;
  forceRefresh?: boolean;
}

export async function getQualityScore(input: QualityScoreActionInput): Promise<ActionResult<QualityScoreReport>> {
  try {
    const rangeError = validateDateRange(input.start, input.end);
    if (rangeError) return { ok: false, error: rangeError };
    const data = await runQualityScore({ dateRange: { start: input.start, end: input.end }, forceRefresh: Boolean(input.forceRefresh) });
    return { ok: true, data };
  } catch (err) {
    console.error(err);
    return { ok: false, error: toError(err) };
  }
}
```

- [ ] **Step 4: Update `SchedulePerformanceActionInput` and `getSchedulePerformance`**

Replace:
```ts
export interface SchedulePerformanceActionInput {
  range?: CampaignRangeKey;
  forceRefresh?: boolean;
}

export async function getSchedulePerformance(
  input: SchedulePerformanceActionInput = {},
): Promise<ActionResult<SchedulePerformanceReport>> {
  try {
    const range: CampaignRangeKey = VALID_RANGES.includes(input.range as CampaignRangeKey)
      ? (input.range as CampaignRangeKey)
      : "last-4-weeks";
    const data = await runSchedulePerformance({ range, forceRefresh: Boolean(input.forceRefresh) });
    return { ok: true, data };
  } catch (err) {
    console.error(err);
    return { ok: false, error: toError(err) };
  }
}
```

With:
```ts
export interface SchedulePerformanceActionInput {
  start: string;
  end: string;
  forceRefresh?: boolean;
}

export async function getSchedulePerformance(
  input: SchedulePerformanceActionInput,
): Promise<ActionResult<SchedulePerformanceReport>> {
  try {
    const rangeError = validateDateRange(input.start, input.end);
    if (rangeError) return { ok: false, error: rangeError };
    const data = await runSchedulePerformance({ dateRange: { start: input.start, end: input.end }, forceRefresh: Boolean(input.forceRefresh) });
    return { ok: true, data };
  } catch (err) {
    console.error(err);
    return { ok: false, error: toError(err) };
  }
}
```

- [ ] **Step 5: Update `AdGroupReportActionInput` and `getAdGroupReport`**

Replace:
```ts
export interface AdGroupReportActionInput {
  range?: CampaignRangeKey;
  forceRefresh?: boolean;
}

export async function getAdGroupReport(input: AdGroupReportActionInput = {}): Promise<ActionResult<AdGroupReport>> {
  try {
    const range: CampaignRangeKey = VALID_RANGES.includes(input.range as CampaignRangeKey)
      ? (input.range as CampaignRangeKey)
      : "last-4-weeks";
    const data = await runAdGroupReport({ range, forceRefresh: Boolean(input.forceRefresh) });
    return { ok: true, data };
  } catch (err) {
    console.error(err);
    return { ok: false, error: toError(err) };
  }
}
```

With:
```ts
export interface AdGroupReportActionInput {
  start: string;
  end: string;
  forceRefresh?: boolean;
}

export async function getAdGroupReport(input: AdGroupReportActionInput): Promise<ActionResult<AdGroupReport>> {
  try {
    const rangeError = validateDateRange(input.start, input.end);
    if (rangeError) return { ok: false, error: rangeError };
    const data = await runAdGroupReport({ dateRange: { start: input.start, end: input.end }, forceRefresh: Boolean(input.forceRefresh) });
    return { ok: true, data };
  } catch (err) {
    console.error(err);
    return { ok: false, error: toError(err) };
  }
}
```

- [ ] **Step 6: Update `DevicePerformanceActionInput` and `getDevicePerformance`**

Replace:
```ts
export interface DevicePerformanceActionInput {
  range?: CampaignRangeKey;
  forceRefresh?: boolean;
}

export async function getDevicePerformance(
  input: DevicePerformanceActionInput = {},
): Promise<ActionResult<DevicePerformanceReport>> {
  try {
    const range: CampaignRangeKey = VALID_RANGES.includes(input.range as CampaignRangeKey)
      ? (input.range as CampaignRangeKey)
      : "last-4-weeks";
    const data = await runDevicePerformance({ range, forceRefresh: Boolean(input.forceRefresh) });
    return { ok: true, data };
  } catch (err) {
    console.error(err);
    return { ok: false, error: toError(err) };
  }
}
```

With:
```ts
export interface DevicePerformanceActionInput {
  start: string;
  end: string;
  forceRefresh?: boolean;
}

export async function getDevicePerformance(
  input: DevicePerformanceActionInput,
): Promise<ActionResult<DevicePerformanceReport>> {
  try {
    const rangeError = validateDateRange(input.start, input.end);
    if (rangeError) return { ok: false, error: rangeError };
    const data = await runDevicePerformance({ dateRange: { start: input.start, end: input.end }, forceRefresh: Boolean(input.forceRefresh) });
    return { ok: true, data };
  } catch (err) {
    console.error(err);
    return { ok: false, error: toError(err) };
  }
}
```

- [ ] **Step 7: Update `LandingPageReportActionInput` and `getLandingPageReport`**

Replace:
```ts
export interface LandingPageReportActionInput {
  range?: CampaignRangeKey;
  campaign?: string | null;
  forceRefresh?: boolean;
}

export async function getLandingPageReport(
  input: LandingPageReportActionInput = {},
): Promise<ActionResult<LandingPageReport>> {
  try {
    const range: CampaignRangeKey = VALID_RANGES.includes(input.range as CampaignRangeKey)
      ? (input.range as CampaignRangeKey)
      : "last-4-weeks";
    const campaign = input.campaign?.trim() ? input.campaign.trim() : null;
    const data = await runLandingPageReport({ range, campaign, forceRefresh: Boolean(input.forceRefresh) });
    return { ok: true, data };
  } catch (err) {
    console.error(err);
    return { ok: false, error: toError(err) };
  }
}
```

With:
```ts
export interface LandingPageReportActionInput {
  start: string;
  end: string;
  campaign?: string | null;
  forceRefresh?: boolean;
}

export async function getLandingPageReport(
  input: LandingPageReportActionInput,
): Promise<ActionResult<LandingPageReport>> {
  try {
    const rangeError = validateDateRange(input.start, input.end);
    if (rangeError) return { ok: false, error: rangeError };
    const campaign = input.campaign?.trim() ? input.campaign.trim() : null;
    const data = await runLandingPageReport({ dateRange: { start: input.start, end: input.end }, campaign, forceRefresh: Boolean(input.forceRefresh) });
    return { ok: true, data };
  } catch (err) {
    console.error(err);
    return { ok: false, error: toError(err) };
  }
}
```

- [ ] **Step 8: Update `KeywordSearchTermMapActionInput` and `getKeywordSearchTermMap`**

Replace:
```ts
export interface KeywordSearchTermMapActionInput {
  range?: CampaignRangeKey;
  campaign?: string | null;
  top?: number;
  forceRefresh?: boolean;
}

export async function getKeywordSearchTermMap(
  input: KeywordSearchTermMapActionInput = {},
): Promise<ActionResult<KeywordSearchTermMapReport>> {
  try {
    const range: CampaignRangeKey = VALID_RANGES.includes(input.range as CampaignRangeKey)
      ? (input.range as CampaignRangeKey)
      : "last-4-weeks";
    const campaign = input.campaign?.trim() ? input.campaign.trim() : null;
    const topNum = Number(input.top);
    const top = Number.isFinite(topNum) && topNum > 0 ? Math.min(Math.floor(topNum), 1000) : 300;
    const data = await runKeywordSearchTermMap({ range, campaign, top, forceRefresh: Boolean(input.forceRefresh) });
    return { ok: true, data };
  } catch (err) {
    console.error(err);
    return { ok: false, error: toError(err) };
  }
}
```

With:
```ts
export interface KeywordSearchTermMapActionInput {
  start: string;
  end: string;
  campaign?: string | null;
  top?: number;
  forceRefresh?: boolean;
}

export async function getKeywordSearchTermMap(
  input: KeywordSearchTermMapActionInput,
): Promise<ActionResult<KeywordSearchTermMapReport>> {
  try {
    const rangeError = validateDateRange(input.start, input.end);
    if (rangeError) return { ok: false, error: rangeError };
    const campaign = input.campaign?.trim() ? input.campaign.trim() : null;
    const topNum = Number(input.top);
    const top = Number.isFinite(topNum) && topNum > 0 ? Math.min(Math.floor(topNum), 1000) : 300;
    const data = await runKeywordSearchTermMap({ dateRange: { start: input.start, end: input.end }, campaign, top, forceRefresh: Boolean(input.forceRefresh) });
    return { ok: true, data };
  } catch (err) {
    console.error(err);
    return { ok: false, error: toError(err) };
  }
}
```

- [ ] **Step 9: Update `AdPerformanceActionInput` and `getAdPerformance`**

Replace:
```ts
export interface AdPerformanceActionInput {
  range?: CampaignRangeKey;
  campaign?: string | null;
  forceRefresh?: boolean;
}

export async function getAdPerformance(
  input: AdPerformanceActionInput = {},
): Promise<ActionResult<AdPerformanceReport>> {
  try {
    const range: CampaignRangeKey = VALID_RANGES.includes(input.range as CampaignRangeKey)
      ? (input.range as CampaignRangeKey)
      : "last-4-weeks";
    const campaign = input.campaign?.trim() ? input.campaign.trim() : null;
    const data = await runAdPerformance({ range, campaign, forceRefresh: Boolean(input.forceRefresh) });
    return { ok: true, data };
  } catch (err) {
    console.error(err);
    return { ok: false, error: toError(err) };
  }
}
```

With:
```ts
export interface AdPerformanceActionInput {
  start: string;
  end: string;
  campaign?: string | null;
  forceRefresh?: boolean;
}

export async function getAdPerformance(
  input: AdPerformanceActionInput,
): Promise<ActionResult<AdPerformanceReport>> {
  try {
    const rangeError = validateDateRange(input.start, input.end);
    if (rangeError) return { ok: false, error: rangeError };
    const campaign = input.campaign?.trim() ? input.campaign.trim() : null;
    const data = await runAdPerformance({ dateRange: { start: input.start, end: input.end }, campaign, forceRefresh: Boolean(input.forceRefresh) });
    return { ok: true, data };
  } catch (err) {
    console.error(err);
    return { ok: false, error: toError(err) };
  }
}
```

- [ ] **Step 10: Update `AuctionInsightsActionInput` and `getAuctionInsights`**

Replace:
```ts
export interface AuctionInsightsActionInput {
  range?: CampaignRangeKey;
  campaign?: string | null;
  forceRefresh?: boolean;
}

export async function getAuctionInsights(
  input: AuctionInsightsActionInput = {},
): Promise<ActionResult<AuctionInsightReport>> {
  try {
    const range: CampaignRangeKey = VALID_RANGES.includes(input.range as CampaignRangeKey)
      ? (input.range as CampaignRangeKey)
      : "last-4-weeks";
    const campaign = input.campaign?.trim() ? input.campaign.trim() : null;
    const data = await runAuctionInsights({ range, campaign, forceRefresh: Boolean(input.forceRefresh) });
    return { ok: true, data };
  } catch (err) {
    console.error(err);
    return { ok: false, error: toError(err) };
  }
}
```

With:
```ts
export interface AuctionInsightsActionInput {
  start: string;
  end: string;
  campaign?: string | null;
  forceRefresh?: boolean;
}

export async function getAuctionInsights(
  input: AuctionInsightsActionInput,
): Promise<ActionResult<AuctionInsightReport>> {
  try {
    const rangeError = validateDateRange(input.start, input.end);
    if (rangeError) return { ok: false, error: rangeError };
    const campaign = input.campaign?.trim() ? input.campaign.trim() : null;
    const data = await runAuctionInsights({ dateRange: { start: input.start, end: input.end }, campaign, forceRefresh: Boolean(input.forceRefresh) });
    return { ok: true, data };
  } catch (err) {
    console.error(err);
    return { ok: false, error: toError(err) };
  }
}
```

- [ ] **Step 11: Run typecheck and lint**

```bash
pnpm typecheck && pnpm check:fix
```

Expected: errors only in the 9 UI page components (still calling old `range`-based signatures) and in `mcp-server.ts`. The data layer and actions are now type-clean.

- [ ] **Step 12: Commit**

```bash
git add src/app/actions/google-ads.ts
git commit -m "refactor(actions): 9 actions accept start/end ISO dates instead of CampaignRangeKey"
```

---

## Task 6: Create `src/components/date-range-picker.tsx`

**Files:**
- Create: `src/components/date-range-picker.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useState } from "react";

import { CalendarIcon } from "lucide-react";
import type { DateRange as DayPickerRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { type DatePreset, PRESET_LABELS, resolveDatePreset } from "@/lib/date-presets";
import { cn } from "@/lib/utils";
import type { DateRange } from "@/types/google-ads";

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  className?: string;
}

const PRESETS: DatePreset[] = [
  "today",
  "yesterday",
  "last-7-days",
  "last-14-days",
  "last-30-days",
  "this-week",
  "last-week",
  "this-month",
  "last-month",
  "all-time",
];

function fmtYmd(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const dy = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${dy}`;
}

function formatDisplay(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function toInputFmt(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function fromInputFmt(s: string): string | null {
  const parts = s.split("/");
  if (parts.length !== 3) return null;
  const [d, m, y] = parts;
  if (!d || !m || !y || y.length !== 4) return null;
  const iso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return iso;
}

function matchPreset(range: DateRange): DatePreset | null {
  for (const p of PRESETS) {
    const r = resolveDatePreset(p);
    if (r.start === range.start && r.end === range.end) return p;
  }
  return null;
}

export function DateRangePicker({ value, onChange, className }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<DateRange | null>(null);
  const [startInput, setStartInput] = useState("");
  const [endInput, setEndInput] = useState("");
  const [nDaysToday, setNDaysToday] = useState("30");
  const [nDaysYesterday, setNDaysYesterday] = useState("30");

  const current = pending ?? value;

  function handleOpenChange(next: boolean) {
    if (next) {
      setPending(value);
      setStartInput(toInputFmt(value.start));
      setEndInput(toInputFmt(value.end));
    } else {
      setPending(null);
    }
    setOpen(next);
  }

  function applyPreset(preset: DatePreset) {
    onChange(resolveDatePreset(preset));
    setPending(null);
    setOpen(false);
  }

  function applyNDays(n: number, endOffset: number) {
    const end = new Date();
    end.setDate(end.getDate() - endOffset);
    const start = new Date(end);
    start.setDate(start.getDate() - (n - 1));
    onChange({ start: fmtYmd(start), end: fmtYmd(end) });
    setPending(null);
    setOpen(false);
  }

  function handleCalendarSelect(sel: DayPickerRange | undefined) {
    if (!sel?.from) return;
    const start = fmtYmd(sel.from);
    const end = sel.to ? fmtYmd(sel.to) : start;
    setPending({ start, end });
    setStartInput(toInputFmt(start));
    setEndInput(toInputFmt(end));
  }

  function handleStartInput(val: string) {
    setStartInput(val);
    const iso = fromInputFmt(val);
    if (iso && current) {
      const end = iso > current.end ? iso : current.end;
      setPending({ start: iso, end });
    }
  }

  function handleEndInput(val: string) {
    setEndInput(val);
    const iso = fromInputFmt(val);
    if (iso && current) {
      const start = iso < current.start ? iso : current.start;
      setPending({ start, end: iso });
    }
  }

  function handleApply() {
    if (pending) {
      onChange(pending);
      setPending(null);
      setOpen(false);
    }
  }

  function triggerLabel(): string {
    const preset = matchPreset(value);
    if (preset) return PRESET_LABELS[preset];
    return `${formatDisplay(value.start)} – ${formatDisplay(value.end)}`;
  }

  const calFrom = new Date(`${current.start}T00:00:00`);
  const calTo = new Date(`${current.end}T00:00:00`);
  const activeP = matchPreset(current);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn("gap-2", className)}>
          <CalendarIcon className="h-4 w-4" />
          {triggerLabel()}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex">
          {/* Left: Presets */}
          <div className="flex w-44 flex-col gap-0.5 border-r p-2">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => applyPreset(p)}
                className={cn(
                  "rounded px-3 py-1.5 text-left text-sm hover:bg-muted",
                  activeP === p && "bg-muted font-medium",
                )}
              >
                {PRESET_LABELS[p]}
              </button>
            ))}
            <div className="mt-2 flex flex-col gap-1.5 border-t pt-2">
              <div className="flex items-center gap-1">
                <Input
                  className="h-6 w-14 px-1.5 text-xs"
                  value={nDaysToday}
                  onChange={(e) => setNDaysToday(e.target.value)}
                  onBlur={() => {
                    const n = parseInt(nDaysToday, 10);
                    if (n > 0) applyNDays(n, 0);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const n = parseInt(nDaysToday, 10);
                      if (n > 0) applyNDays(n, 0);
                    }
                  }}
                />
                <span className="text-xs text-muted-foreground">days to today</span>
              </div>
              <div className="flex items-center gap-1">
                <Input
                  className="h-6 w-14 px-1.5 text-xs"
                  value={nDaysYesterday}
                  onChange={(e) => setNDaysYesterday(e.target.value)}
                  onBlur={() => {
                    const n = parseInt(nDaysYesterday, 10);
                    if (n > 0) applyNDays(n, 1);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const n = parseInt(nDaysYesterday, 10);
                      if (n > 0) applyNDays(n, 1);
                    }
                  }}
                />
                <span className="text-xs text-muted-foreground">days to yesterday</span>
              </div>
            </div>
          </div>

          {/* Right: Calendar */}
          <div className="p-3">
            <div className="mb-2 flex gap-2">
              <div className="flex flex-col gap-0.5">
                <label className="text-xs text-muted-foreground">Start date</label>
                <Input
                  className="h-7 w-28 text-xs"
                  placeholder="DD/MM/YYYY"
                  value={startInput}
                  onChange={(e) => handleStartInput(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-xs text-muted-foreground">End date</label>
                <Input
                  className="h-7 w-28 text-xs"
                  placeholder="DD/MM/YYYY"
                  value={endInput}
                  onChange={(e) => handleEndInput(e.target.value)}
                />
              </div>
            </div>
            <Calendar
              mode="range"
              selected={{ from: calFrom, to: calTo }}
              onSelect={handleCalendarSelect}
              numberOfMonths={1}
            />
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button size="sm" disabled={!pending} onClick={handleApply}>
                Apply
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Run typecheck and lint**

```bash
pnpm typecheck && pnpm check:fix
```

Expected: no errors in the new file.

- [ ] **Step 3: Commit**

```bash
git add src/components/date-range-picker.tsx
git commit -m "feat: add DateRangePicker component with presets panel and calendar"
```

---

## Task 7: Update 9 page components

**Files:**
- Modify: `src/app/(main)/dashboard/campaigns/_components/campaign-report-card.tsx`
- Modify: `src/app/(main)/dashboard/ad-groups/_components/ad-groups-card.tsx`
- Modify: `src/app/(main)/dashboard/devices/_components/device-performance-card.tsx`
- Modify: `src/app/(main)/dashboard/quality-score/_components/quality-score-card.tsx`
- Modify: `src/app/(main)/dashboard/schedule/_components/schedule-heatmap-card.tsx`
- Modify: `src/app/(main)/dashboard/landing-pages/_components/landing-pages-card.tsx`
- Modify: `src/app/(main)/dashboard/keyword-search-terms/_components/keyword-search-terms-card.tsx`
- Modify: `src/app/(main)/dashboard/ad-performance/_components/ad-performance-card.tsx`
- Modify: `src/app/(main)/dashboard/auction-insights/_components/auction-insights-card.tsx`

### Common pattern (8 non-campaigns pages)

Apply this transformation to each of the 8 pages that have only date range (no granularity):

**1. Imports — remove and add:**
```ts
// Remove:
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CampaignRangeKey, ... } from "@/types/google-ads";

// Add:
import { DateRangePicker } from "@/components/date-range-picker";
import { last30Days } from "@/lib/date-presets";
import type { DateRange, ... } from "@/types/google-ads";
```

**2. Remove `RANGE_OPTIONS` constant** (the 4-element array).

**3. State change:**
```ts
// Before:
const [range, setRange] = useState<CampaignRangeKey>("last-4-weeks");

// After:
const [dateRange, setDateRange] = useState<DateRange>(() => last30Days());
```

**4. Fetch callback signature:**
```ts
// Before:
const fetch = useCallback(async (r: CampaignRangeKey, opts: { forceRefresh?: boolean } = {}) => {
  ...
  const res = await getAction({ range: r, forceRefresh: Boolean(opts.forceRefresh) });
  ...
}, []);

// After:
const fetch = useCallback(async (dr: DateRange, opts: { forceRefresh?: boolean } = {}) => {
  ...
  const res = await getAction({ start: dr.start, end: dr.end, forceRefresh: Boolean(opts.forceRefresh) });
  ...
}, []);
```

**5. useEffect deps:**
```ts
// Before:
useEffect(() => { void fetch(range); }, [fetch, range]);

// After:
useEffect(() => { void fetch(dateRange); }, [fetch, dateRange.start, dateRange.end]);
```

**6. Refresh button onClick:**
```ts
// Before:
onClick={() => void fetch(range, { forceRefresh: true })}

// After:
onClick={() => void fetch(dateRange, { forceRefresh: true })}
```

**7. Replace Select with DateRangePicker:**
```tsx
// Before:
<Select value={range} onValueChange={(v) => setRange(v as CampaignRangeKey)}>
  <SelectTrigger className="w-36">
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    <SelectGroup>
      {RANGE_OPTIONS.map((o) => (
        <SelectItem key={o.value} value={o.value}>
          {o.label}
        </SelectItem>
      ))}
    </SelectGroup>
  </SelectContent>
</Select>

// After:
<DateRangePicker value={dateRange} onChange={setDateRange} />
```

- [ ] **Step 1: Update `device-performance-card.tsx`** (apply the common pattern above)

Additional note: this file also has a `chartMetric` Select — keep that Select import and component; only remove the range Select and its related code.

The `getDevicePerformance` action now takes `{ start, end, forceRefresh }`:
```ts
const res = await getDevicePerformance({ start: dr.start, end: dr.end, forceRefresh: Boolean(opts.forceRefresh) });
```

- [ ] **Step 2: Update `ad-groups-card.tsx`** (apply the common pattern)

- [ ] **Step 3: Update `quality-score-card.tsx`** (apply the common pattern)

- [ ] **Step 4: Update `schedule-heatmap-card.tsx`** (apply the common pattern)

- [ ] **Step 5: Update `landing-pages-card.tsx`** (apply the common pattern; keep `campaign` filter input as-is)

The action call:
```ts
const res = await getLandingPageReport({ start: dr.start, end: dr.end, campaign, forceRefresh: Boolean(opts.forceRefresh) });
```

- [ ] **Step 6: Update `keyword-search-terms-card.tsx`** (apply the common pattern; keep `campaign` filter and `top` parameters)

The action call:
```ts
const res = await getKeywordSearchTermMap({ start: dr.start, end: dr.end, campaign, top, forceRefresh: Boolean(opts.forceRefresh) });
```

- [ ] **Step 7: Update `ad-performance-card.tsx`** (apply the common pattern; keep `campaign` filter input)

The action call:
```ts
const res = await getAdPerformance({ start: dr.start, end: dr.end, campaign, forceRefresh: Boolean(opts.forceRefresh) });
```

- [ ] **Step 8: Update `auction-insights-card.tsx`** (apply the common pattern; keep `campaign` filter input)

The action call:
```ts
const res = await getAuctionInsights({ start: dr.start, end: dr.end, campaign, forceRefresh: Boolean(opts.forceRefresh) });
```

- [ ] **Step 9: Update `campaign-report-card.tsx`** (campaigns page — keeps granularity selector)

This page is different: it keeps the granularity `Select` and has more complex state.

**Imports — remove and add:**
```ts
// Remove:
import type { CampaignGranularity, CampaignRangeKey, CampaignReport, CampaignSummaryRow } from "@/types/google-ads";

// Add:
import type { CampaignGranularity, CampaignReport, CampaignSummaryRow, DateRange } from "@/types/google-ads";

// Add at the top with other component imports:
import { DateRangePicker } from "@/components/date-range-picker";
import { last30Days } from "@/lib/date-presets";
```

**Remove:**
- The `RANGE_OPTIONS` array
- The `rangeLabel` function
- The `currentLabel` variable

**State change:**
```ts
// Before:
const [range, setRange] = useState<CampaignRangeKey>("last-4-weeks");

// After:
const [dateRange, setDateRange] = useState<DateRange>(() => last30Days());
```

**Fetch callback signature:**
```ts
// Before:
const fetchReport = useCallback(
  async (
    selectedRange: CampaignRangeKey,
    selectedGranularity: CampaignGranularity,
    options: { forceRefresh?: boolean } = {},
  ) => {
    ...
    const result = await getCampaignReport({
      range: selectedRange,
      granularity: selectedGranularity,
      forceRefresh: Boolean(options.forceRefresh),
    });
    ...
  },
  [],
);

// After:
const fetchReport = useCallback(
  async (
    selectedDateRange: DateRange,
    selectedGranularity: CampaignGranularity,
    options: { forceRefresh?: boolean } = {},
  ) => {
    ...
    const result = await getCampaignReport({
      start: selectedDateRange.start,
      end: selectedDateRange.end,
      granularity: selectedGranularity,
      forceRefresh: Boolean(options.forceRefresh),
    });
    ...
  },
  [],
);
```

**useEffect:**
```ts
// Before:
useEffect(() => {
  void fetchReport(range, granularity);
}, [fetchReport, range, granularity]);

// After:
useEffect(() => {
  void fetchReport(dateRange, granularity);
}, [fetchReport, dateRange.start, dateRange.end, granularity]);
```

**The OAuth callback useEffect** (the one reading `searchParams`)—change `void fetchReport(range, granularity)` to `void fetchReport(dateRange, granularity)`.

**Refresh button:**
```ts
// Before:
onClick={() => void fetchReport(range, granularity, { forceRefresh: true })}

// After:
onClick={() => void fetchReport(dateRange, granularity, { forceRefresh: true })}
```

**Controls bar — replace range Select with DateRangePicker:**
```tsx
// Before:
<Select value={range} onValueChange={(v) => setRange(v as CampaignRangeKey)}>
  <SelectTrigger className="w-36" aria-label="Date range">
    <SelectValue placeholder="Range" />
  </SelectTrigger>
  <SelectContent>
    <SelectGroup>
      {RANGE_OPTIONS.map((o) => (
        <SelectItem key={o.value} value={o.value}>
          {o.label}
        </SelectItem>
      ))}
    </SelectGroup>
  </SelectContent>
</Select>

// After:
<DateRangePicker value={dateRange} onChange={setDateRange} />
```

Keep the granularity `Select` (day/week/month) exactly as it is.

Remove the `Select` import from the imports line if granularity select is the only remaining Select; otherwise keep it.

Check if `CampaignDailyReportSection` uses `report.range` — if so, remove that prop from the call site (the type no longer has `range`). Typically `period` or `date_range` would be used instead.

- [ ] **Step 10: Run typecheck and lint**

```bash
pnpm typecheck && pnpm check:fix
```

Expected: no errors in any page component. Only `mcp-server.ts` errors remain.

- [ ] **Step 11: Commit**

```bash
git add src/app/\(main\)/dashboard/campaigns/_components/campaign-report-card.tsx \
        src/app/\(main\)/dashboard/ad-groups/_components/ad-groups-card.tsx \
        src/app/\(main\)/dashboard/devices/_components/device-performance-card.tsx \
        src/app/\(main\)/dashboard/quality-score/_components/quality-score-card.tsx \
        src/app/\(main\)/dashboard/schedule/_components/schedule-heatmap-card.tsx \
        src/app/\(main\)/dashboard/landing-pages/_components/landing-pages-card.tsx \
        src/app/\(main\)/dashboard/keyword-search-terms/_components/keyword-search-terms-card.tsx \
        src/app/\(main\)/dashboard/ad-performance/_components/ad-performance-card.tsx \
        src/app/\(main\)/dashboard/auction-insights/_components/auction-insights-card.tsx
git commit -m "feat: replace range Select with DateRangePicker on all 9 dashboard pages"
```

---

## Task 8: Update MCP server (`scripts/mcp-server.ts`)

**Files:**
- Modify: `scripts/mcp-server.ts`

Replace the shared `rangeSchema` with two named schemas and update all 9 affected tools.

- [ ] **Step 1: Replace `rangeSchema` with `start_date`/`end_date` schemas**

Remove:
```ts
const RANGES = ["last-7-days", "last-4-weeks", "last-3-months", "year-to-date"] as const;

const rangeSchema = z
  .enum(RANGES)
  .default("last-4-weeks")
  .describe('Date range: "last-7-days" | "last-4-weeks" | "last-3-months" | "year-to-date"');
```

Add:
```ts
const startDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Start date in YYYY-MM-DD format");
const endDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("End date in YYYY-MM-DD format");
```

- [ ] **Step 2: Update `get_campaign_report` tool**

Replace the schema fields and handler call:
```ts
// Before schema:
{
  range: rangeSchema,
  granularity: z.enum(GRANULARITIES).default("day").describe('Time granularity for daily chart: "day" | "week" | "month"'),
  include_daily: z.boolean().optional().default(true).describe("Include day-by-day breakdown with DoD deltas"),
  include_demographics: z.boolean().optional().default(false).describe("Include age/gender demographic breakdown"),
  force_refresh: forceRefreshSchema,
}

// After schema:
{
  start_date: startDateSchema,
  end_date: endDateSchema,
  granularity: z.enum(GRANULARITIES).default("day").describe('Time granularity for daily chart: "day" | "week" | "month"'),
  include_daily: z.boolean().optional().default(true).describe("Include day-by-day breakdown with DoD deltas"),
  include_demographics: z.boolean().optional().default(false).describe("Include age/gender demographic breakdown"),
  force_refresh: forceRefreshSchema,
}
```

```ts
// Before handler:
async ({ range, granularity, include_daily, include_demographics, force_refresh }) => {
  const data = await runCampaignReport({ range, granularity, includeDaily: include_daily, includeDemographics: include_demographics, forceRefresh: force_refresh });

// After handler:
async ({ start_date, end_date, granularity, include_daily, include_demographics, force_refresh }) => {
  const data = await runCampaignReport({
    dateRange: { start: start_date, end: end_date },
    granularity,
    includeDaily: include_daily,
    includeDemographics: include_demographics,
    forceRefresh: force_refresh,
  });
```

- [ ] **Step 3: Update `get_ad_groups` tool**

```ts
// Before schema: { range: rangeSchema, force_refresh: forceRefreshSchema }
// After schema:
{ start_date: startDateSchema, end_date: endDateSchema, force_refresh: forceRefreshSchema }

// Before handler: async ({ range, force_refresh }) => { const data = await runAdGroupReport({ range, forceRefresh: force_refresh });
// After handler:
async ({ start_date, end_date, force_refresh }) => {
  const data = await runAdGroupReport({ dateRange: { start: start_date, end: end_date }, forceRefresh: force_refresh });
```

- [ ] **Step 4: Update `get_device_performance` tool**

```ts
// Schema: replace range with start_date/end_date
// Handler: async ({ start_date, end_date, force_refresh }) => {
//   const data = await runDevicePerformance({ dateRange: { start: start_date, end: end_date }, forceRefresh: force_refresh });
```

- [ ] **Step 5: Update `get_quality_score` tool**

```ts
// Schema: replace range with start_date/end_date
// Handler: async ({ start_date, end_date, force_refresh }) => {
//   const data = await runQualityScore({ dateRange: { start: start_date, end: end_date }, forceRefresh: force_refresh });
```

- [ ] **Step 6: Update `get_schedule_performance` tool**

```ts
// Schema: replace range with start_date/end_date
// Handler: async ({ start_date, end_date, force_refresh }) => {
//   const data = await runSchedulePerformance({ dateRange: { start: start_date, end: end_date }, forceRefresh: force_refresh });
```

- [ ] **Step 7: Update `get_landing_page_report` tool**

```ts
// Before schema:
{ range: rangeSchema, campaign: z.string().optional().describe("Filter to a specific campaign by name (partial match)"), force_refresh: forceRefreshSchema }

// After schema:
{ start_date: startDateSchema, end_date: endDateSchema, campaign: z.string().optional().describe("Filter to a specific campaign by name (partial match)"), force_refresh: forceRefreshSchema }

// Before handler: async ({ range, campaign, force_refresh }) => {
//   const data = await runLandingPageReport({ range, campaign: campaign ?? null, forceRefresh: force_refresh });

// After handler:
async ({ start_date, end_date, campaign, force_refresh }) => {
  const data = await runLandingPageReport({ dateRange: { start: start_date, end: end_date }, campaign: campaign ?? null, forceRefresh: force_refresh });
```

- [ ] **Step 8: Update `get_keyword_search_term_map` tool**

```ts
// Before schema: { range: rangeSchema, campaign: ..., top: ..., force_refresh: ... }
// After schema: { start_date: startDateSchema, end_date: endDateSchema, campaign: ..., top: ..., force_refresh: ... }

// Before handler: async ({ range, campaign, top, force_refresh }) => {
//   const data = await runKeywordSearchTermMap({ range, campaign: campaign ?? null, top, forceRefresh: force_refresh });

// After handler:
async ({ start_date, end_date, campaign, top, force_refresh }) => {
  const data = await runKeywordSearchTermMap({ dateRange: { start: start_date, end: end_date }, campaign: campaign ?? null, top, forceRefresh: force_refresh });
```

- [ ] **Step 9: Update `get_ad_performance` tool**

```ts
// Before schema: { range: rangeSchema, campaign: ..., force_refresh: ... }
// After schema: { start_date: startDateSchema, end_date: endDateSchema, campaign: ..., force_refresh: ... }

// Before handler: async ({ range, campaign, force_refresh }) => {
//   const data = await runAdPerformance({ range, campaign: campaign ?? null, forceRefresh: force_refresh });

// After handler:
async ({ start_date, end_date, campaign, force_refresh }) => {
  const data = await runAdPerformance({ dateRange: { start: start_date, end: end_date }, campaign: campaign ?? null, forceRefresh: force_refresh });
```

- [ ] **Step 10: Update `get_auction_insights` tool**

```ts
// Before schema: { range: rangeSchema, campaign: ..., force_refresh: ... }
// After schema: { start_date: startDateSchema, end_date: endDateSchema, campaign: ..., force_refresh: ... }

// Before handler: async ({ range, campaign, force_refresh }) => {
//   const data = await runAuctionInsights({ range, campaign: campaign ?? null, forceRefresh: force_refresh });

// After handler:
async ({ start_date, end_date, campaign, force_refresh }) => {
  const data = await runAuctionInsights({ dateRange: { start: start_date, end: end_date }, campaign: campaign ?? null, forceRefresh: force_refresh });
```

- [ ] **Step 11: Run typecheck and lint**

```bash
pnpm typecheck && pnpm check:fix
```

Expected: zero TypeScript errors across the entire project.

- [ ] **Step 12: Commit**

```bash
git add scripts/mcp-server.ts
git commit -m "feat(mcp): 9 tools accept start_date/end_date instead of range enum"
```

---

## Final verification

- [ ] **Full build check**

```bash
pnpm build
```

Expected: build completes without TypeScript or compilation errors.

- [ ] **Verify no stale `CampaignRangeKey` references in lib/actions/components**

```bash
grep -r "CampaignRangeKey" src/lib/google-ads/ src/app/actions/google-ads.ts src/components/ src/app/\(main\)/dashboard/
```

Expected: zero matches (only `src/types/google-ads.ts` retains the type definition, and `src/lib/date-presets.ts` imports it for the backward-compat function — those are fine).

- [ ] **Verify no stale `RANGE_OPTIONS` in page components**

```bash
grep -r "RANGE_OPTIONS" src/app/\(main\)/dashboard/
```

Expected: zero matches.

- [ ] **Verify no stale `rangeSchema` in MCP server**

```bash
grep "rangeSchema" scripts/mcp-server.ts
```

Expected: zero matches.
