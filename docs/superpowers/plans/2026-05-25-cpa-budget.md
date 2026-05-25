# CPA & Budget Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add CPA to the campaign KPI strip and surface daily/period budget data in the campaign table and MCP server response.

**Architecture:** Extend the GAQL query in `report.ts` to fetch `campaign_budget.amount_micros`, compute `periodBudget` server-side, propagate the new fields through the TypeScript types, then update the two UI components and the MCP description. No new files are created — all changes land in existing files.

**Tech Stack:** Next.js 14, TypeScript, `google-ads-api` client, Biome (lint/format), `pnpm typecheck` (tsc --noEmit)

> **Note:** This project has no test suite. Verification steps use `pnpm typecheck && pnpm check` (TypeScript + Biome) in place of unit tests.

---

## File Map

| File | What changes |
|------|-------------|
| `src/types/google-ads.ts` | Add `dailyBudget`, `periodBudget` to `CampaignSummaryRow` |
| `src/lib/google-ads/report.ts` | Add budget fields to GAQL; compute `periodBudget`; bump cache key to `v3` |
| `src/app/(main)/dashboard/campaigns/_components/campaign-kpi-strip.tsx` | Extend `MetricKey` with `"cpa"`; add CPA tile; grid 5→6 cols |
| `src/app/(main)/dashboard/campaigns/_components/campaign-report-card.tsx` | Add `BudgetBar` component; add Budget column header + cell |
| `scripts/mcp-server.ts` | Update `get_campaign_report` tool description |

---

## Task 1: Extend `CampaignSummaryRow` with budget fields

**Files:**
- Modify: `src/types/google-ads.ts:11-26`

- [ ] **Step 1: Add `dailyBudget` and `periodBudget` to `CampaignSummaryRow`**

Open `src/types/google-ads.ts`. The `CampaignSummaryRow` interface currently ends at line 26. Add the two new fields:

```ts
export interface CampaignSummaryRow {
  campaign: string;
  status: string;
  impressions: number;
  clicks: number;
  ctr: string;
  avg_cpc: string;
  spend: string;
  spendRaw: number;
  conversions: number;
  cpa: string;
  cpaRaw: number;
  impressionShare: number | null;
  lostIsBudget: number | null;
  lostIsRank: number | null;
  dailyBudget: number;    // INR (micros / 1_000_000)
  periodBudget: number;   // dailyBudget × days in the selected date range
}
```

- [ ] **Step 2: Verify types compile**

```bash
pnpm typecheck
```

Expected: errors about `dailyBudget` / `periodBudget` missing in `queryCampaignSummaryUncached` — these confirm the type is being enforced and will be fixed in Task 2.

- [ ] **Step 3: Commit**

```bash
git add src/types/google-ads.ts
git commit -m "feat: add dailyBudget and periodBudget to CampaignSummaryRow"
```

---

## Task 2: Fetch budget from Google Ads API and compute period budget

**Files:**
- Modify: `src/lib/google-ads/report.ts:147-250`

- [ ] **Step 1: Bump the cache key and add budget fields to the GAQL query**

In `queryCampaignSummary` (around line 152), change the cache key:

```ts
// Before
const cacheKey = buildCacheKey("report:summary:v2", {

// After
const cacheKey = buildCacheKey("report:summary:v3", {
```

In `queryCampaignSummaryUncached`, extend the GAQL `SELECT` block. The current query ends with `metrics.search_rank_lost_impression_share`. Add the two budget fields before the `FROM` clause:

```ts
const rows = await customer.query(`
  SELECT
    campaign.name,
    campaign.status,
    metrics.clicks,
    metrics.impressions,
    metrics.ctr,
    metrics.cost_micros,
    metrics.conversions,
    metrics.cost_per_conversion,
    metrics.average_cpc,
    metrics.search_impression_share,
    metrics.search_budget_lost_impression_share,
    metrics.search_rank_lost_impression_share,
    campaign_budget.amount_micros,
    campaign_budget.type
  FROM campaign
  WHERE ${gaqlDateFilter}
    AND campaign.status = 'ENABLED'
  ORDER BY metrics.cost_micros DESC
