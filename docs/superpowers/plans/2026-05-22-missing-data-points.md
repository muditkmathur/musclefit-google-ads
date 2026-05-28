# Missing Data Points Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four missing data points — bid strategy + device modifiers, conversion actions with device split, keyword final URLs, and top-of-page impression share — then expose each via MCP and a dashboard UI page.

**Architecture:** Each data point follows the existing pattern: a `src/lib/google-ads/*.ts` module with a typed `run*` function → a server action in `src/app/actions/google-ads.ts` → an MCP tool in `scripts/mcp-server.ts` → a `src/app/(main)/dashboard/*/page.tsx` with a `_components/` client card. All types are centralised in `src/types/google-ads.ts`.

**Tech Stack:** Next.js 14 App Router, TypeScript, `google-ads-api`, Biome (lint/format), shadcn/ui, Recharts, Redis cache-aside, Zod (MCP schemas).

---

## Missing data points audit

| Data point | Needed for | Currently available? |
|---|---|---|
| Bid strategy type + target CPA per campaign | Explaining why device adjustments aren't available; correcting "set mobile modifier" recommendation when Smart Bidding is active | ❌ Not fetched anywhere |
| Device bid modifiers (campaign_criterion) | Diagnosing 98% desktop split; action 1 in the campaign plan | ❌ Not fetched anywhere |
| Conversion actions list + per-device split | Diagnosing whether mobile WhatsApp clicks are tracked; understanding Smart Bidding signal | ❌ Not fetched anywhere |
| Keyword final URLs | Verifying action 2 (URL remapping) was applied correctly | ❌ `CampaignKeywordRow.finalUrl` field missing |
| Top-of-page IS per keyword | Understanding where in page ads appear; sharpening QS recommendations | ❌ Not in `QualityScoreRow` |

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `src/types/google-ads.ts` | Modify | Add `BidModifiersReport`, `ConversionActionsReport`; add `finalUrl` to `CampaignKeywordRow`; add `topImpressionShare`, `absTopImpressionShare` to `QualityScoreRow` |
| `src/lib/google-ads/bid-modifiers.ts` | Create | GAQL queries for campaign bidding strategy + `campaign_criterion` device/schedule modifiers |
| `src/lib/google-ads/conversion-actions.ts` | Create | GAQL queries for conversion action list + device-segmented conversion metrics |
| `src/lib/google-ads/campaign-keywords.ts` | Modify | Add `ad_group_criterion.final_urls` to SELECT; populate `finalUrl` on each row |
| `src/lib/google-ads/quality-score.ts` | Modify | Add `metrics.search_top_impression_share`, `metrics.search_absolute_top_impression_share` to SELECT |
| `src/app/actions/google-ads.ts` | Modify | Add `getBidModifiers`, `getConversionActions` server actions |
| `scripts/mcp-server.ts` | Modify | Add `get_bid_modifiers`, `get_conversion_actions` MCP tools |
| `src/app/(main)/dashboard/bid-modifiers/page.tsx` | Create | Page shell |
| `src/app/(main)/dashboard/bid-modifiers/_components/bid-modifiers-card.tsx` | Create | Client card: bidding strategy + device modifier table |
| `src/app/(main)/dashboard/conversions/page.tsx` | Create | Page shell |
| `src/app/(main)/dashboard/conversions/_components/conversion-actions-card.tsx` | Create | Client card: conversion action list + device split chart/table |
| `src/navigation/sidebar/sidebar-items.ts` | Modify | Add "Bid modifiers" and "Conversions" to Google Ads group |

---

## Task 1: Types

**Files:**
- Modify: `src/types/google-ads.ts`

- [ ] **Step 1: Add bid modifiers types**

Open `src/types/google-ads.ts` and append after the `AuctionInsightReport` block:

```typescript
// ---------------------------------------------------------------------------
// Bid modifiers
// ---------------------------------------------------------------------------

export type BiddingStrategyType =
  | "MANUAL_CPC"
  | "ENHANCED_CPC"
  | "TARGET_CPA"
  | "TARGET_ROAS"
  | "MAXIMIZE_CONVERSIONS"
  | "MAXIMIZE_CONVERSION_VALUE"
  | "TARGET_IMPRESSION_SHARE"
  | "UNKNOWN";

export interface DeviceModifiers {
  /** null means no modifier set (treated as 0% adjustment). */
  mobile: number | null;
  desktop: number | null;
  tablet: number | null;
}

export interface AdScheduleModifier {
  dayOfWeek: string;
  startHour: number;
  endHour: number;
  /** 0.1–10.0 multiplier (1.0 = no adjustment). */
  modifier: number;
}

export interface CampaignBiddingInfo {
  campaignId: string;
  campaign: string;
  biddingStrategyType: BiddingStrategyType;
  /** Set when strategy is TARGET_CPA or MAXIMIZE_CONVERSIONS with a target. Micros. */
  targetCpaMicros: number | null;
  /** Set when strategy is TARGET_ROAS. Fraction (e.g. 3.0 = 300%). */
  targetRoas: number | null;
  deviceModifiers: DeviceModifiers;
  adScheduleModifiers: AdScheduleModifier[];
}

export interface BidModifiersReport {
  generatedAt: string;
  campaigns: CampaignBiddingInfo[];
}
```

