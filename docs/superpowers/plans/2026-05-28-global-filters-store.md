# Global Filters Store Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the date range picker and campaign scope picker from individual page cards into the dashboard navbar, backed by a single Zustand store shared across all pages.

**Architecture:** A new vanilla Zustand store (`filters-store`) holds `dateRange`, `campaign`, and `adGroup`. A context provider wraps the dashboard layout. `useScope` is updated to read from the store; `ScopePicker` writes to the store instead of URL params. A new `NavDateRangePicker` component sits in the navbar; nine card components drop their local `useState<DateRange>` and embedded `DateRangePicker`.

**Tech Stack:** Zustand vanilla store (`zustand/vanilla`), React context, Next.js App Router, TypeScript

---

## File Map

| Action | Path |
|--------|------|
| Create | `src/stores/filters/filters-store.ts` |
| Create | `src/stores/filters/filters-provider.tsx` |
| Create | `src/hooks/use-date-range.ts` |
| Create | `src/components/nav-date-range-picker.tsx` |
| Modify | `src/hooks/use-scope.ts` |
| Modify | `src/components/scope-picker.tsx` |
| Modify | `src/app/(main)/dashboard/layout.tsx` |
| Modify | `src/app/(main)/dashboard/campaigns/_components/campaign-report-card.tsx` |
| Modify | `src/app/(main)/dashboard/ad-groups/_components/ad-groups-card.tsx` |
| Modify | `src/app/(main)/dashboard/devices/_components/device-performance-card.tsx` |
| Modify | `src/app/(main)/dashboard/quality-score/_components/quality-score-card.tsx` |
| Modify | `src/app/(main)/dashboard/schedule/_components/schedule-heatmap-card.tsx` |
| Modify | `src/app/(main)/dashboard/landing-pages/_components/landing-pages-card.tsx` |
| Modify | `src/app/(main)/dashboard/keyword-search-terms/_components/keyword-search-terms-card.tsx` |
| Modify | `src/app/(main)/dashboard/ad-performance/_components/ad-performance-card.tsx` |
| Modify | `src/app/(main)/dashboard/auction-insights/_components/auction-insights-card.tsx` |

---

## Task 1: Create filters store and provider

**Files:**
- Create: `src/stores/filters/filters-store.ts`
- Create: `src/stores/filters/filters-provider.tsx`

- [ ] **Step 1: Create the filters store**

Create `src/stores/filters/filters-store.ts`:

```ts
import { createStore } from "zustand/vanilla";

import { last30Days } from "@/lib/date-presets";
import type { DateRange } from "@/types/google-ads";

export type FiltersState = {
  dateRange: DateRange;
  campaign: string | null;
  adGroup: string | null;
  setDateRange: (range: DateRange) => void;
  setScope: (campaign: string | null, adGroup: string | null) => void;
};

export const createFiltersStore = () =>
  createStore<FiltersState>()((set) => ({
    dateRange: last30Days(),
    campaign: null,
    adGroup: null,
    setDateRange: (range) => set({ dateRange: range }),
    setScope: (campaign, adGroup) => set({ campaign, adGroup }),
  }));
```

- [ ] **Step 2: Create the filters provider**

Create `src/stores/filters/filters-provider.tsx`:

```tsx
"use client";

import { createContext, useContext, useState } from "react";

import { type StoreApi, useStore } from "zustand";

import { createFiltersStore, type FiltersState } from "./filters-store";

const FiltersStoreContext = createContext<StoreApi<FiltersState> | null>(null);

export function FiltersProvider({ children }: { children: React.ReactNode }) {
  const [store] = useState(() => createFiltersStore());
  return <FiltersStoreContext.Provider value={store}>{children}</FiltersStoreContext.Provider>;
}

export function useFiltersStore<T>(selector: (state: FiltersState) => T): T {
  const store = useContext(FiltersStoreContext);
  if (!store) throw new Error("Missing FiltersProvider");
  return useStore(store, selector);
}
```

- [ ] **Step 3: Run typecheck to verify no errors**

```bash
pnpm typecheck
```

Expected: no errors in the two new files.

- [ ] **Step 4: Commit**

```bash
git add src/stores/filters/filters-store.ts src/stores/filters/filters-provider.tsx
git commit -m "feat: add filters store and provider for global date range and scope"
```