`);
```

- [ ] **Step 2: Compute `rangeDays` and map budget fields onto each campaign row**

At the top of `queryCampaignSummaryUncached`, right after the opening brace, compute the number of days in the range using the existing `daysBetween` helper:

```ts
const rangeStartDate = new Date(`${rangeStart}T00:00:00`);
const rangeEndDate = new Date(`${rangeEnd}T00:00:00`);
const rangeDays = daysBetween(rangeStartDate, rangeEndDate);
```

Then inside the `.map()` that builds each `CampaignSummaryRow`, add budget extraction after the existing `cpaRaw` calculation:

```ts
const b = r.campaign_budget ?? {};
const dailyBudget = Number(b.amount_micros ?? 0) / 1_000_000;
const periodBudget = dailyBudget * rangeDays;
```

Add the fields to the returned object:

```ts
return {
  campaign: String(c.name ?? ""),
  status: String(c.status ?? ""),
  impressions: Number(m.impressions ?? 0),
  clicks: Number(m.clicks ?? 0),
  ctr: `${(ctr * 100).toFixed(2)}%`,
  avg_cpc: `₹${(avgCpc / 1_000_000).toFixed(2)}`,
  spend: `₹${spendRaw.toFixed(2)}`,
  spendRaw,
  conversions: conv,
  cpa: conv > 0 ? `₹${cpaRaw.toFixed(2)}` : "N/A",
  cpaRaw,
  impressionShare: parseIsFraction(m.search_impression_share),
  lostIsBudget: parseIsFraction(m.search_budget_lost_impression_share),
  lostIsRank: parseIsFraction(m.search_rank_lost_impression_share),
  dailyBudget,
  periodBudget,
};
```

- [ ] **Step 3: Verify types compile clean**

```bash
pnpm typecheck
```

Expected: no errors (Task 1 added the type; Task 2 satisfies it).

- [ ] **Step 4: Run Biome**

```bash
pnpm check:fix
```

Expected: no errors after auto-fix.

- [ ] **Step 5: Commit**

```bash
git add src/lib/google-ads/report.ts
git commit -m "feat: fetch campaign budget from Google Ads API and compute period budget"
```

---

## Task 3: Add CPA tile to the KPI strip

**Files:**
- Modify: `src/app/(main)/dashboard/campaigns/_components/campaign-kpi-strip.tsx`

- [ ] **Step 1: Extend `MetricKey` to include `"cpa"`**

Find the `MetricKey` type alias (around line 13):

```ts
// Before
type MetricKey = keyof Pick<CampaignTotalsRaw, "impressions" | "clicks" | "ctr" | "spend" | "conversions">;

// After
type MetricKey = keyof Pick<CampaignTotalsRaw, "impressions" | "clicks" | "ctr" | "spend" | "conversions" | "cpa">;
```

- [ ] **Step 2: Append the CPA metric to `METRICS`**

Find the `METRICS` array (around line 22). Append one new entry after `conversions`:

```ts
const METRICS: readonly MetricSpec[] = [
  {
    key: "impressions",
    label: "Impressions",
    improvement: "higher",
    format: (v) => formatCompactNumber(v),
  },
  {
    key: "clicks",
    label: "Clicks",
    improvement: "higher",
    format: (v) => formatCompactNumber(v),
  },
  {
    key: "ctr",
    label: "CTR",
    improvement: "higher",
    format: (v) => `${(v * 100).toFixed(2)}%`,
  },
  {
    key: "spend",
    label: "Spend",
    improvement: "lower",
    format: (v) => `₹${formatCompactNumber(v)}`,
  },
  {
    key: "conversions",
    label: "Conversions",
    improvement: "higher",
    format: (v) => formatCompactNumber(v),
  },
  {
    key: "cpa",
    label: "CPA",
    improvement: "lower",
    format: (v) => (v > 0 ? `₹${formatCompactNumber(v)}` : "N/A"),
  },
];
```