- [ ] **Step 2: Add conversion actions types**

Append after the `BidModifiersReport` block:

```typescript
// ---------------------------------------------------------------------------
// Conversion actions
// ---------------------------------------------------------------------------

export interface ConversionActionRow {
  id: string;
  name: string;
  /** Google Ads category enum label (e.g. "PURCHASE", "LEAD", "PAGE_VIEW"). */
  category: string;
  /** Source type (e.g. "WEBPAGE", "PHONE_CALL", "APP", "UPLOAD_CLICKS"). */
  type: string;
  status: string;
  /** "ONE_PER_CLICK" | "MANY_PER_CLICK". */
  countingType: string;
  /** Whether included in the "Conversions" column (vs. "All conversions"). */
  includeInConversions: boolean;
}

export interface ConversionDeviceRow {
  conversionActionName: string;
  device: string;
  conversions: number;
  allConversions: number;
}

export interface ConversionActionsReport {
  generatedAt: string;
  dateRange: DateRange;
  actions: ConversionActionRow[];
  /** Conversions split by conversion action × device for the date range. */
  deviceBreakdown: ConversionDeviceRow[];
}
```

- [ ] **Step 3: Add `finalUrl` to `CampaignKeywordRow`**

Find the existing `CampaignKeywordRow` interface and add the field:

```typescript
export interface CampaignKeywordRow {
  level: "ad_group" | "campaign";
  campaignId: string | number;
  campaign: string;
  adGroup: string | null;
  criterionId: string | number;
  negative: boolean;
  keyword: string;
  matchType: string | number;
  status: string | number | null;
  /** Keyword-level final URL override. Null when not set (uses ad-level URL). */
  finalUrl: string | null;
}
```

- [ ] **Step 4: Add IS fields to `QualityScoreRow`**

Find the existing `QualityScoreRow` interface and add two fields after `conversions`:

```typescript
export interface QualityScoreRow {
  campaign: string;
  adGroup: string;
  keyword: string;
  matchType: string;
  status: string;
  qualityScore: number | null;
  expectedCtr: QualityScoreComponent;
  adRelevance: QualityScoreComponent;
  landingPageExperience: QualityScoreComponent;
  avgCpc: number;
  maxCpcBid: number | null;
  firstPageCpc: number | null;
  topOfPageCpc: number | null;
  bottleneck: QualityScoreBottleneck;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  /** Fraction of impressions in top positions (above organic). Null when < threshold. */
  topImpressionShare: number | null;
  /** Fraction of impressions in absolute top position (position 1). Null when < threshold. */
  absTopImpressionShare: number | null;
}
```

- [ ] **Step 5: Run typecheck**

```bash
pnpm typecheck
```

