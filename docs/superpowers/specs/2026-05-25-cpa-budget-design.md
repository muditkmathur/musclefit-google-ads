# CPA & Budget Data — Design Spec

**Date:** 2026-05-25  
**Status:** Approved

## Goal

Surface CPA (Cost Per Acquisition) and campaign budget data in the Campaigns dashboard and expose them through the MCP server.

## Scope

Three touch-points, all within the existing Campaigns page:

1. **Data layer** — fetch budget from the Google Ads API and compute period budget server-side.
2. **Dashboard UI** — add CPA to the KPI strip and a budget column to the campaign table.
3. **MCP server** — description update only; budget fields appear automatically in the JSON response.

---

## 1. Data Layer

### GAQL (`src/lib/google-ads/report.ts` → `queryCampaignSummaryUncached`)

Add to the existing `FROM campaign` query:

```sql
campaign_budget.amount_micros,
campaign_budget.type
```

`campaign_budget.amount_micros` is the daily budget cap in micros.  
`campaign_budget.type` is `DAILY` (standard) or `TOTAL_BUDGET` (campaigns with a fixed end date). Fetched for labelling correctness; implementation treats all budgets as daily.

### Types (`src/types/google-ads.ts`)

Add two fields to `CampaignSummaryRow`:

```ts
dailyBudget: number;   // INR (micros / 1_000_000)
periodBudget: number;  // dailyBudget × days in the selected date range
```

`periodBudget` is computed server-side in `queryCampaignSummaryUncached`. The function already receives `rangeStart` / `rangeEnd`, so the day-count can be derived there. No date arithmetic leaks to the UI.

`CampaignTotalsRaw` already carries `cpa: number` — no type changes needed for the KPI strip.

### Cache key

`queryCampaignSummary` uses cache key `report:summary:v2`. Adding new fields to the query changes the data shape, so bump the key to **`report:summary:v3`** to prevent stale cached responses from missing the new fields.

---

## 2. Dashboard UI

### KPI Strip (`campaign-kpi-strip.tsx`)

Add CPA as a 6th tile appended to the `METRICS` array:

```ts
{
  key: "cpa",
  label: "CPA",
  improvement: "lower",
  format: (v) => (v > 0 ? `₹${formatCompactNumber(v)}` : "N/A"),
}
```

`MetricKey` currently restricts to `Pick<CampaignTotalsRaw, "impressions" | "clicks" | "ctr" | "spend" | "conversions">`. Extend it to also include `"cpa"`.

Grid class changes from `xl:grid-cols-5` to `xl:grid-cols-6`.

### Campaign Table (`campaign-report-card.tsx`)

Add a **Budget** column after the CPA column.

**Column header:** `Budget`

**Cell content (new `BudgetBar` component, defined in the same file):**
- Line 1: `₹X,XXX/day` — formatted daily budget cap.
- Progress bar: `spendRaw / periodBudget` (clamped 0–1), coloured:
  - Green: utilization < 70%
  - Amber: 70%–100%
  - Red: > 100% (overspend vs period budget)
- Tooltip: `₹X,XXX spent of ₹X,XXX period budget (₹X,XXX/day × N days)`
- Edge case: if `dailyBudget === 0` (shared budget or API gap), render `—` without a bar.

`BudgetBar` mirrors the existing `IsBar` component in structure (a `TableCell` that owns its own layout).

`CampaignSortKey = keyof CampaignSummaryRow` — `dailyBudget` and `periodBudget` become sortable automatically. No explicit header sort wiring needed beyond adding sortable `<th>` elements for both new fields if desired; at minimum add a non-sortable header cell for the column.

---

## 3. MCP Server (`scripts/mcp-server.ts`)

No logic changes. `get_campaign_report` serialises the full `CampaignReport` response; `dailyBudget` and `periodBudget` will appear on each campaign row automatically once the data layer is updated.

**Description update** — append to the existing tool description string:

> "Each campaign row now includes `dailyBudget` (₹/day cap) and `periodBudget` (dailyBudget × days in range) for budget utilization analysis."

---

## Files Changed

| File | Change |
|------|--------|
| `src/types/google-ads.ts` | Add `dailyBudget`, `periodBudget` to `CampaignSummaryRow` |
| `src/lib/google-ads/report.ts` | Add budget fields to GAQL, compute `periodBudget`, bump cache key to v3 |
| `src/app/(main)/dashboard/campaigns/_components/campaign-kpi-strip.tsx` | Add CPA tile (extend local `MetricKey` type); grid cols 5→6 |
| `src/app/(main)/dashboard/campaigns/_components/campaign-report-card.tsx` | Add `BudgetBar` component; add Budget column to table |
| `scripts/mcp-server.ts` | Update `get_campaign_report` tool description |

## Out of Scope

- Account-level total budget (no meaningful aggregate across campaigns).
- Monthly budget pacing (requires external target, not in the API).
- Budget alerts or notifications.