- [ ] **Step 3: Update the grid column count**

Find the grid class string (around line 83):

```tsx
// Before
<div className="grid divide-y *:data-[slot=card]:rounded-none *:data-[slot=card]:ring-0 md:grid-cols-2 md:divide-x md:divide-y-0 xl:grid-cols-5">

// After
<div className="grid divide-y *:data-[slot=card]:rounded-none *:data-[slot=card]:ring-0 md:grid-cols-2 md:divide-x md:divide-y-0 xl:grid-cols-6">
```

- [ ] **Step 4: Verify and lint**

```bash
pnpm typecheck && pnpm check:fix
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/(main)/dashboard/campaigns/_components/campaign-kpi-strip.tsx
git commit -m "feat: add CPA tile to campaign KPI strip"
```

---

## Task 4: Add BudgetBar component and Budget column to campaign table

**Files:**
- Modify: `src/app/(main)/dashboard/campaigns/_components/campaign-report-card.tsx`

- [ ] **Step 1: Add a `formatBudgetAmount` helper function**

Add this function directly above the `IsBar` component (around line 27). It formats INR amounts compactly, matching the style used in the KPI strip:

```ts
function formatBudgetAmount(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return v.toFixed(0);
}
```

- [ ] **Step 2: Add the `BudgetBar` component**

Add this component directly after `IsBar` (after line ~80):

```tsx
function BudgetBar({
  dailyBudget,
  periodBudget,
  spendRaw,
}: {
  dailyBudget: number;
  periodBudget: number;
  spendRaw: number;
}) {
  if (dailyBudget === 0) {
    return <TableCell className="text-muted-foreground text-xs">—</TableCell>;
  }

  const utilization = periodBudget > 0 ? spendRaw / periodBudget : 0;
  const clampedUtil = Math.min(utilization, 1);
  const days = Math.round(periodBudget / dailyBudget);
  const tooltip = `₹${spendRaw.toFixed(2)} spent of ₹${periodBudget.toFixed(2)} period budget (₹${dailyBudget.toFixed(2)}/day × ${days} days)`;

  const barColor =
    utilization < 0.7
      ? "bg-green-500 dark:bg-green-600"
      : utilization < 1.0
        ? "bg-amber-400 dark:bg-amber-500"
        : "bg-destructive";

  return (
    <TableCell title={tooltip}>
      <div className="flex min-w-[140px] flex-col gap-1">
        <div className="text-xs tabular-nums">{`₹${formatBudgetAmount(dailyBudget)}/day`}</div>
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
          <div className={cn("h-full", barColor)} style={{ width: `${clampedUtil * 100}%` }} />
        </div>
        <div className="text-[10px] tabular-nums text-muted-foreground">{`${(utilization * 100).toFixed(0)}% of period budget`}</div>
      </div>
    </TableCell>
  );
}
```

- [ ] **Step 3: Add the Budget column header to `CampaignsSummaryTable`**

In the `<TableHeader>` block, add a Budget header after the CPA header (around line 137):

```tsx
<TableHeader>
  <TableRow className="hover:bg-transparent">
    <TableHead className="cursor-pointer select-none" onClick={() => toggle("campaign")}>
      Campaign {sortKey === "campaign" ? (sortDir === "asc" ? "↑" : "↓") : ""}
    </TableHead>
    <CampaignSortableTh label="Spend" col="spendRaw" sortKey={sortKey} sortDir={sortDir} onToggle={toggle} />
    <CampaignSortableTh label="Clicks" col="clicks" sortKey={sortKey} sortDir={sortDir} onToggle={toggle} />
    <CampaignSortableTh label="Conv." col="conversions" sortKey={sortKey} sortDir={sortDir} onToggle={toggle} />
    <CampaignSortableTh label="CPA" col="cpaRaw" sortKey={sortKey} sortDir={sortDir} onToggle={toggle} />
    <TableHead
      className="cursor-pointer select-none whitespace-nowrap"
      onClick={() => toggle("impressionShare")}
      title="Impression Share: how often your ad showed vs. how often it was eligible. Bar shows: green = won, amber = lost to budget, red = lost to Quality Score / bid rank."
    >
      Impression Share{sortKey === "impressionShare" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
    </TableHead>
    <TableHead className="whitespace-nowrap">Budget</TableHead>
  </TableRow>
</TableHeader>
```

