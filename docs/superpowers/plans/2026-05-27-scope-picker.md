# Scope Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a global campaign/ad group scope picker to the dashboard header that persists via URL params and filters all 11 dashboard data views.

**Architecture:** A `ScopePicker` client component lives in the persistent dashboard layout header, reads/writes `?campaign` and `?adGroup` URL params, and fetches a one-time list of campaigns + their ad groups from a new `scope-options` lib function. A `useScope()` hook wraps `useSearchParams()` so pages never touch URL params directly. Each card component calls `useScope()` and passes the values to its server action, which passes them to the lib function's GAQL WHERE clause.

**Tech Stack:** Next.js 14 App Router, `useSearchParams` / `useRouter`, lucide-react icons, shadcn/ui Popover + Button, `google-ads-api` GAQL, Redis cache-aside via `getOrSetJson`.

**Spec:** `docs/superpowers/specs/2026-05-27-scope-picker-design.md`

---

## File map

| File | Status | Purpose |
|---|---|---|
| `src/types/google-ads.ts` | Modify | Add `ScopeCampaign`, `ScopeOptions` |
| `src/lib/google-ads/scope-options.ts` | Create | GAQL query: campaigns + ad groups |
| `src/app/actions/google-ads.ts` | Modify | Add `getScopeOptions()`, add `campaign?`/`adGroup?` to 8 actions |
| `src/hooks/use-scope.ts` | Create | `useScope()` hook wrapping `useSearchParams` |
| `src/components/scope-picker.tsx` | Create | Header trigger + hierarchical panel |
| `src/app/(main)/dashboard/layout.tsx` | Modify | Mount `<ScopePicker />` in header |
| `src/lib/google-ads/report.ts` | Modify | Add `campaign?` filter |
| `src/lib/google-ads/ad-group-report.ts` | Modify | Add `campaign?` filter |
| `src/lib/google-ads/schedule-performance.ts` | Modify | Add `campaign?` filter |
| `src/lib/google-ads/device-performance.ts` | Modify | Add `campaign?` filter |
| `src/lib/google-ads/quality-score.ts` | Modify | Add `campaign?` filter |
| `src/lib/google-ads/change-history.ts` | Modify | Add `campaign?` post-fetch filter |
| `src/lib/google-ads/keyword-search-term-map.ts` | Modify | Add `adGroup?` filter |
| `src/lib/google-ads/ad-performance.ts` | Modify | Add `adGroup?` filter |
| `src/app/(main)/dashboard/campaigns/_components/campaign-report-card.tsx` | Modify | Wire `useScope()` |
| `src/app/(main)/dashboard/keyword-analysis/_components/keyword-analysis-card.tsx` | Modify | Wire `useScope()`, remove per-page campaign UI |
| `src/app/(main)/dashboard/ad-groups/_components/ad-groups-card.tsx` | Modify | Wire `useScope()` |
| `src/app/(main)/dashboard/schedule/_components/schedule-heatmap-card.tsx` | Modify | Wire `useScope()` |
| `src/app/(main)/dashboard/devices/_components/device-performance-card.tsx` | Modify | Wire `useScope()` |
| `src/app/(main)/dashboard/history/_components/change-history-card.tsx` | Modify | Wire `useScope()` |
| `src/app/(main)/dashboard/quality-score/_components/quality-score-card.tsx` | Modify | Wire `useScope()` |
| `src/app/(main)/dashboard/landing-pages/_components/landing-pages-card.tsx` | Modify | Wire `useScope()` |
| `src/app/(main)/dashboard/keyword-search-terms/_components/keyword-search-terms-card.tsx` | Modify | Wire `useScope()` |
| `src/app/(main)/dashboard/ad-performance/_components/ad-performance-card.tsx` | Modify | Wire `useScope()`, remove per-page campaign UI |
| `src/app/(main)/dashboard/auction-insights/_components/auction-insights-card.tsx` | Modify | Wire `useScope()` |

---

## Task 1: Add types

**Files:**
- Modify: `src/types/google-ads.ts`

- [ ] **Step 1: Add `ScopeCampaign` and `ScopeOptions` to `src/types/google-ads.ts`**

  Append after the existing `AuctionInsightReport` block (around line 531, after the last export in the file):

  ```ts
  // ---------------------------------------------------------------------------
  // Scope options (campaign / ad group picker)
  // ---------------------------------------------------------------------------

  export interface ScopeCampaign {
    name: string;
    status: string;
    type: string;
    adGroups: Array<{ name: string; status: string }>;
  }

  export interface ScopeOptions {
    generatedAt: string;
    campaigns: ScopeCampaign[];
  }
  ```

- [ ] **Step 2: Run typecheck**

  ```bash
  pnpm typecheck
  ```

  Expected: no errors (new types are additive).

- [ ] **Step 3: Commit**

  ```bash
  git add src/types/google-ads.ts
  git commit -m "feat(types): add ScopeCampaign and ScopeOptions for scope picker"
  ```

---

## Task 2: Create `scope-options` lib function and server action

**Files:**
- Create: `src/lib/google-ads/scope-options.ts`
- Modify: `src/app/actions/google-ads.ts`

- [ ] **Step 1: Create `src/lib/google-ads/scope-options.ts`**

  ```ts
  import { buildCacheKey, getOrSetJson } from "@/lib/cache/query-cache";
  import { CACHE_TTL_SECONDS } from "@/lib/cache/redis";
  import type { ScopeCampaign, ScopeOptions } from "@/types/google-ads";

  import { getCustomer, getCustomerId } from "./client";

  export interface RunScopeOptionsOptions {
    forceRefresh?: boolean;
  }

  export async function runScopeOptions(options: RunScopeOptionsOptions = {}): Promise<ScopeOptions> {
    const cacheKey = buildCacheKey("scope-options:v1", { customerId: getCustomerId() });
    return getOrSetJson<ScopeOptions>(cacheKey, fetchScopeOptions, CACHE_TTL_SECONDS, {
      forceRefresh: options.forceRefresh === true,
    });
  }

  async function fetchScopeOptions(): Promise<ScopeOptions> {
    const customer = await getCustomer();
    const rows = await customer.query(`
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
    `);

    const campaignMap = new Map<string, ScopeCampaign>();

    for (const r of rows) {
      const campaignName = String(r.campaign?.name ?? "");
      if (!campaignName) continue;

      if (!campaignMap.has(campaignName)) {
        campaignMap.set(campaignName, {
          name: campaignName,
          status: String(r.campaign?.status ?? ""),
          type: String(r.campaign?.advertising_channel_type ?? ""),
          adGroups: [],
        });
      }

      const adGroupName = String(r.ad_group?.name ?? "");
      if (adGroupName) {
        campaignMap.get(campaignName)!.adGroups.push({
          name: adGroupName,
          status: String(r.ad_group?.status ?? ""),
        });
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      campaigns: Array.from(campaignMap.values()),
    };
  }
  ```