Expected: type errors only in files that use the updated interfaces (they reference fields that don't exist yet in the lib modules). Zero errors in `src/types/google-ads.ts` itself.

- [ ] **Step 6: Commit**

```bash
git add src/types/google-ads.ts
git commit -m "feat: add BidModifiersReport, ConversionActionsReport types; extend CampaignKeywordRow and QualityScoreRow"
```

---

## Task 2: Bid Modifiers Library

**Files:**
- Create: `src/lib/google-ads/bid-modifiers.ts`

- [ ] **Step 1: Create the module**

Create `src/lib/google-ads/bid-modifiers.ts`:

```typescript
import { buildCacheKey, getOrSetJson } from "@/lib/cache/query-cache";
import { CACHE_TTL_SECONDS } from "@/lib/cache/redis";
import type {
  AdScheduleModifier,
  BidModifiersReport,
  BiddingStrategyType,
  CampaignBiddingInfo,
  DeviceModifiers,
} from "@/types/google-ads";

import { getCustomer, getCustomerId } from "./client";

const DEVICE_CRITERION_KEY: Record<string, keyof DeviceModifiers> = {
  "2": "desktop",
  DESKTOP: "desktop",
  "4": "mobile",
  MOBILE: "mobile",
  "5": "tablet",
  TABLET: "tablet",
};

const DAY_LABELS: Record<string, string> = {
  "2": "MONDAY",
  "3": "TUESDAY",
  "4": "WEDNESDAY",
  "5": "THURSDAY",
  "6": "FRIDAY",
  "7": "SATURDAY",
  "8": "SUNDAY",
  MONDAY: "MONDAY",
  TUESDAY: "TUESDAY",
  WEDNESDAY: "WEDNESDAY",
  THURSDAY: "THURSDAY",
  FRIDAY: "FRIDAY",
  SATURDAY: "SATURDAY",
  SUNDAY: "SUNDAY",
};

const BIDDING_STRATEGY_LABELS: Record<string, BiddingStrategyType> = {
  MANUAL_CPC: "MANUAL_CPC",
  ENHANCED_CPC: "ENHANCED_CPC",
  TARGET_CPA: "TARGET_CPA",
  TARGET_ROAS: "TARGET_ROAS",
  MAXIMIZE_CONVERSIONS: "MAXIMIZE_CONVERSIONS",
  MAXIMIZE_CONVERSION_VALUE: "MAXIMIZE_CONVERSION_VALUE",
  TARGET_IMPRESSION_SHARE: "TARGET_IMPRESSION_SHARE",
};

export interface RunBidModifiersOptions {
  forceRefresh?: boolean;
}

export async function runBidModifiers(options: RunBidModifiersOptions = {}): Promise<BidModifiersReport> {
  const cacheKey = buildCacheKey("bid-modifiers:v1", { customerId: getCustomerId() });
  return getOrSetJson<BidModifiersReport>(cacheKey, fetchBidModifiers, CACHE_TTL_SECONDS, {
    forceRefresh: options.forceRefresh === true,
  });
}

async function fetchBidModifiers(): Promise<BidModifiersReport> {
  const customer = await getCustomer();

  // Step 1 — fetch bidding strategy per campaign
  const campaignRows = await customer.query(`
    SELECT
      campaign.id,
      campaign.name,
      campaign.bidding_strategy_type,
      campaign.target_cpa.target_cpa_micros,
      campaign.maximize_conversions.target_cpa_micros,
      campaign.target_roas.target_roas
    FROM campaign
    WHERE campaign.status = 'ENABLED'
  `);

  // Step 2 — fetch campaign_criterion for DEVICE and AD_SCHEDULE
  const criterionRows = await customer.query(`
    SELECT
      campaign.id,
      campaign_criterion.type,
      campaign_criterion.bid_modifier,
      campaign_criterion.device.type,
      campaign_criterion.ad_schedule.day_of_week,
      campaign_criterion.ad_schedule.start_hour,
      campaign_criterion.ad_schedule.end_hour
    FROM campaign_criterion
    WHERE campaign.status = 'ENABLED'
      AND campaign_criterion.status != 'REMOVED'
  `);

  // Build modifier maps keyed by campaign id
  const deviceMap = new Map<string, DeviceModifiers>();
  const scheduleMap = new Map<string, AdScheduleModifier[]>();

  for (const r of criterionRows) {
    const campaignId = String(r.campaign?.id ?? "");
    const critType = String(r.campaign_criterion?.type ?? "");
    const modifier = r.campaign_criterion?.bid_modifier != null ? Number(r.campaign_criterion.bid_modifier) : null;

    if (critType === "DEVICE" || critType === "3") {
      const rawDevice = String(r.campaign_criterion?.device?.type ?? "");
      const deviceKey = DEVICE_CRITERION_KEY[rawDevice];
      if (deviceKey && modifier !== null) {
        const existing = deviceMap.get(campaignId) ?? { mobile: null, desktop: null, tablet: null };
        existing[deviceKey] = modifier;
        deviceMap.set(campaignId, existing);
      }
    }

    if (critType === "AD_SCHEDULE" || critType === "7") {
      const sched = r.campaign_criterion?.ad_schedule ?? {};
      const rawDay = String(sched.day_of_week ?? "");
      const dayLabel = DAY_LABELS[rawDay] ?? rawDay;
      if (dayLabel && modifier !== null) {
        const existing = scheduleMap.get(campaignId) ?? [];
        existing.push({
          dayOfWeek: dayLabel,
          startHour: Number(sched.start_hour ?? 0),
          endHour: Number(sched.end_hour ?? 0),
          modifier,
        });
        scheduleMap.set(campaignId, existing);
      }
    }
  }

  const campaigns: CampaignBiddingInfo[] = campaignRows.map((r): CampaignBiddingInfo => {
    const campaignId = String(r.campaign?.id ?? "");
    const rawStrategy = String(r.campaign?.bidding_strategy_type ?? "");
    const biddingStrategyType: BiddingStrategyType = BIDDING_STRATEGY_LABELS[rawStrategy] ?? "UNKNOWN";

    const targetCpaMicros =
      r.campaign?.target_cpa?.target_cpa_micros != null
        ? Number(r.campaign.target_cpa.target_cpa_micros)
        : r.campaign?.maximize_conversions?.target_cpa_micros != null
          ? Number(r.campaign.maximize_conversions.target_cpa_micros)
          : null;

    const targetRoas =
      r.campaign?.target_roas?.target_roas != null ? Number(r.campaign.target_roas.target_roas) : null;

    return {
      campaignId,
      campaign: String(r.campaign?.name ?? ""),
      biddingStrategyType,
      targetCpaMicros: targetCpaMicros && targetCpaMicros > 0 ? targetCpaMicros : null,
      targetRoas: targetRoas && targetRoas > 0 ? targetRoas : null,
      deviceModifiers: deviceMap.get(campaignId) ?? { mobile: null, desktop: null, tablet: null },
      adScheduleModifiers: scheduleMap.get(campaignId) ?? [],
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    campaigns,
  };
}
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/google-ads/bid-modifiers.ts
git commit -m "feat: add bid-modifiers lib — bidding strategy and device/schedule modifiers per campaign"
```

---

## Task 3: Conversion Actions Library

**Files:**
- Create: `src/lib/google-ads/conversion-actions.ts`

- [ ] **Step 1: Create the module**

Create `src/lib/google-ads/conversion-actions.ts`:

```typescript
import { buildCacheKey, getOrSetJson } from "@/lib/cache/query-cache";
import { CACHE_TTL_SECONDS } from "@/lib/cache/redis";
import type {
  ConversionActionRow,
  ConversionActionsReport,
  ConversionDeviceRow,
  DateRange,
} from "@/types/google-ads";

import { getCustomer, getCustomerId } from "./client";
import { dateRangeForRangeKey } from "./report";
import type { CampaignRangeKey } from "@/types/google-ads";

const DEVICE_LABELS: Record<string, string> = {
  "2": "Desktop",
  DESKTOP: "Desktop",
  "4": "Mobile",
  MOBILE: "Mobile",
  "5": "Tablet",
  TABLET: "Tablet",
  "6": "Connected TV",
  CONNECTED_TV: "Connected TV",
};

export interface RunConversionActionsOptions {
  range?: CampaignRangeKey;
  forceRefresh?: boolean;
}

export async function runConversionActions(
  options: RunConversionActionsOptions = {},
): Promise<ConversionActionsReport> {
  const range = options.range ?? "last-4-weeks";
  const dateRange = dateRangeForRangeKey(range);
  const cacheKey = buildCacheKey("conversion-actions:v1", {
    customerId: getCustomerId(),
    rangeStart: dateRange.start,
    rangeEnd: dateRange.end,
  });
  return getOrSetJson<ConversionActionsReport>(
    cacheKey,
    () => fetchConversionActions(dateRange),
    CACHE_TTL_SECONDS,
    { forceRefresh: options.forceRefresh === true },
  );
}

async function fetchConversionActions(dateRange: DateRange): Promise<ConversionActionsReport> {
  const customer = await getCustomer();

  // Fetch all enabled conversion actions
  const actionRows = await customer.query(`
    SELECT
      conversion_action.id,
      conversion_action.name,
      conversion_action.category,
      conversion_action.type,
      conversion_action.status,
      conversion_action.counting_type,
      conversion_action.include_in_conversions_metric
    FROM conversion_action
    WHERE conversion_action.status = 'ENABLED'
  `);

  const actions: ConversionActionRow[] = actionRows.map((r): ConversionActionRow => ({
    id: String(r.conversion_action?.id ?? ""),
    name: String(r.conversion_action?.name ?? ""),
    category: String(r.conversion_action?.category ?? "UNKNOWN"),
    type: String(r.conversion_action?.type ?? "UNKNOWN"),
    status: String(r.conversion_action?.status ?? ""),
    countingType: String(r.conversion_action?.counting_type ?? ""),
    includeInConversions: Boolean(r.conversion_action?.include_in_conversions_metric ?? false),
  }));

  // Fetch conversion performance split by device and conversion action
  const deviceRows = await customer.query(`
    SELECT
      segments.conversion_action_name,
      segments.device,
      metrics.conversions,
      metrics.all_conversions
    FROM campaign
    WHERE segments.date BETWEEN '${dateRange.start}' AND '${dateRange.end}'
      AND campaign.status = 'ENABLED'
  `);

  // Aggregate by conversion action name × device
  const map = new Map<string, { conversions: number; allConversions: number }>();
  for (const r of deviceRows) {
    const actionName = String(r.segments?.conversion_action_name ?? "");
    const rawDevice = String(r.segments?.device ?? "");
    const device = DEVICE_LABELS[rawDevice] ?? `Device ${rawDevice}`;
    if (!actionName) continue;
    const key = `${actionName}|||${device}`;
    const existing = map.get(key) ?? { conversions: 0, allConversions: 0 };
    existing.conversions += Number(r.metrics?.conversions ?? 0);
    existing.allConversions += Number(r.metrics?.all_conversions ?? 0);
    map.set(key, existing);
  }

  const deviceBreakdown: ConversionDeviceRow[] = Array.from(map.entries())
    .map(([key, v]): ConversionDeviceRow => {
      const [conversionActionName, device] = key.split("|||");
      return {
        conversionActionName: conversionActionName ?? "",
        device: device ?? "",
        conversions: v.conversions,
        allConversions: v.allConversions,
      };
    })
    .filter((r) => r.allConversions > 0)
    .sort((a, b) => b.allConversions - a.allConversions);

  return {
    generatedAt: new Date().toISOString(),
    dateRange,
    actions,
    deviceBreakdown,
  };
}
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/google-ads/conversion-actions.ts
git commit -m "feat: add conversion-actions lib — action list and per-device conversion split"
```

---

## Task 4: Add finalUrl to campaign-keywords

**Files:**
- Modify: `src/lib/google-ads/campaign-keywords.ts`

- [ ] **Step 1: Read the current file**

Read `src/lib/google-ads/campaign-keywords.ts` to find the GAQL SELECT and the row-mapping code.

- [ ] **Step 2: Add `ad_group_criterion.final_urls` to the SELECT**

In the GAQL query that selects from `ad_group_criterion`, add:

```sql
ad_group_criterion.final_urls,
```

- [ ] **Step 3: Map `finalUrl` in the row builder**

In the code that constructs each `CampaignKeywordRow`, add:

```typescript
finalUrl: Array.isArray(r.ad_group_criterion?.final_urls) && r.ad_group_criterion.final_urls.length > 0
  ? String(r.ad_group_criterion.final_urls[0])
  : null,
```

- [ ] **Step 4: Run typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/google-ads/campaign-keywords.ts
git commit -m "feat: add finalUrl field to campaign keyword rows"
```

---

## Task 5: Add impression share fields to quality-score

**Files:**
- Modify: `src/lib/google-ads/quality-score.ts`

- [ ] **Step 1: Read the current file**

Read `src/lib/google-ads/quality-score.ts` to find the GAQL SELECT and row-mapping code.

- [ ] **Step 2: Add IS metrics to the SELECT**

In the GAQL query, add these two metric fields:

```sql
metrics.search_top_impression_share,
metrics.search_absolute_top_impression_share,
```

- [ ] **Step 3: Map the fields in the row builder**

In the row construction object, add:

```typescript
topImpressionShare:
  r.metrics?.search_top_impression_share != null
    ? Number(r.metrics.search_top_impression_share)
    : null,
absTopImpressionShare:
  r.metrics?.search_absolute_top_impression_share != null
    ? Number(r.metrics.search_absolute_top_impression_share)
    : null,
```

- [ ] **Step 4: Update the cache key version**

Change the cache key namespace from `"quality:v1"` (or whatever it currently is) to the next version (e.g. `"quality:v2"`) to bust stale cached results that lack the new fields.

- [ ] **Step 5: Run typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/google-ads/quality-score.ts
git commit -m "feat: add topImpressionShare and absTopImpressionShare to quality score rows"
```

---

## Task 6: Server actions

**Files:**
- Modify: `src/app/actions/google-ads.ts`

- [ ] **Step 1: Add imports**

At the top of `src/app/actions/google-ads.ts`, add:

```typescript
import { runBidModifiers } from "@/lib/google-ads/bid-modifiers";
import { runConversionActions } from "@/lib/google-ads/conversion-actions";
import type { BidModifiersReport, ConversionActionsReport } from "@/types/google-ads";
```

Also add `CampaignRangeKey` to the existing type import if not already present.

- [ ] **Step 2: Add `getBidModifiers` action**

Append to `src/app/actions/google-ads.ts`:

```typescript
export async function getBidModifiers(options: {
  forceRefresh?: boolean;
}): Promise<ActionResult<BidModifiersReport>> {
  try {
    const data = await runBidModifiers({ forceRefresh: options.forceRefresh });
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: normalizeError(err) };
  }
}
```

- [ ] **Step 3: Add `getConversionActions` action**

Append to `src/app/actions/google-ads.ts`:

```typescript
export async function getConversionActions(options: {
  range?: CampaignRangeKey;
  forceRefresh?: boolean;
}): Promise<ActionResult<ConversionActionsReport>> {
  try {
    const validRange = VALID_RANGES.includes(options.range as CampaignRangeKey)
      ? (options.range as CampaignRangeKey)
      : "last-4-weeks";
    const data = await runConversionActions({ range: validRange, forceRefresh: options.forceRefresh });
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: normalizeError(err) };
  }
}
```

Note: `normalizeError` is the existing private error-normalization helper in that file. Check its exact name by reading `src/app/actions/google-ads.ts` — it may be called `normalizeGoogleAdsError` or similar; use whatever is defined there.

- [ ] **Step 4: Run typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/actions/google-ads.ts
git commit -m "feat: add getBidModifiers and getConversionActions server actions"
```

---

## Task 7: MCP tools

**Files:**
- Modify: `scripts/mcp-server.ts`

- [ ] **Step 1: Add imports**

At the top of `scripts/mcp-server.ts`, add:

```typescript
import { runBidModifiers } from "../src/lib/google-ads/bid-modifiers";
import { runConversionActions } from "../src/lib/google-ads/conversion-actions";
```

- [ ] **Step 2: Add `get_bid_modifiers` tool**

Append a new `server.tool(...)` call before the transport startup:

```typescript
server.tool(
  "get_bid_modifiers",
  "Bidding strategy type (Manual CPC, Target CPA, Maximize Conversions, etc.) and target CPA per campaign, plus device bid modifiers (mobile/desktop/tablet multipliers) and ad schedule bid adjustments. Use to diagnose why Smart Bidding controls device allocation.",
  {
    force_refresh: forceRefreshSchema,
  },
  async ({ force_refresh }) => {
    try {
      const data = await runBidModifiers({ forceRefresh: force_refresh });
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
);
```

- [ ] **Step 3: Add `get_conversion_actions` tool**

```typescript
server.tool(
  "get_conversion_actions",
  "All enabled conversion actions (name, category, type, counting method) plus conversions split by conversion action × device for the date range. Use to diagnose whether mobile WhatsApp or call conversions are being tracked.",
  {
    range: rangeSchema,
    force_refresh: forceRefreshSchema,
  },
  async ({ range, force_refresh }) => {
    try {
      const data = await runConversionActions({ range, forceRefresh: force_refresh });
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
);
```

- [ ] **Step 4: Update MCP server version**

Change the server version from `"1.0.0"` to `"1.1.0"`:

```typescript
const server = new McpServer({ name: "google-ads", version: "1.1.0" });
```

- [ ] **Step 5: Run typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add scripts/mcp-server.ts
git commit -m "feat: add get_bid_modifiers and get_conversion_actions MCP tools"
```

---

## Task 8: Bid Modifiers UI

**Files:**
- Create: `src/app/(main)/dashboard/bid-modifiers/page.tsx`
- Create: `src/app/(main)/dashboard/bid-modifiers/_components/bid-modifiers-card.tsx`

- [ ] **Step 1: Create page shell**

Create `src/app/(main)/dashboard/bid-modifiers/page.tsx`:

```typescript
import { BidModifiersCard } from "./_components/bid-modifiers-card";

export default function BidModifiersPage() {
  return (
    <div className="mx-auto flex min-h-0 w-full max-w-screen-2xl flex-col gap-8">
      <section id="overview" className="scroll-mt-24">
        <h1 className="font-heading font-semibold text-2xl tracking-tight md:text-3xl">Bid modifiers</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Bidding strategy, target CPA, and device / schedule bid adjustments per campaign.
        </p>
      </section>
      <section id="bid-modifiers" className="scroll-mt-24">
        <BidModifiersCard />
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Create the client card**

Create `src/app/(main)/dashboard/bid-modifiers/_components/bid-modifiers-card.tsx`:

```typescript
"use client";

import { Suspense, useCallback, useEffect, useState } from "react";

import { RefreshCw } from "lucide-react";

import { getBidModifiers } from "@/app/actions/google-ads";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { BidModifiersReport, CampaignBiddingInfo } from "@/types/google-ads";

function strategyBadgeVariant(strategy: string): "default" | "secondary" | "destructive" | "outline" {
  if (strategy === "TARGET_CPA" || strategy === "MAXIMIZE_CONVERSIONS") return "default";
  if (strategy === "MANUAL_CPC") return "outline";
  return "secondary";
}

function formatModifier(value: number | null): string {
  if (value === null) return "—";
  const pct = Math.round((value - 1) * 100);
  return pct >= 0 ? `+${pct}%` : `${pct}%`;
}

function modifierColor(value: number | null): string {
  if (value === null) return "text-muted-foreground";
  if (value < 0.5) return "text-destructive font-semibold";
  if (value > 1.1) return "text-green-600 font-semibold";
  return "";
}

function CampaignBiddingRow({ info }: { info: CampaignBiddingInfo }) {
  const targetCpa =
    info.targetCpaMicros !== null ? `₹${(info.targetCpaMicros / 1_000_000).toFixed(0)}` : null;

  return (
    <TableRow>
      <TableCell className="font-medium">{info.campaign}</TableCell>
      <TableCell>
        <Badge variant={strategyBadgeVariant(info.biddingStrategyType)}>
          {info.biddingStrategyType.replace(/_/g, " ")}
        </Badge>
      </TableCell>
      <TableCell className="tabular-nums">{targetCpa ?? "—"}</TableCell>
      <TableCell className={`tabular-nums ${modifierColor(info.deviceModifiers.mobile)}`}>
        {formatModifier(info.deviceModifiers.mobile)}
      </TableCell>
      <TableCell className={`tabular-nums ${modifierColor(info.deviceModifiers.desktop)}`}>
        {formatModifier(info.deviceModifiers.desktop)}
      </TableCell>
      <TableCell className={`tabular-nums ${modifierColor(info.deviceModifiers.tablet)}`}>
        {formatModifier(info.deviceModifiers.tablet)}
      </TableCell>
      <TableCell className="tabular-nums text-muted-foreground text-xs">
        {info.adScheduleModifiers.length > 0 ? `${info.adScheduleModifiers.length} rules` : "—"}
      </TableCell>
    </TableRow>
  );
}

function BidModifiersTable({ report }: { report: BidModifiersReport }) {
  return (
    <div className="rounded-lg border">
      <Table noScrollContainer>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Campaign</TableHead>
            <TableHead>Strategy</TableHead>
            <TableHead className="text-right">Target CPA</TableHead>
            <TableHead className="text-right">Mobile</TableHead>
            <TableHead className="text-right">Desktop</TableHead>
            <TableHead className="text-right">Tablet</TableHead>
            <TableHead className="text-right">Ad schedule</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {report.campaigns.map((info) => (
            <CampaignBiddingRow key={info.campaignId} info={info} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function BidModifiersCardContent() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<BidModifiersReport | null>(null);

  const fetch = useCallback(async (opts: { forceRefresh?: boolean } = {}) => {
    setLoading(true);
    setError(null);
    try {
      const res = await getBidModifiers({ forceRefresh: Boolean(opts.forceRefresh) });
      if (!res.ok) throw new Error(res.error);
      setReport(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Bidding strategy &amp; modifiers</CardTitle>
            <CardDescription>
              Strategy type, target CPA, and device bid adjustments per campaign. A Smart Bidding strategy (Target
              CPA / Maximize Conversions) means Google controls device allocation — manual device modifiers have
              limited effect.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => void fetch({ forceRefresh: true })}
            disabled={loading}
            aria-label="Refresh"
          >
            {loading ? <Spinner /> : <RefreshCw />}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading && !report && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Spinner />
            Loading…
          </div>
        )}

        {report && report.campaigns.length > 0 && <BidModifiersTable report={report} />}
      </CardContent>
    </Card>
  );
}

export function BidModifiersCard() {
  return (
    <Suspense
      fallback={
        <Card>
          <CardHeader>
            <CardTitle>Bidding strategy &amp; modifiers</CardTitle>
            <CardDescription>Loading…</CardDescription>
          </CardHeader>
        </Card>
      }
    >
      <BidModifiersCardContent />
    </Suspense>
  );
}
```

- [ ] **Step 3: Run typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/(main)/dashboard/bid-modifiers/
git commit -m "feat: add bid modifiers dashboard page"
```

---

## Task 9: Conversion Actions UI

**Files:**
- Create: `src/app/(main)/dashboard/conversions/page.tsx`
- Create: `src/app/(main)/dashboard/conversions/_components/conversion-actions-card.tsx`

- [ ] **Step 1: Create page shell**

Create `src/app/(main)/dashboard/conversions/page.tsx`:

```typescript
import { ConversionActionsCard } from "./_components/conversion-actions-card";

export default function ConversionsPage() {
  return (
    <div className="mx-auto flex min-h-0 w-full max-w-screen-2xl flex-col gap-8">
      <section id="overview" className="scroll-mt-24">
        <h1 className="font-heading font-semibold text-2xl tracking-tight md:text-3xl">Conversions</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Conversion actions and per-device split. Use to diagnose mobile tracking gaps.
        </p>
      </section>
      <section id="conversions" className="scroll-mt-24">
        <ConversionActionsCard />
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Create the client card**

Create `src/app/(main)/dashboard/conversions/_components/conversion-actions-card.tsx`:

```typescript
"use client";

import { Suspense, useCallback, useEffect, useState } from "react";

import { RefreshCw } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, XAxis, YAxis } from "recharts";

import { getConversionActions } from "@/app/actions/google-ads";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type {
  CampaignRangeKey,
  ConversionActionRow,
  ConversionActionsReport,
  ConversionDeviceRow,
} from "@/types/google-ads";

const RANGE_OPTIONS: ReadonlyArray<{ value: CampaignRangeKey; label: string }> = [
  { value: "last-7-days", label: "Last 7 days" },
  { value: "last-4-weeks", label: "Last 4 weeks" },
  { value: "last-3-months", label: "Last 3 months" },
  { value: "year-to-date", label: "Year to date" },
];

const DEVICE_COLORS: Record<string, string> = {
  Desktop: "#2563eb",
  Mobile: "#f97316",
  Tablet: "#16a34a",
  "Connected TV": "#9333ea",
};

function deviceColor(device: string): string {
  return DEVICE_COLORS[device] ?? "#94a3b8";
}

function ConversionActionsTable({ actions }: { actions: ConversionActionRow[] }) {
  return (
    <div className="rounded-lg border">
      <Table noScrollContainer>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Name</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Counting</TableHead>
            <TableHead>In "Conversions"</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {actions.map((a) => (
            <TableRow key={a.id}>
              <TableCell className="font-medium">{a.name}</TableCell>
              <TableCell>
                <Badge variant="outline" className="text-xs">
                  {a.category}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground text-xs">{a.type}</TableCell>
              <TableCell className="text-muted-foreground text-xs">{a.countingType}</TableCell>
              <TableCell>
                {a.includeInConversions ? (
                  <Badge variant="default" className="text-xs">
                    Yes
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs">
                    No
                  </Badge>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function DeviceBreakdownChart({ rows }: { rows: ConversionDeviceRow[] }) {
  // Group by conversionActionName, pivot device into columns
  const actionMap = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const existing = actionMap.get(r.conversionActionName) ?? {};
    existing[r.device] = (existing[r.device] ?? 0) + r.allConversions;
    actionMap.set(r.conversionActionName, existing);
  }

  const devices = [...new Set(rows.map((r) => r.device))];
  const chartData = Array.from(actionMap.entries()).map(([name, deviceVals]) => ({
    name: name.length > 30 ? `${name.slice(0, 28)}…` : name,
    fullName: name,
    ...deviceVals,
  }));

  const chartConfig: ChartConfig = Object.fromEntries(
    devices.map((d) => [d, { label: d, color: deviceColor(d) }]),
  );

  return (
    <ChartContainer config={chartConfig} className="h-64 w-full">
      <BarChart data={chartData} margin={{ top: 8, bottom: 40, left: 0, right: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={11} angle={-20} textAnchor="end" />
        <YAxis tickLine={false} axisLine={false} fontSize={11} width={40} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Legend />
        {devices.map((device) => (
          <Bar key={device} dataKey={device} fill={deviceColor(device)} radius={[4, 4, 0, 0]} stackId="a" />
        ))}
      </BarChart>
    </ChartContainer>
  );
}

function ConversionActionsCardContent() {
  const [range, setRange] = useState<CampaignRangeKey>("last-4-weeks");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ConversionActionsReport | null>(null);

  const fetch = useCallback(async (r: CampaignRangeKey, opts: { forceRefresh?: boolean } = {}) => {
    setLoading(true);
    setError(null);
    try {
      const res = await getConversionActions({ range: r, forceRefresh: Boolean(opts.forceRefresh) });
      if (!res.ok) throw new Error(res.error);
      setReport(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetch(range);
  }, [fetch, range]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Conversion actions</CardTitle>
            <CardDescription>
              All tracked conversion actions and their split by device. A conversion action with zero mobile
              conversions means Smart Bidding has no signal to spend on mobile.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => void fetch(range, { forceRefresh: true })}
            disabled={loading}
            aria-label="Refresh"
          >
            {loading ? <Spinner /> : <RefreshCw />}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
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

        {error && (
          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading && !report && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Spinner />
            Loading…
          </div>
        )}

        {report && (
          <>
            <div>
              <h3 className="mb-3 font-medium text-sm">Conversion actions</h3>
              <ConversionActionsTable actions={report.actions} />
            </div>

            {report.deviceBreakdown.length > 0 && (
              <div>
                <h3 className="mb-3 font-medium text-sm">Conversions by action &amp; device</h3>
                <DeviceBreakdownChart rows={report.deviceBreakdown} />
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function ConversionActionsCard() {
  return (
    <Suspense
      fallback={
        <Card>
          <CardHeader>
            <CardTitle>Conversion actions</CardTitle>
            <CardDescription>Loading…</CardDescription>
          </CardHeader>
        </Card>
      }
    >
      <ConversionActionsCardContent />
    </Suspense>
  );
}
```

- [ ] **Step 3: Run typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/(main)/dashboard/conversions/
git commit -m "feat: add conversions dashboard page with device split chart"
```

---

## Task 10: Sidebar

**Files:**
- Modify: `src/navigation/sidebar/sidebar-items.ts`

- [ ] **Step 1: Add two new items to the Google Ads group**

In `src/navigation/sidebar/sidebar-items.ts`, add the import for a suitable icon and two new nav items. Add them after "Change history":

```typescript
import {
  // existing imports …
  SlidersHorizontal,
  Repeat2,
} from "lucide-react";
```

Then in the `items` array of the Google Ads group, append:

```typescript
{
  title: "Bid modifiers",
  url: "/dashboard/bid-modifiers",
  icon: SlidersHorizontal,
},
{
  title: "Conversions",
  url: "/dashboard/conversions",
  icon: Repeat2,
},
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/navigation/sidebar/sidebar-items.ts
git commit -m "feat: add Bid modifiers and Conversions to sidebar"
```

---

## Task 11: Final verification

- [ ] **Step 1: Run Biome check**

```bash
pnpm check
```

If any lint/format errors appear, run:

```bash
pnpm check:fix
```

Then re-run `pnpm check` to confirm clean.

- [ ] **Step 2: Run typecheck one final time**

```bash
pnpm typecheck
```

Expected: zero errors.

- [ ] **Step 3: Start the dev server and verify pages load**

```bash
pnpm dev
```

Navigate to:
- `http://localhost:3000/dashboard/bid-modifiers` — should show bidding strategy table
- `http://localhost:3000/dashboard/conversions` — should show conversion actions table + device chart
- `http://localhost:3000/dashboard/quality-score` — should show topImpressionShare / absTopImpressionShare columns
- `http://localhost:3000/dashboard/keyword-search-terms` — no visual change yet (finalUrl data now available in API response)

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: final biome fixes and verification"
```