- [ ] **Step 4: Add the `BudgetBar` cell to each table row**

In the `<TableBody>` section, add `BudgetBar` after `IsBar` in each row (around line 158):

```tsx
<TableRow key={row.campaign}>
  <TableCell className="max-w-[200px] truncate font-medium" title={row.campaign}>
    {row.campaign}
  </TableCell>
  <TableCell className="text-right tabular-nums">{row.spend}</TableCell>
  <TableCell className="text-right tabular-nums">{row.clicks.toLocaleString()}</TableCell>
  <TableCell className="text-right tabular-nums">{row.conversions.toLocaleString()}</TableCell>
  <TableCell className="text-right tabular-nums">{row.cpa}</TableCell>
  <IsBar is={row.impressionShare} lostBudget={row.lostIsBudget} lostRank={row.lostIsRank} />
  <BudgetBar dailyBudget={row.dailyBudget} periodBudget={row.periodBudget} spendRaw={row.spendRaw} />
</TableRow>
```

- [ ] **Step 5: Verify and lint**

```bash
pnpm typecheck && pnpm check:fix
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/(main)/dashboard/campaigns/_components/campaign-report-card.tsx
git commit -m "feat: add BudgetBar component and Budget column to campaign table"
```

---

## Task 5: Update MCP server tool description

**Files:**
- Modify: `scripts/mcp-server.ts:48-75`

- [ ] **Step 1: Update the `get_campaign_report` description string**

Find the `server.tool("get_campaign_report", ...)` call (around line 48). The current description is:

```ts
"Campaign performance summary with optional daily breakdown and demographic data. Returns impressions, clicks, spend, conversions, CTR, CPC, and impression share per campaign plus account totals.",
```

Replace it with:

```ts
"Campaign performance summary with optional daily breakdown and demographic data. Returns impressions, clicks, spend, conversions, CTR, CPC, and impression share per campaign plus account totals. Each campaign row includes dailyBudget (INR/day cap from Google Ads) and periodBudget (dailyBudget × days in range) for budget utilization analysis.",
```

- [ ] **Step 2: Verify and lint**

```bash
pnpm typecheck && pnpm check:fix
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add scripts/mcp-server.ts
git commit -m "docs: update get_campaign_report MCP description to mention budget fields"
```

---

## Self-Review

### Spec coverage

| Spec requirement | Covered by |
|---|---|
| Add `campaign_budget.amount_micros` + `campaign_budget.type` to GAQL | Task 2, Step 1 |
| Add `dailyBudget`, `periodBudget` to `CampaignSummaryRow` | Task 1 |
| Compute `periodBudget` server-side from `rangeStart`/`rangeEnd` | Task 2, Step 2 |
| Bump cache key from `v2` to `v3` | Task 2, Step 1 |
| Add CPA as 6th KPI tile with `improvement: "lower"` | Task 3, Step 2 |
| Extend `MetricKey` to include `"cpa"` | Task 3, Step 1 |
| Grid cols 5→6 | Task 3, Step 3 |
| `BudgetBar` with green/amber/red utilization bar | Task 4, Steps 2–4 |
| Edge case: `dailyBudget === 0` renders `—` | Task 4, Step 2 |
| Tooltip shows spend / period budget / daily × days | Task 4, Step 2 |
| MCP description update | Task 5 |

All spec requirements covered. ✓