- [ ] **Step 2: Add `getScopeOptions` to `src/app/actions/google-ads.ts`**

  Add at the top of the file with the other imports:

  ```ts
  import { runScopeOptions } from "@/lib/google-ads/scope-options";
  ```

  Add to the type imports block:

  ```ts
  ScopeOptions,
  ```

  Append at the end of the file:

  ```ts
  export async function getScopeOptions(
    input: { forceRefresh?: boolean } = {},
  ): Promise<ActionResult<ScopeOptions>> {
    try {
      const data = await runScopeOptions({ forceRefresh: Boolean(input.forceRefresh) });
      return { ok: true, data };
    } catch (err) {
      console.error(err);
      return { ok: false, error: toError(err) };
    }
  }
  ```

- [ ] **Step 3: Run typecheck**

  ```bash
  pnpm typecheck
  ```

  Expected: no errors.

- [ ] **Step 4: Commit**

  ```bash
  git add src/lib/google-ads/scope-options.ts src/app/actions/google-ads.ts
  git commit -m "feat: add scope-options lib + getScopeOptions server action"
  ```

---

## Task 3: Create `useScope` hook

**Files:**
- Create: `src/hooks/use-scope.ts`

- [ ] **Step 1: Create `src/hooks/use-scope.ts`**

  ```ts
  "use client";

  import { useSearchParams } from "next/navigation";

  export interface Scope {
    campaign: string | null;
    adGroup: string | null;
  }

  export function useScope(): Scope {
    const params = useSearchParams();
    return {
      campaign: params.get("campaign"),
      adGroup: params.get("adGroup"),
    };
  }
  ```