---

## Task 2: Create useDateRange hook and update useScope

**Files:**
- Create: `src/hooks/use-date-range.ts`
- Modify: `src/hooks/use-scope.ts`

- [ ] **Step 1: Create useDateRange hook**

Create `src/hooks/use-date-range.ts`:

```ts
"use client";

import { useFiltersStore } from "@/stores/filters/filters-provider";
import type { DateRange } from "@/types/google-ads";

export function useDateRange(): [DateRange, (range: DateRange) => void] {
  const dateRange = useFiltersStore((s) => s.dateRange);
  const setDateRange = useFiltersStore((s) => s.setDateRange);
  return [dateRange, setDateRange];
}
```

- [ ] **Step 2: Update useScope to read from the filters store**

Replace the entire contents of `src/hooks/use-scope.ts` with:

```ts
"use client";

import { useFiltersStore } from "@/stores/filters/filters-provider";

export interface Scope {
  campaign: string | null;
  adGroup: string | null;
}

export function useScope(): Scope {
  const campaign = useFiltersStore((s) => s.campaign);
  const adGroup = useFiltersStore((s) => s.adGroup);
  return { campaign, adGroup };
}
```

- [ ] **Step 3: Run typecheck**

```bash
pnpm typecheck
```

Expected: no errors (the hooks aren't wired to the provider in the layout yet, but the types are valid).

- [ ] **Step 4: Commit**

```bash
git add src/hooks/use-date-range.ts src/hooks/use-scope.ts
git commit -m "feat: add useDateRange hook and update useScope to read from filters store"
```

---

## Task 3: Wire FiltersProvider into the dashboard layout

**Files:**
- Modify: `src/app/(main)/dashboard/layout.tsx`

- [ ] **Step 1: Add FiltersProvider wrapper to layout**

In `src/app/(main)/dashboard/layout.tsx`, add the import and wrap `<SidebarProvider>` with `<FiltersProvider>`.

Add this import after the existing imports:

```ts
import { FiltersProvider } from "@/stores/filters/filters-provider";
```

Wrap the return value — change:

```tsx
  return (
    <SidebarProvider
```

to:

```tsx
  return (
    <FiltersProvider>
      <SidebarProvider
```

And close it — change the final:

```tsx
    </SidebarProvider>
  );
```

to:

```tsx
      </SidebarProvider>
    </FiltersProvider>
  );
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```

Expected: no errors. At this point `useScope` (which now reads from the store) is correctly within the provider boundary.

- [ ] **Step 3: Commit**

```bash
git add src/app/(main)/dashboard/layout.tsx
git commit -m "feat: wrap dashboard layout with FiltersProvider"
```

---

## Task 4: Refactor ScopePicker to write to the filters store

**Files:**
- Modify: `src/components/scope-picker.tsx`

The current `ScopePicker` uses `useRouter` / `useSearchParams` to push `?campaign=&adGroup=` URL params. Replace this with store writes.

- [ ] **Step 1: Replace the router/params imports and usages**

In `src/components/scope-picker.tsx`, remove the `next/navigation` import:

```ts
import { useRouter, useSearchParams } from "next/navigation";
```

Add the store import in its place:

```ts
import { useFiltersStore } from "@/stores/filters/filters-provider";
```

- [ ] **Step 2: Replace router/params state with store reads**

Inside `ScopePicker`, remove these lines:

```ts
  const router = useRouter();
  const params = useSearchParams();
  const campaign = params.get("campaign");
  const adGroup = params.get("adGroup");
```

Replace with:

```ts
  const campaign = useFiltersStore((s) => s.campaign);
  const adGroup = useFiltersStore((s) => s.adGroup);
  const setScope = useFiltersStore((s) => s.setScope);
```

- [ ] **Step 3: Replace the select callback**

Remove the existing `select` callback:

```ts
  const select = useCallback(
    (c: string | null, ag: string | null) => {
      const p = new URLSearchParams(params.toString());
      if (c) {
        p.set("campaign", c);
      } else {
        p.delete("campaign");
      }
      if (ag) {
        p.set("adGroup", ag);
      } else {
        p.delete("adGroup");
      }
      router.push(`?${p.toString()}`);
      setOpen(false);
      setQuery("");
    },
    [router, params],
  );
```

Replace with:

```ts
  const select = useCallback(
    (c: string | null, ag: string | null) => {
      setScope(c, ag);
      setOpen(false);
      setQuery("");
    },
    [setScope],
  );
```

- [ ] **Step 4: Run typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/scope-picker.tsx
git commit -m "feat: refactor ScopePicker to write to filters store instead of URL params"
```

---

## Task 5: Add NavDateRangePicker to the navbar

**Files:**
- Create: `src/components/nav-date-range-picker.tsx`
- Modify: `src/app/(main)/dashboard/layout.tsx`

- [ ] **Step 1: Create NavDateRangePicker component**

Create `src/components/nav-date-range-picker.tsx`:

```tsx
"use client";

import { DateRangePicker } from "@/components/date-range-picker";
import { useDateRange } from "@/hooks/use-date-range";

export function NavDateRangePicker() {
  const [dateRange, setDateRange] = useDateRange();
  return <DateRangePicker value={dateRange} onChange={setDateRange} className="h-8 text-xs" />;
}
```

- [ ] **Step 2: Add NavDateRangePicker to the layout header**

In `src/app/(main)/dashboard/layout.tsx`, add the import:

```ts
import { NavDateRangePicker } from "@/components/nav-date-range-picker";
```

In the header's right-side `<div className="flex items-center gap-2">`, add `<NavDateRangePicker />` before the existing `<Suspense>` block:

```tsx
            <div className="flex items-center gap-2">
              <NavDateRangePicker />
              <Suspense fallback={null}>
                <ScopePicker />
              </Suspense>
              <LayoutControls />
              <ThemeSwitcher />
            </div>
```

(`NavDateRangePicker` reads from Zustand only — no `useSearchParams`, no Suspense needed.)

- [ ] **Step 3: Run typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/nav-date-range-picker.tsx src/app/(main)/dashboard/layout.tsx
git commit -m "feat: add global DateRangePicker to dashboard navbar"
```

---

## Task 6: Update campaign-report-card

**Files:**
- Modify: `src/app/(main)/dashboard/campaigns/_components/campaign-report-card.tsx`

This card is slightly more complex than the others — it has a granularity selector, an OAuth notice handler that re-fetches with `dateRange`, and a `useEffect` that includes `dateRange` in the dependency array.

- [ ] **Step 1: Replace the DateRangePicker import and last30Days import**

Remove:

```ts
import { DateRangePicker } from "@/components/date-range-picker";
```

```ts
import { last30Days } from "@/lib/date-presets";
```

Add:

```ts
import { useDateRange } from "@/hooks/use-date-range";
```

- [ ] **Step 2: Replace local dateRange state with the hook**

Remove:

```ts
  const [dateRange, setDateRange] = useState<DateRange>(() => last30Days());
```

Add (inside `CampaignReportCardContent`):

```ts
  const [dateRange] = useDateRange();
```

- [ ] **Step 3: Remove the DateRangePicker from JSX**

Find this block in the JSX:

```tsx
          <div className="flex items-center gap-2">
            <DateRangePicker value={dateRange} onChange={setDateRange} />

            <Select value={granularity} onValueChange={(v) => setGranularity(v as CampaignGranularity)}>
```

Remove `<DateRangePicker value={dateRange} onChange={setDateRange} />` and the blank line after it, leaving:

```tsx
          <div className="flex items-center gap-2">
            <Select value={granularity} onValueChange={(v) => setGranularity(v as CampaignGranularity)}>
```

- [ ] **Step 4: Run typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/(main)/dashboard/campaigns/_components/campaign-report-card.tsx
git commit -m "feat: remove local date range from campaign-report-card, use global store"
```

---

## Task 7: Update ad-groups-card and device-performance-card

**Files:**
- Modify: `src/app/(main)/dashboard/ad-groups/_components/ad-groups-card.tsx`
- Modify: `src/app/(main)/dashboard/devices/_components/device-performance-card.tsx`

Both cards follow the identical pattern: remove local `dateRange` state + `DateRangePicker`, add `useDateRange()`.

- [ ] **Step 1: Update ad-groups-card — remove imports**

In `src/app/(main)/dashboard/ad-groups/_components/ad-groups-card.tsx`:

Remove:
```ts
import { DateRangePicker } from "@/components/date-range-picker";
```
```ts
import { last30Days } from "@/lib/date-presets";
```

Add:
```ts
import { useDateRange } from "@/hooks/use-date-range";
```

- [ ] **Step 2: Update ad-groups-card — replace state + JSX**

Remove:
```ts
  const [dateRange, setDateRange] = useState<DateRange>(() => last30Days());
```

Add:
```ts
  const [dateRange] = useDateRange();
```

Remove from JSX:
```tsx
          <DateRangePicker value={dateRange} onChange={setDateRange} />
```

(Leave the surrounding `<div className="flex flex-wrap items-center gap-2">` and its other children intact.)

- [ ] **Step 3: Update device-performance-card — remove imports**

In `src/app/(main)/dashboard/devices/_components/device-performance-card.tsx`:

Remove:
```ts
import { DateRangePicker } from "@/components/date-range-picker";
```
```ts
import { last30Days } from "@/lib/date-presets";
```

Add:
```ts
import { useDateRange } from "@/hooks/use-date-range";
```

- [ ] **Step 4: Update device-performance-card — replace state + JSX**

Remove:
```ts
  const [dateRange, setDateRange] = useState<DateRange>(() => last30Days());
```

Add:
```ts
  const [dateRange] = useDateRange();
```

Remove from JSX:
```tsx
          <DateRangePicker value={dateRange} onChange={setDateRange} />
```

- [ ] **Step 5: Run typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/(main)/dashboard/ad-groups/_components/ad-groups-card.tsx src/app/(main)/dashboard/devices/_components/device-performance-card.tsx
git commit -m "feat: remove local date range from ad-groups and device-performance cards"
```

---

## Task 8: Update quality-score-card and schedule-heatmap-card

**Files:**
- Modify: `src/app/(main)/dashboard/quality-score/_components/quality-score-card.tsx`
- Modify: `src/app/(main)/dashboard/schedule/_components/schedule-heatmap-card.tsx`

Same pattern as Task 7.

- [ ] **Step 1: Update quality-score-card — remove imports**

In `src/app/(main)/dashboard/quality-score/_components/quality-score-card.tsx`:

Remove:
```ts
import { DateRangePicker } from "@/components/date-range-picker";
```
```ts
import { last30Days } from "@/lib/date-presets";
```

Add:
```ts
import { useDateRange } from "@/hooks/use-date-range";
```

- [ ] **Step 2: Update quality-score-card — replace state + JSX**

Remove:
```ts
  const [dateRange, setDateRange] = useState<DateRange>(() => last30Days());
```

Add:
```ts
  const [dateRange] = useDateRange();
```

Remove from JSX:
```tsx
          <DateRangePicker value={dateRange} onChange={setDateRange} />
```

- [ ] **Step 3: Update schedule-heatmap-card — remove imports**

In `src/app/(main)/dashboard/schedule/_components/schedule-heatmap-card.tsx`:

Remove:
```ts
import { DateRangePicker } from "@/components/date-range-picker";
```
```ts
import { last30Days } from "@/lib/date-presets";
```

Add:
```ts
import { useDateRange } from "@/hooks/use-date-range";
```

- [ ] **Step 4: Update schedule-heatmap-card — replace state + JSX**

Remove:
```ts
  const [dateRange, setDateRange] = useState<DateRange>(() => last30Days());
```

Add:
```ts
  const [dateRange] = useDateRange();
```

Remove from JSX:
```tsx
          <DateRangePicker value={dateRange} onChange={setDateRange} />
```

- [ ] **Step 5: Run typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/(main)/dashboard/quality-score/_components/quality-score-card.tsx src/app/(main)/dashboard/schedule/_components/schedule-heatmap-card.tsx
git commit -m "feat: remove local date range from quality-score and schedule cards"
```

---

## Task 9: Update landing-pages-card and keyword-search-terms-card

**Files:**
- Modify: `src/app/(main)/dashboard/landing-pages/_components/landing-pages-card.tsx`
- Modify: `src/app/(main)/dashboard/keyword-search-terms/_components/keyword-search-terms-card.tsx`

Same pattern as Task 7.

- [ ] **Step 1: Update landing-pages-card — remove imports**

In `src/app/(main)/dashboard/landing-pages/_components/landing-pages-card.tsx`:

Remove:
```ts
import { DateRangePicker } from "@/components/date-range-picker";
```
```ts
import { last30Days } from "@/lib/date-presets";
```

Add:
```ts
import { useDateRange } from "@/hooks/use-date-range";
```

- [ ] **Step 2: Update landing-pages-card — replace state + JSX**

Remove:
```ts
  const [dateRange, setDateRange] = useState<DateRange>(() => last30Days());
```

Add:
```ts
  const [dateRange] = useDateRange();
```

Remove from JSX:
```tsx
          <DateRangePicker value={dateRange} onChange={setDateRange} />
```

- [ ] **Step 3: Update keyword-search-terms-card — remove imports**

In `src/app/(main)/dashboard/keyword-search-terms/_components/keyword-search-terms-card.tsx`:

Remove:
```ts
import { DateRangePicker } from "@/components/date-range-picker";
```
```ts
import { last30Days } from "@/lib/date-presets";
```

Add:
```ts
import { useDateRange } from "@/hooks/use-date-range";
```

- [ ] **Step 4: Update keyword-search-terms-card — replace state + JSX**

Remove:
```ts
  const [dateRange, setDateRange] = useState<DateRange>(() => last30Days());
```

Add:
```ts
  const [dateRange] = useDateRange();
```

Remove from JSX:
```tsx
          <DateRangePicker value={dateRange} onChange={setDateRange} />
```

- [ ] **Step 5: Run typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/(main)/dashboard/landing-pages/_components/landing-pages-card.tsx src/app/(main)/dashboard/keyword-search-terms/_components/keyword-search-terms-card.tsx
git commit -m "feat: remove local date range from landing-pages and keyword-search-terms cards"
```

---

## Task 10: Update ad-performance-card and auction-insights-card

**Files:**
- Modify: `src/app/(main)/dashboard/ad-performance/_components/ad-performance-card.tsx`
- Modify: `src/app/(main)/dashboard/auction-insights/_components/auction-insights-card.tsx`

Same pattern as Task 7.

- [ ] **Step 1: Update ad-performance-card — remove imports**

In `src/app/(main)/dashboard/ad-performance/_components/ad-performance-card.tsx`:

Remove:
```ts
import { DateRangePicker } from "@/components/date-range-picker";
```
```ts
import { last30Days } from "@/lib/date-presets";
```

Add:
```ts
import { useDateRange } from "@/hooks/use-date-range";
```

- [ ] **Step 2: Update ad-performance-card — replace state + JSX**

Remove:
```ts
  const [dateRange, setDateRange] = useState<DateRange>(() => last30Days());
```

Add:
```ts
  const [dateRange] = useDateRange();
```

Remove from JSX:
```tsx
          <DateRangePicker value={dateRange} onChange={setDateRange} />
```

- [ ] **Step 3: Update auction-insights-card — remove imports**

In `src/app/(main)/dashboard/auction-insights/_components/auction-insights-card.tsx`:

Remove:
```ts
import { DateRangePicker } from "@/components/date-range-picker";
```
```ts
import { last30Days } from "@/lib/date-presets";
```

Add:
```ts
import { useDateRange } from "@/hooks/use-date-range";
```

- [ ] **Step 4: Update auction-insights-card — replace state + JSX**

Remove:
```ts
  const [dateRange, setDateRange] = useState<DateRange>(() => last30Days());
```

Add:
```ts
  const [dateRange] = useDateRange();
```

Remove from JSX:
```tsx
          <DateRangePicker value={dateRange} onChange={setDateRange} />
```

- [ ] **Step 5: Run typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/(main)/dashboard/ad-performance/_components/ad-performance-card.tsx src/app/(main)/dashboard/auction-insights/_components/auction-insights-card.tsx
git commit -m "feat: remove local date range from ad-performance and auction-insights cards"
```

---

## Task 11: Final typecheck and lint

- [ ] **Step 1: Run full typecheck**

```bash
pnpm typecheck
```

Expected: zero errors.

- [ ] **Step 2: Run lint check**

```bash
pnpm check
```

Expected: zero errors. If Biome reports unused imports, run `pnpm check:fix` to auto-fix.

- [ ] **Step 3: Fix any lint issues and commit if needed**

If `pnpm check:fix` made changes:

```bash
git add -A
git commit -m "chore: fix lint issues after global filters store refactor"
```