- [ ] **Step 2: Run typecheck**

  ```bash
  pnpm typecheck
  ```

  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add src/hooks/use-scope.ts
  git commit -m "feat: add useScope hook for reading campaign/adGroup URL params"
  ```

---

## Task 4: Create `ScopePicker` component

**Files:**
- Create: `src/components/scope-picker.tsx`

- [ ] **Step 1: Create `src/components/scope-picker.tsx`**

  ```tsx
  "use client";

  import { useCallback, useEffect, useState } from "react";

  import { useRouter, useSearchParams } from "next/navigation";

  import {
    ChevronDown,
    ChevronUp,
    LayoutGrid,
    MonitorPlay,
    Search,
    ShoppingBag,
    Youtube,
    Zap,
  } from "lucide-react";

  import { getScopeOptions } from "@/app/actions/google-ads";
  import { Button } from "@/components/ui/button";
  import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
  import { cn } from "@/lib/utils";
  import type { ScopeCampaign, ScopeOptions } from "@/types/google-ads";

  type LucideIcon = React.ComponentType<{ className?: string }>;

  const CHANNEL_ICONS: Record<string, LucideIcon> = {
    SEARCH: Search,
    PERFORMANCE_MAX: Zap,
    DISPLAY: MonitorPlay,
    SHOPPING: ShoppingBag,
    VIDEO: Youtube,
  };

  function campaignIcon(type: string): LucideIcon {
    return CHANNEL_ICONS[type] ?? LayoutGrid;
  }

  function truncate(s: string, n: number): string {
    return s.length > n ? `${s.slice(0, n)}…` : s;
  }

  function StatusDot({ status }: { status: string }) {
    return (
      <div
        className={cn(
          "h-1.5 w-1.5 shrink-0 rounded-full",
          status === "ENABLED" ? "bg-green-500" : "bg-yellow-500",
        )}
      />
    );
  }

  interface CampaignRowProps {
    campaign: ScopeCampaign;
    isSelected: boolean;
    isExpanded: boolean;
    currentAdGroup: string | null;
    onSelect: (campaignName: string) => void;
    onToggle: (campaignName: string) => void;
    onSelectAdGroup: (campaignName: string, adGroupName: string) => void;
  }

  function CampaignRow({
    campaign,
    isSelected,
    isExpanded,
    currentAdGroup,
    onSelect,
    onToggle,
    onSelectAdGroup,
  }: CampaignRowProps) {
    const Icon = campaignIcon(campaign.type);
    return (
      <div className="mb-0.5 overflow-hidden rounded-md">
        <div
          className={cn(
            "flex items-center gap-2.5 px-2.5 py-2",
            isSelected && !currentAdGroup && "bg-accent",
            isExpanded && !isSelected && "bg-muted/50",
          )}
        >
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2.5 text-left hover:opacity-80"
            onClick={() => onSelect(campaign.name)}
          >
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded border bg-muted">
              <Icon className="h-3 w-3" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{campaign.name}</div>
              <div className="mt-0.5 flex items-center gap-1">
                <StatusDot status={campaign.status} />
                <span className="text-[10px] capitalize text-muted-foreground">
                  {campaign.status.toLowerCase()}
                </span>
              </div>
            </div>
          </button>
          <button
            type="button"
            className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-background"
            onClick={() => onToggle(campaign.name)}
          >
            <span>
              {campaign.adGroups.length} ad group{campaign.adGroups.length !== 1 ? "s" : ""}
            </span>
            {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        </div>
        {isExpanded && (
          <div className="bg-muted/30 pb-1">
            {campaign.adGroups.map((ag) => {
              const isAgSelected = isSelected && currentAdGroup === ag.name;
              return (
                <button
                  key={ag.name}
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md py-1.5 pl-10 pr-2.5 text-left hover:bg-accent",
                    isAgSelected && "bg-accent",
                  )}
                  onClick={() => onSelectAdGroup(campaign.name, ag.name)}
                >
                  <div>
                    <div className="text-sm">{ag.name}</div>
                    <div className="mt-0.5 flex items-center gap-1">
                      <StatusDot status={ag.status} />
                      <span className="text-[10px] capitalize text-muted-foreground">
                        {ag.status.toLowerCase()}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  export function ScopePicker() {
    const router = useRouter();
    const params = useSearchParams();
    const campaign = params.get("campaign");
    const adGroup = params.get("adGroup");

    const [open, setOpen] = useState(false);
    const [options, setOptions] = useState<ScopeOptions | null>(null);
    const [loadError, setLoadError] = useState(false);
    const [search, setSearch] = useState("");
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    useEffect(() => {
      getScopeOptions()
        .then((result) => {
          if (result.ok) setOptions(result.data);
          else setLoadError(true);
        })
        .catch(() => setLoadError(true));
    }, []);

    const navigate = useCallback(
      (newCampaign: string | null, newAdGroup: string | null) => {
        const url = new URL(window.location.href);
        if (newCampaign) {
          url.searchParams.set("campaign", newCampaign);
        } else {
          url.searchParams.delete("campaign");
        }
        if (newAdGroup) {
          url.searchParams.set("adGroup", newAdGroup);
        } else {
          url.searchParams.delete("adGroup");
        }
        router.replace(`${url.pathname}${url.search}`);
        setOpen(false);
      },
      [router],
    );

    const toggleExpand = useCallback((name: string) => {
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(name)) next.delete(name);
        else next.add(name);
        return next;
      });
    }, []);

    const filtered = options
      ? options.campaigns.filter(
          (c) =>
            !search ||
            c.name.toLowerCase().includes(search.toLowerCase()) ||
            c.adGroups.some((ag) => ag.name.toLowerCase().includes(search.toLowerCase())),
        )
      : [];

    let TriggerIcon: LucideIcon = LayoutGrid;
    let triggerLabel: string;
    if (!campaign) {
      triggerLabel = "All campaigns";
    } else {
      const found = options?.campaigns.find((c) => c.name === campaign);
      if (found) TriggerIcon = campaignIcon(found.type);
      triggerLabel = adGroup
        ? `${truncate(campaign, 18)} › ${truncate(adGroup, 18)}`
        : truncate(campaign, 30);
    }

    if (!options && !loadError) {
      return <div className="h-8 w-36 animate-pulse rounded-md bg-muted" />;
    }

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5 font-medium" disabled={loadError}>
            <TriggerIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="max-w-[200px] truncate">{triggerLabel}</span>
            <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0" align="end">
          <div className="border-b p-3">
            <p className="mb-2 text-sm font-semibold">Select campaign or ad group</p>
            <div className="flex items-center gap-2 rounded-md border px-2 py-1.5">
              <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <input
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                placeholder={`Search ${options?.campaigns.length ?? 0} campaigns`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="max-h-80 overflow-y-auto p-1.5">
            <button
              type="button"
              className={cn(
                "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-accent",
                !campaign && "bg-accent",
              )}
              onClick={() => navigate(null, null)}
            >
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded border bg-muted">
                <LayoutGrid className="h-3 w-3" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold">All campaigns</div>
                <div className="text-xs text-muted-foreground">
                  {options?.campaigns.length ?? 0} campaigns
                </div>
              </div>
            </button>

            {filtered.length > 0 && (
              <p className="mt-1.5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Campaigns
              </p>
            )}

            {filtered.map((c) => (
              <CampaignRow
                key={c.name}
                campaign={c}
                isSelected={campaign === c.name}
                isExpanded={expanded.has(c.name)}
                currentAdGroup={adGroup}
                onSelect={(name) => navigate(name, null)}
                onToggle={toggleExpand}
                onSelectAdGroup={(campaignName, adGroupName) => navigate(campaignName, adGroupName)}
              />
            ))}

            {filtered.length === 0 && search && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No campaigns match &ldquo;{search}&rdquo;
              </p>
            )}
          </div>
        </PopoverContent>
      </Popover>
    );
  }
  ```

- [ ] **Step 2: Run typecheck**

  ```bash
  pnpm typecheck
  ```

  Expected: no errors.

- [ ] **Step 3: Run lint**

  ```bash
  pnpm check:fix
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add src/components/scope-picker.tsx
  git commit -m "feat: add ScopePicker component with hierarchical campaign/ad group panel"
  ```

---

## Task 5: Mount `ScopePicker` in the dashboard layout

**Files:**
- Modify: `src/app/(main)/dashboard/layout.tsx`

- [ ] **Step 1: Update `src/app/(main)/dashboard/layout.tsx`**

  Add `Suspense` import to the existing React import line and add the `ScopePicker` import:

  ```tsx
  import { Suspense, type ReactNode } from "react";
  ```

  ```tsx
  import { ScopePicker } from "@/components/scope-picker";
  ```

  In the `<header>` JSX, find the right-side div (currently `<div className="flex items-center gap-2">`). Add `<ScopePicker />` wrapped in Suspense **before** `<LayoutControls />`:

  ```tsx
  <div className="flex items-center gap-2">
    <Suspense fallback={<div className="h-8 w-36 animate-pulse rounded-md bg-muted" />}>
      <ScopePicker />
    </Suspense>
    <LayoutControls />
    <ThemeSwitcher />
  </div>
  ```

- [ ] **Step 2: Run typecheck**

  ```bash
  pnpm typecheck
  ```

  Expected: no errors.

- [ ] **Step 3: Start dev server and verify the scope picker renders in the header**

  ```bash
  pnpm dev
  ```

  Open `http://localhost:3000/dashboard`. Verify:
  - Scope picker button appears in the header to the left of layout controls
  - Clicking it opens the panel
  - "All campaigns" is shown; campaigns and ad groups load (may need live Google Ads credentials)
  - Selecting a campaign updates the URL to `?campaign=<name>`
  - Selecting an ad group updates the URL to `?campaign=<name>&adGroup=<name>`
  - Navigating to another page preserves the URL params

- [ ] **Step 4: Commit**

  ```bash
  git add src/app/\(main\)/dashboard/layout.tsx
  git commit -m "feat: mount ScopePicker in dashboard layout header"
  ```

---

## Task 6: Extend Tier 2 lib functions with `campaign?` filter

These 6 lib functions currently have no campaign filtering. Each gets a `campaign?: string | null` param added and a WHERE clause appended to its GAQL query (except change-history which uses post-fetch filtering).

**Files:**
- Modify: `src/lib/google-ads/report.ts`
- Modify: `src/lib/google-ads/ad-group-report.ts`
- Modify: `src/lib/google-ads/schedule-performance.ts`
- Modify: `src/lib/google-ads/device-performance.ts`
- Modify: `src/lib/google-ads/quality-score.ts`
- Modify: `src/lib/google-ads/change-history.ts`

### `report.ts`

- [ ] **Step 1: In `src/lib/google-ads/report.ts`, add `campaign?` to `RunCampaignReportOptions`**

  Locate `RunCampaignReportOptions` interface. Add `campaign?: string | null;` after `dateRange`:

  ```ts
  export interface RunCampaignReportOptions {
    dateRange: DateRange;
    campaign?: string | null;
    // ... rest unchanged
  }
  ```

- [ ] **Step 2: Pass `campaign` to the cache key and inner fetch call**

  In `runCampaignReport`, find the `buildCacheKey` call and add `campaignFilter`:

  ```ts
  const campaignFilter = options.campaign?.trim() || null;
  const cacheKey = buildCacheKey("campaign:v1", {
    customerId: getCustomerId(),
    rangeStart: ...,
    rangeEnd: ...,
    campaignFilter,   // add this line
    // ... rest unchanged
  });
  ```

  Then pass `campaignFilter` to the inner fetch function (whatever it's called). Add `campaignFilter` as a parameter to that inner function and its call site.

- [ ] **Step 3: Add WHERE clause in the campaign GAQL query**

  In the inner fetch function, find the GAQL query string. The WHERE clause currently ends with `AND campaign.status = 'ENABLED'`. Add a conditional clause:

  ```ts
  function escapeForGaql(value: string): string {
    return value.replaceAll("'", "\\'");
  }
  ```

  Add this helper if not already present in the file (check first). Then in the query:

  ```ts
  const campaignClause = campaignFilter ? ` AND campaign.name = '${escapeForGaql(campaignFilter)}'` : "";
  // Append ${campaignClause} at the end of the WHERE clause in every GAQL query in this file.
  ```

  Note: `report.ts` has multiple GAQL queries (campaign summary, daily, demographics). Add `${campaignClause}` to each one.

### `ad-group-report.ts`

- [ ] **Step 4: Add `campaign?` to `RunAdGroupReportOptions`, cache key, and WHERE clause**

  In `src/lib/google-ads/ad-group-report.ts`:

  ```ts
  // Add escapeForGaql helper (same as above)
  function escapeForGaql(value: string): string {
    return value.replaceAll("'", "\\'");
  }

  // Updated options interface:
  export interface RunAdGroupReportOptions {
    dateRange: DateRange;
    campaign?: string | null;
    forceRefresh?: boolean;
  }

  // In runAdGroupReport:
  const campaignFilter = options.campaign?.trim() || null;
  const cacheKey = buildCacheKey("ad-groups:v1", {
    customerId: getCustomerId(),
    rangeStart: options.dateRange.start,
    rangeEnd: options.dateRange.end,
    campaignFilter,
  });
  // Pass campaignFilter to fetchAdGroupReport
  return getOrSetJson<AdGroupReport>(cacheKey, () => fetchAdGroupReport(options.dateRange, campaignFilter), ...);

  // Updated fetchAdGroupReport signature:
  async function fetchAdGroupReport(dateRange: { start: string; end: string }, campaignFilter: string | null)

  // In the GAQL query (current WHERE ends with AND ad_group.status = 'ENABLED'):
  const campaignClause = campaignFilter ? ` AND campaign.name = '${escapeForGaql(campaignFilter)}'` : "";
  // ... WHERE clause:
  //   AND ad_group.status = 'ENABLED'${campaignClause}
  ```

### `schedule-performance.ts`

- [ ] **Step 5: Add `campaign?` to `RunSchedulePerformanceOptions`, cache key, and WHERE clause**

  In `src/lib/google-ads/schedule-performance.ts`, apply the same pattern:

  ```ts
  function escapeForGaql(value: string): string {
    return value.replaceAll("'", "\\'");
  }

  export interface RunSchedulePerformanceOptions {
    dateRange: DateRange;
    campaign?: string | null;
    forceRefresh?: boolean;
  }

  // In runSchedulePerformance:
  const campaignFilter = options.campaign?.trim() || null;
  const cacheKey = buildCacheKey("schedule:v1", {   // use whatever the existing namespace is
    customerId: getCustomerId(),
    rangeStart: options.dateRange.start,
    rangeEnd: options.dateRange.end,
    campaignFilter,
  });
  return getOrSetJson(..., () => fetchSchedulePerformance(options.dateRange, campaignFilter), ...);

  // Updated fetch function signature:
  async function fetchSchedulePerformance(dateRange: DateRange, campaignFilter: string | null)

  // In the GAQL WHERE clause (currently ends with AND campaign.status = 'ENABLED'):
  const campaignClause = campaignFilter ? ` AND campaign.name = '${escapeForGaql(campaignFilter)}'` : "";
  // append ${campaignClause} to WHERE clause
  ```

### `device-performance.ts`

- [ ] **Step 6: Add `campaign?` to `RunDevicePerformanceOptions`, cache key, and WHERE clause**

  In `src/lib/google-ads/device-performance.ts`, current interface:
  ```ts
  export interface RunDevicePerformanceOptions {
    dateRange: DateRange;
    forceRefresh?: boolean;
  }
  ```

  Change to:
  ```ts
  export interface RunDevicePerformanceOptions {
    dateRange: DateRange;
    campaign?: string | null;
    forceRefresh?: boolean;
  }
  ```

  In `runDevicePerformance`, after the `options` parameter:
  ```ts
  const campaignFilter = options.campaign?.trim() || null;
  const cacheKey = buildCacheKey("device:v1", {
    customerId: getCustomerId(),
    rangeStart: options.dateRange.start,
    rangeEnd: options.dateRange.end,
    campaignFilter,
  });
  return getOrSetJson<DevicePerformanceReport>(
    cacheKey,
    () => fetchDevicePerformance(options.dateRange, campaignFilter),
    CACHE_TTL_SECONDS,
    { forceRefresh: options.forceRefresh === true },
  );
  ```

  Update `fetchDevicePerformance` signature:
  ```ts
  async function fetchDevicePerformance(dateRange: { start: string; end: string }, campaignFilter: string | null)
  ```

  Add `escapeForGaql` helper and the clause:
  ```ts
  function escapeForGaql(value: string): string {
    return value.replaceAll("'", "\\'");
  }

  // In the query WHERE clause (currently ends with AND campaign.status = 'ENABLED'):
  const campaignClause = campaignFilter ? ` AND campaign.name = '${escapeForGaql(campaignFilter)}'` : "";
  // ... AND campaign.status = 'ENABLED'${campaignClause}
  ```

### `quality-score.ts`

- [ ] **Step 7: Add `campaign?` to `RunQualityScoreOptions`, cache key, and WHERE clause**

  In `src/lib/google-ads/quality-score.ts`, current interface ends at line 60:
  ```ts
  export interface RunQualityScoreOptions {
    dateRange: DateRange;
    forceRefresh?: boolean;
  }
  ```

  Change to:
  ```ts
  export interface RunQualityScoreOptions {
    dateRange: DateRange;
    campaign?: string | null;
    forceRefresh?: boolean;
  }
  ```

  In `runQualityScore`:
  ```ts
  const campaignFilter = options.campaign?.trim() || null;
  const cacheKey = buildCacheKey("quality-score:v4", {
    customerId: getCustomerId(),
    rangeStart: options.dateRange.start,
    rangeEnd: options.dateRange.end,
    campaignFilter,
  });
  return getOrSetJson<QualityScoreReport>(
    cacheKey,
    () => fetchQualityScore(options.dateRange, campaignFilter),
    CACHE_TTL_SECONDS,
    { forceRefresh: options.forceRefresh === true },
  );
  ```

  Update `fetchQualityScore` signature:
  ```ts
  async function fetchQualityScore(dateRange: { start: string; end: string }, campaignFilter: string | null)
  ```

  Add `escapeForGaql` and WHERE clause:
  ```ts
  function escapeForGaql(value: string): string {
    return value.replaceAll("'", "\\'");
  }

  const campaignClause = campaignFilter ? ` AND campaign.name = '${escapeForGaql(campaignFilter)}'` : "";
  // In the GAQL query FROM ad_group_criterion WHERE clause, append ${campaignClause}
  ```

### `change-history.ts`

- [ ] **Step 8: Add `campaign?` to `RunChangeHistoryOptions` with post-fetch filtering**

  Change history uses a special `change_event` resource; post-fetch filtering is simpler and safe since the result set is bounded (max 30 days). In `src/lib/google-ads/change-history.ts`:

  ```ts
  export interface RunChangeHistoryOptions {
    days?: number;
    campaign?: string | null;
    forceRefresh?: boolean;
  }
  ```

  In `runChangeHistory`, after building `dateRange`, add:
  ```ts
  const campaignFilter = options.campaign?.trim() || null;
  ```

  Do NOT add `campaignFilter` to the cache key — we cache all events and filter post-fetch so scoped and unscoped results share the same cached payload (the result set is bounded, so this is fine):

  ```ts
  // Cache key unchanged — no campaignFilter field
  const cacheKey = buildCacheKey("change-history:v1", {
    customerId: getCustomerId(),
    days,
    bucket: Math.floor(Date.now() / (CHANGE_HISTORY_TTL_SECONDS * 1000)),
  });
  ```

  After `getOrSetJson` returns the report, filter events if a campaign is selected:
  ```ts
  const report = await getOrSetJson<ChangeHistoryReport>(
    cacheKey,
    () => fetchChangeHistory(dateRange, fmtDateTime(start), fmtDateTime(end)),
    CHANGE_HISTORY_TTL_SECONDS,
    { forceRefresh: options.forceRefresh === true },
  );

  if (campaignFilter) {
    return {
      ...report,
      events: report.events.filter((e) => e.campaignName === campaignFilter),
    };
  }
  return report;
  ```

- [ ] **Step 9: Run typecheck**

  ```bash
  pnpm typecheck
  ```

  Expected: no errors.

- [ ] **Step 10: Run lint**

  ```bash
  pnpm check:fix
  ```

- [ ] **Step 11: Commit**

  ```bash
  git add src/lib/google-ads/report.ts src/lib/google-ads/ad-group-report.ts \
    src/lib/google-ads/schedule-performance.ts src/lib/google-ads/device-performance.ts \
    src/lib/google-ads/quality-score.ts src/lib/google-ads/change-history.ts
  git commit -m "feat(lib): add campaign filter to 6 Tier 2 lib functions"
  ```

---

## Task 7: Extend Tier 2 server actions with `campaign?`

**Files:**
- Modify: `src/app/actions/google-ads.ts`

The 6 Tier 2 actions need `campaign?: string | null` added to their input types and passed through to the lib function.

- [ ] **Step 1: Update `CampaignReportActionInput` and `getCampaignReport`**

  ```ts
  export interface CampaignReportActionInput {
    start: string;
    end: string;
    campaign?: string | null;
    granularity?: CampaignGranularity;
    saveToDisk?: boolean;
    forceRefresh?: boolean;
  }

  export async function getCampaignReport(input: CampaignReportActionInput): Promise<ActionResult<CampaignReport>> {
    try {
      const rangeError = validateDateRange(input.start, input.end);
      if (rangeError) return { ok: false, error: rangeError };
      const campaign = input.campaign?.trim() ? input.campaign.trim() : null;
      const granularity: CampaignGranularity = VALID_GRANULARITIES.includes(input.granularity as CampaignGranularity)
        ? (input.granularity as CampaignGranularity)
        : "day";
      const data = await runCampaignReport({
        dateRange: { start: input.start, end: input.end },
        campaign,
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

- [ ] **Step 2: Update `QualityScoreActionInput` and `getQualityScore`**

  ```ts
  export interface QualityScoreActionInput {
    start: string;
    end: string;
    campaign?: string | null;
    forceRefresh?: boolean;
  }

  export async function getQualityScore(input: QualityScoreActionInput): Promise<ActionResult<QualityScoreReport>> {
    try {
      const rangeError = validateDateRange(input.start, input.end);
      if (rangeError) return { ok: false, error: rangeError };
      const campaign = input.campaign?.trim() ? input.campaign.trim() : null;
      const data = await runQualityScore({
        dateRange: { start: input.start, end: input.end },
        campaign,
        forceRefresh: Boolean(input.forceRefresh),
      });
      return { ok: true, data };
    } catch (err) {
      console.error(err);
      return { ok: false, error: toError(err) };
    }
  }
  ```

- [ ] **Step 3: Update `ChangeHistoryActionInput` and `getChangeHistory`**

  ```ts
  export interface ChangeHistoryActionInput {
    days?: number;
    campaign?: string | null;
    forceRefresh?: boolean;
  }

  export async function getChangeHistory(input: ChangeHistoryActionInput = {}): Promise<ActionResult<ChangeHistoryReport>> {
    try {
      const days = Number(input.days);
      const campaign = input.campaign?.trim() ? input.campaign.trim() : null;
      const data = await runChangeHistory({
        days: Number.isFinite(days) && days > 0 ? Math.min(days, 30) : 30,
        campaign,
        forceRefresh: Boolean(input.forceRefresh),
      });
      return { ok: true, data };
    } catch (err) {
      console.error(err);
      return { ok: false, error: toError(err) };
    }
  }
  ```

- [ ] **Step 4: Update `SchedulePerformanceActionInput` and `getSchedulePerformance`**

  ```ts
  export interface SchedulePerformanceActionInput {
    start: string;
    end: string;
    campaign?: string | null;
    forceRefresh?: boolean;
  }

  export async function getSchedulePerformance(input: SchedulePerformanceActionInput): Promise<ActionResult<SchedulePerformanceReport>> {
    try {
      const rangeError = validateDateRange(input.start, input.end);
      if (rangeError) return { ok: false, error: rangeError };
      const campaign = input.campaign?.trim() ? input.campaign.trim() : null;
      const data = await runSchedulePerformance({
        dateRange: { start: input.start, end: input.end },
        campaign,
        forceRefresh: Boolean(input.forceRefresh),
      });
      return { ok: true, data };
    } catch (err) {
      console.error(err);
      return { ok: false, error: toError(err) };
    }
  }
  ```

- [ ] **Step 5: Update `AdGroupReportActionInput` and `getAdGroupReport`**

  ```ts
  export interface AdGroupReportActionInput {
    start: string;
    end: string;
    campaign?: string | null;
    forceRefresh?: boolean;
  }

  export async function getAdGroupReport(input: AdGroupReportActionInput): Promise<ActionResult<AdGroupReport>> {
    try {
      const rangeError = validateDateRange(input.start, input.end);
      if (rangeError) return { ok: false, error: rangeError };
      const campaign = input.campaign?.trim() ? input.campaign.trim() : null;
      const data = await runAdGroupReport({
        dateRange: { start: input.start, end: input.end },
        campaign,
        forceRefresh: Boolean(input.forceRefresh),
      });
      return { ok: true, data };
    } catch (err) {
      console.error(err);
      return { ok: false, error: toError(err) };
    }
  }
  ```

- [ ] **Step 6: Update `DevicePerformanceActionInput` and `getDevicePerformance`**

  ```ts
  export interface DevicePerformanceActionInput {
    start: string;
    end: string;
    campaign?: string | null;
    forceRefresh?: boolean;
  }

  export async function getDevicePerformance(input: DevicePerformanceActionInput): Promise<ActionResult<DevicePerformanceReport>> {
    try {
      const rangeError = validateDateRange(input.start, input.end);
      if (rangeError) return { ok: false, error: rangeError };
      const campaign = input.campaign?.trim() ? input.campaign.trim() : null;
      const data = await runDevicePerformance({
        dateRange: { start: input.start, end: input.end },
        campaign,
        forceRefresh: Boolean(input.forceRefresh),
      });
      return { ok: true, data };
    } catch (err) {
      console.error(err);
      return { ok: false, error: toError(err) };
    }
  }
  ```

- [ ] **Step 7: Run typecheck and lint**

  ```bash
  pnpm typecheck && pnpm check:fix
  ```

  Expected: no errors.

- [ ] **Step 8: Commit**

  ```bash
  git add src/app/actions/google-ads.ts
  git commit -m "feat(actions): add campaign filter to 6 Tier 2 server actions"
  ```

---

## Task 8: Add `adGroup?` filter to Keyword Search Terms and Ad Performance

**Files:**
- Modify: `src/lib/google-ads/keyword-search-term-map.ts`
- Modify: `src/lib/google-ads/ad-performance.ts`
- Modify: `src/app/actions/google-ads.ts`

Both lib functions already have `campaign?: string | null`. They need `adGroup?: string | null` added.

### `keyword-search-term-map.ts`

- [ ] **Step 1: Add `adGroup?` to `RunKeywordSearchTermMapOptions`**

  ```ts
  export interface RunKeywordSearchTermMapOptions {
    dateRange: DateRange;
    campaign?: string | null;
    adGroup?: string | null;
    top?: number;
    forceRefresh?: boolean;
  }
  ```

- [ ] **Step 2: Add `adGroupFilter` to `runKeywordSearchTermMap`**

  ```ts
  export async function runKeywordSearchTermMap(options: RunKeywordSearchTermMapOptions) {
    const campaignFilter = options.campaign?.trim() || null;
    const adGroupFilter = options.adGroup?.trim() || null;
    const top = ...;

    const cacheKey = buildCacheKey("keyword-search-term-map:v1", {
      customerId: getCustomerId(),
      rangeStart: options.dateRange.start,
      rangeEnd: options.dateRange.end,
      campaignFilter,
      adGroupFilter,   // add this
      top,
    });

    return getOrSetJson<KeywordSearchTermMapReport>(
      cacheKey,
      () => fetchKeywordSearchTermMap(options.dateRange, campaignFilter, adGroupFilter, top),
      CACHE_TTL_SECONDS,
      { forceRefresh: options.forceRefresh === true },
    );
  }
  ```

- [ ] **Step 3: Update `fetchKeywordSearchTermMap` signature and WHERE clause**

  ```ts
  async function fetchKeywordSearchTermMap(
    dateRange: DateRange,
    campaignFilter: string | null,
    adGroupFilter: string | null,
    top: number,
  ): Promise<KeywordSearchTermMapReport> {
    const customer = await getCustomer();

    const campaignClause = campaignFilter
      ? ` AND campaign.name LIKE '%${escapeForGaql(campaignFilter)}%'`
      : "";
    const adGroupClause = adGroupFilter
      ? ` AND ad_group.name = '${escapeForGaql(adGroupFilter)}'`
      : "";

    const response = await customer.query(`
      SELECT ...
      FROM search_term_view
      WHERE segments.date BETWEEN '${dateRange.start}' AND '${dateRange.end}'
        AND campaign.status = 'ENABLED'${campaignClause}${adGroupClause}
      ORDER BY metrics.cost_micros DESC
    `);
    // ... rest unchanged
  ```

### `ad-performance.ts`

- [ ] **Step 4: Add `adGroup?` to `RunAdPerformanceOptions`**

  ```ts
  export interface RunAdPerformanceOptions {
    dateRange: DateRange;
    campaign?: string | null;
    adGroup?: string | null;
    forceRefresh?: boolean;
  }
  ```

- [ ] **Step 5: Add `adGroupFilter` to `runAdPerformance`**

  ```ts
  export async function runAdPerformance(options: RunAdPerformanceOptions) {
    const campaignFilter = options.campaign?.trim() || null;
    const adGroupFilter = options.adGroup?.trim() || null;

    const cacheKey = buildCacheKey("ad-performance:v1", {
      customerId: getCustomerId(),
      rangeStart: options.dateRange.start,
      rangeEnd: options.dateRange.end,
      campaignFilter,
      adGroupFilter,   // add this
    });

    return getOrSetJson<AdPerformanceReport>(
      cacheKey,
      () => fetchAdPerformance(options.dateRange, campaignFilter, adGroupFilter),
      CACHE_TTL_SECONDS,
      { forceRefresh: options.forceRefresh === true },
    );
  }
  ```

- [ ] **Step 6: Update `fetchAdPerformance` signature and WHERE clause**

  ```ts
  async function fetchAdPerformance(
    dateRange: DateRange,
    campaignFilter: string | null,
    adGroupFilter: string | null,
  ): Promise<AdPerformanceReport> {
    const customer = await getCustomer();

    const campaignClause = campaignFilter
      ? ` AND campaign.name LIKE '%${escapeForGaql(campaignFilter)}%'`
      : "";
    const adGroupClause = adGroupFilter
      ? ` AND ad_group.name = '${escapeForGaql(adGroupFilter)}'`
      : "";

    const adRows = await customer.query(`
      SELECT ...
      FROM ad_group_ad
      WHERE segments.date BETWEEN '${dateRange.start}' AND '${dateRange.end}'
        AND campaign.status = 'ENABLED'
        AND ad_group.status = 'ENABLED'
        AND ad_group_ad.status != 'REMOVED'${campaignClause}${adGroupClause}
      ORDER BY metrics.cost_micros DESC
    `);
    // ... rest unchanged
  ```

### Server action updates

- [ ] **Step 7: Update `KeywordSearchTermMapActionInput` and `getKeywordSearchTermMap` in `src/app/actions/google-ads.ts`**

  ```ts
  export interface KeywordSearchTermMapActionInput {
    start: string;
    end: string;
    campaign?: string | null;
    adGroup?: string | null;
    top?: number;
    forceRefresh?: boolean;
  }

  export async function getKeywordSearchTermMap(input: KeywordSearchTermMapActionInput): Promise<ActionResult<KeywordSearchTermMapReport>> {
    try {
      const rangeError = validateDateRange(input.start, input.end);
      if (rangeError) return { ok: false, error: rangeError };
      const campaign = input.campaign?.trim() ? input.campaign.trim() : null;
      const adGroup = input.adGroup?.trim() ? input.adGroup.trim() : null;
      const topNum = Number(input.top);
      const top = Number.isFinite(topNum) && topNum > 0 ? Math.min(Math.floor(topNum), 1000) : 300;
      const data = await runKeywordSearchTermMap({
        dateRange: { start: input.start, end: input.end },
        campaign,
        adGroup,
        top,
        forceRefresh: Boolean(input.forceRefresh),
      });
      return { ok: true, data };
    } catch (err) {
      console.error(err);
      return { ok: false, error: toError(err) };
    }
  }
  ```

- [ ] **Step 8: Update `AdPerformanceActionInput` and `getAdPerformance`**

  ```ts
  export interface AdPerformanceActionInput {
    start: string;
    end: string;
    campaign?: string | null;
    adGroup?: string | null;
    forceRefresh?: boolean;
  }

  export async function getAdPerformance(input: AdPerformanceActionInput): Promise<ActionResult<AdPerformanceReport>> {
    try {
      const rangeError = validateDateRange(input.start, input.end);
      if (rangeError) return { ok: false, error: rangeError };
      const campaign = input.campaign?.trim() ? input.campaign.trim() : null;
      const adGroup = input.adGroup?.trim() ? input.adGroup.trim() : null;
      const data = await runAdPerformance({
        dateRange: { start: input.start, end: input.end },
        campaign,
        adGroup,
        forceRefresh: Boolean(input.forceRefresh),
      });
      return { ok: true, data };
    } catch (err) {
      console.error(err);
      return { ok: false, error: toError(err) };
    }
  }
  ```

- [ ] **Step 9: Run typecheck and lint**

  ```bash
  pnpm typecheck && pnpm check:fix
  ```

- [ ] **Step 10: Commit**

  ```bash
  git add src/lib/google-ads/keyword-search-term-map.ts src/lib/google-ads/ad-performance.ts \
    src/app/actions/google-ads.ts
  git commit -m "feat(lib/actions): add adGroup filter to keyword-search-term-map and ad-performance"
  ```

---

## Task 9: Wire `useScope()` into all 11 card components

Each card follows the same pattern. Apply the pattern to all 11 files, then typecheck once at the end.

**Pattern:**
1. Add `import { useScope } from "@/hooks/use-scope";`
2. Add `const scope = useScope();` at the top of the `*CardContent` function (the inner function, not the exported wrapper)
3. Add `scope.campaign` (and `scope.adGroup` where applicable) to the fetch callback arguments, passing them to the action call
4. Add `scope.campaign` and `scope.adGroup` (where applicable) as string deps in the `useEffect` dep array
5. Remove any existing per-page campaign selector UI

### Card 1: `campaign-report-card.tsx`

**File:** `src/app/(main)/dashboard/campaigns/_components/campaign-report-card.tsx`

- [ ] **Step 1: Add `useScope` import and wire into `CampaignReportCardContent`**

  The fetch callback is `fetchReport`. Current signature: `fetchReport(dr: DateRange, selectedGranularity: CampaignGranularity, opts?)`.

  1. Add import: `import { useScope } from "@/hooks/use-scope";`
  2. Add at top of `CampaignReportCardContent`: `const scope = useScope();`
  3. In `fetchReport` useCallback, update the `getCampaignReport` call:
     ```ts
     const result = await getCampaignReport({
       start: dr.start,
       end: dr.end,
       campaign: scope.campaign,
       granularity: selectedGranularity,
     });
     ```
  4. Add `scope.campaign` to useCallback deps and useEffect deps:
     ```ts
     // useCallback deps (existing):
     [scope.campaign]
     // useEffect:
     void fetchReport({ start: dateRange.start, end: dateRange.end }, granularity);
     // deps:
     [fetchReport, dateRange.start, dateRange.end, granularity]
     ```
     Note: `scope.campaign` is captured via closure in `fetchReport`; it is already in the useCallback dep array, so the callback re-creates when scope changes, which triggers the useEffect.

### Card 2: `keyword-analysis-card.tsx`

**File:** `src/app/(main)/dashboard/keyword-analysis/_components/keyword-analysis-card.tsx`

- [ ] **Step 2: Wire scope into keyword analysis card and remove per-page campaign filter**

  This card uses `months` (not `start/end`). The fetch function is `run`:
  ```ts
  const run = useCallback(async (...) => {
    ...
    await getKeywordAnalysisBundle({ months, campaign: null, ... });
  }, [months, weight, top]);
  ```

  1. Add import: `import { useScope } from "@/hooks/use-scope";`
  2. Add at top of component function: `const scope = useScope();`
  3. Change `campaign: null` → `campaign: scope.campaign`
  4. Add `scope.campaign` to `run` useCallback dep array
  5. Add `scope.campaign` to the `useEffect` that calls `run` — check the current deps and add `scope.campaign`
  6. Remove the per-page campaign selector UI: find the JSX block that renders campaign checkboxes/toggles (around the `campaignOptions` variable and `{campaignOptions.length > 0 && (...)}` block). Delete that entire JSX block. Also delete the `selectedCampaigns` state and the `onToggleCampaign` prop from the sub-table component.

### Card 3: `ad-groups-card.tsx`

**File:** `src/app/(main)/dashboard/ad-groups/_components/ad-groups-card.tsx`

- [ ] **Step 3: Wire scope**

  1. Add import: `import { useScope } from "@/hooks/use-scope";`
  2. Add `const scope = useScope();` at top of the content component
  3. Find the `getAdGroupReport` call and add `campaign: scope.campaign`
  4. Add `scope.campaign` to useCallback and useEffect deps

### Card 4: `schedule-heatmap-card.tsx`

**File:** `src/app/(main)/dashboard/schedule/_components/schedule-heatmap-card.tsx`

- [ ] **Step 4: Wire scope**

  1. Add import: `import { useScope } from "@/hooks/use-scope";`
  2. Add `const scope = useScope();` at top of the content component
  3. Find the `getSchedulePerformance` call and add `campaign: scope.campaign`
  4. Add `scope.campaign` to useCallback and useEffect deps

### Card 5: `device-performance-card.tsx`

**File:** `src/app/(main)/dashboard/devices/_components/device-performance-card.tsx`

- [ ] **Step 5: Wire scope**

  The fetch callback is named `fetch`. Current `getDevicePerformance` call:
  ```ts
  const res = await getDevicePerformance({
    start: dr.start,
    end: dr.end,
    forceRefresh: Boolean(opts.forceRefresh),
  });
  ```

  1. Add import: `import { useScope } from "@/hooks/use-scope";`
  2. Add `const scope = useScope();` inside `DevicePerformanceCardContent`
  3. Add `campaign: scope.campaign` to the `getDevicePerformance` call
  4. Add `scope.campaign` to the `fetch` useCallback dep array
  5. The `useEffect` already deps on `[fetch, dateRange.start, dateRange.end]` — since `scope.campaign` is captured in the `fetch` closure and `fetch` is in deps, this is correct; no change needed to `useEffect` deps.

### Card 6: `change-history-card.tsx`

**File:** `src/app/(main)/dashboard/history/_components/change-history-card.tsx`

- [ ] **Step 6: Wire scope**

  The fetch callback is `fetch(d: string, opts?)`. Current call:
  ```ts
  const res = await getChangeHistory({ days: Number(d), forceRefresh: Boolean(opts.forceRefresh) });
  ```

  1. Add import: `import { useScope } from "@/hooks/use-scope";`
  2. Add `const scope = useScope();` inside `ChangeHistoryCardContent`
  3. Add `campaign: scope.campaign` to the `getChangeHistory` call
  4. Add `scope.campaign` to the `fetch` useCallback dep array

### Card 7: `quality-score-card.tsx`

**File:** `src/app/(main)/dashboard/quality-score/_components/quality-score-card.tsx`

- [ ] **Step 7: Wire scope**

  1. Add import: `import { useScope } from "@/hooks/use-scope";`
  2. Add `const scope = useScope();` inside the content component
  3. Find the `getQualityScore` call and add `campaign: scope.campaign`
  4. Add `scope.campaign` to useCallback and useEffect deps

### Card 8: `landing-pages-card.tsx`

**File:** `src/app/(main)/dashboard/landing-pages/_components/landing-pages-card.tsx`

- [ ] **Step 8: Wire scope**

  `getLandingPageReport` already accepts `campaign?`. Check whether the card currently has its own per-page campaign input/filter — if so, remove it.

  1. Add import: `import { useScope } from "@/hooks/use-scope";`
  2. Add `const scope = useScope();` inside the content component
  3. Pass `campaign: scope.campaign` to `getLandingPageReport`
  4. Add `scope.campaign` to useCallback and useEffect deps
  5. Remove any existing per-page campaign selector UI in this card

### Card 9: `keyword-search-terms-card.tsx`

**File:** `src/app/(main)/dashboard/keyword-search-terms/_components/keyword-search-terms-card.tsx`

- [ ] **Step 9: Wire scope (with adGroup)**

  `getKeywordSearchTermMap` now accepts both `campaign?` and `adGroup?`.

  1. Add import: `import { useScope } from "@/hooks/use-scope";`
  2. Add `const scope = useScope();` inside the content component
  3. Pass `campaign: scope.campaign, adGroup: scope.adGroup` to `getKeywordSearchTermMap`
  4. Add `scope.campaign` and `scope.adGroup` to useCallback and useEffect deps
  5. Remove any existing per-page campaign selector UI in this card

### Card 10: `ad-performance-card.tsx`

**File:** `src/app/(main)/dashboard/ad-performance/_components/ad-performance-card.tsx`

- [ ] **Step 10: Wire scope (with adGroup) and remove per-table campaign filter**

  `getAdPerformance` now accepts both `campaign?` and `adGroup?`. The `AdsTable` component has its own `campaignFilter` state (line ~146) and campaign filter buttons UI (lines ~184–208). Remove these.

  1. Add import: `import { useScope } from "@/hooks/use-scope";`
  2. Add `const scope = useScope();` inside `AdPerformanceCardContent`
  3. Pass `campaign: scope.campaign, adGroup: scope.adGroup` to `getAdPerformance`
  4. Add `scope.campaign` and `scope.adGroup` to the `fetch` useCallback dep array

  In `AdsTable` component:
  5. Remove `const [campaignFilter, setCampaignFilter] = useState<string | null>(null);`
  6. Remove the `campaigns` useMemo that builds the campaign list
  7. Remove the JSX block `{campaigns.length > 1 && (<div ...>...</div>)}` that renders campaign filter buttons
  8. Remove `if (campaignFilter) rows = rows.filter(...)` from the `sorted` useMemo — the data is now pre-filtered server-side

### Card 11: `ngram-analysis-card.tsx`

**File:** `src/app/(main)/dashboard/campaigns/_components/ngram-analysis-card.tsx`

- [ ] **Step 11: Wire scope into ngram analysis card**

  This card uses `getNgramAnalysis` which already accepts `campaign?`. Find the fetch function (likely `run` or similar useCallback) and the corresponding useEffect.

  1. Add import: `import { useScope } from "@/hooks/use-scope";`
  2. Add `const scope = useScope();` at top of the content component
  3. Change `campaign: null` (or any existing campaign value) → `campaign: scope.campaign` in the `getNgramAnalysis` call
  4. Add `scope.campaign` to the useCallback deps and ensure the useEffect re-triggers when scope changes
  5. Remove any per-page campaign selector UI if present in this card

### Card 12: `auction-insights-card.tsx`

**File:** `src/app/(main)/dashboard/auction-insights/_components/auction-insights-card.tsx`

- [ ] **Step 12: Wire scope**

  `getAuctionInsights` already accepts `campaign?`. Check for any per-page campaign filter — remove if present.

  1. Add import: `import { useScope } from "@/hooks/use-scope";`
  2. Add `const scope = useScope();` inside the content component
  3. Pass `campaign: scope.campaign` to `getAuctionInsights`
  4. Add `scope.campaign` to useCallback and useEffect deps
  5. Remove any existing per-page campaign selector UI

- [ ] **Step 13: Run typecheck**

  ```bash
  pnpm typecheck
  ```

  Expected: no errors. Fix any type errors before proceeding.

- [ ] **Step 14: Run lint**

  ```bash
  pnpm check:fix
  ```

- [ ] **Step 15: Commit**

  ```bash
  git add \
    src/app/\(main\)/dashboard/campaigns/_components/campaign-report-card.tsx \
    src/app/\(main\)/dashboard/campaigns/_components/ngram-analysis-card.tsx \
    src/app/\(main\)/dashboard/keyword-analysis/_components/keyword-analysis-card.tsx \
    src/app/\(main\)/dashboard/ad-groups/_components/ad-groups-card.tsx \
    src/app/\(main\)/dashboard/schedule/_components/schedule-heatmap-card.tsx \
    src/app/\(main\)/dashboard/devices/_components/device-performance-card.tsx \
    src/app/\(main\)/dashboard/history/_components/change-history-card.tsx \
    src/app/\(main\)/dashboard/quality-score/_components/quality-score-card.tsx \
    src/app/\(main\)/dashboard/landing-pages/_components/landing-pages-card.tsx \
    src/app/\(main\)/dashboard/keyword-search-terms/_components/keyword-search-terms-card.tsx \
    src/app/\(main\)/dashboard/ad-performance/_components/ad-performance-card.tsx \
    src/app/\(main\)/dashboard/auction-insights/_components/auction-insights-card.tsx
  git commit -m "feat: wire useScope into all 12 dashboard card components"
  ```

---

## Task 10: End-to-end verification

- [ ] **Step 1: Final typecheck**

  ```bash
  pnpm typecheck
  ```

  Expected: zero errors.

- [ ] **Step 2: Final lint**

  ```bash
  pnpm check
  ```

  Expected: zero errors or warnings.

- [ ] **Step 3: Start dev server and test golden paths**

  ```bash
  pnpm dev
  ```

  Test the following in the browser:

  1. **All campaigns (default)**: Open `/dashboard/campaigns`. Scope picker shows "All campaigns". Data loads normally.
  2. **Select a campaign**: Click the scope picker, select a campaign. URL updates to `?campaign=<name>`. Navigate to other pages — URL param persists. Campaign report shows only that campaign's data.
  3. **Select an ad group**: Click the picker, expand a campaign, select an ad group. URL shows both params. Keyword search terms and ad performance pages show only that ad group's data. Device/schedule/ad-group pages fall back to campaign-level data silently.
  4. **Search in picker**: Type a campaign name in the search box — list filters correctly.
  5. **Reset to all campaigns**: Open picker, click "All campaigns". URL params are removed.
  6. **Refresh**: Set scope to a campaign, refresh the page. Scope is preserved from URL.
  7. **Share URL**: Copy the URL with `?campaign=...` and open in a new tab. Scope is correct.
