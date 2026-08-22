import { buildCacheKey, getOrSetJson } from "@/lib/cache/query-cache";
import { CACHE_TTL_SECONDS } from "@/lib/cache/file-store";
import type { AdGroupReport, AdGroupRow, DateRange } from "@/types/google-ads";

import { getCustomer, getCustomerId } from "./client";

function parseIsFraction(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : null;
}

export interface RunAdGroupReportOptions {
  dateRange: DateRange;
  campaign?: string | null;
  forceRefresh?: boolean;
}

export async function runAdGroupReport(options: RunAdGroupReportOptions): Promise<AdGroupReport> {
  const campaignFilter = options.campaign?.trim() || null;

  const cacheKey = buildCacheKey("ad-groups:v3", {
    customerId: getCustomerId(),
    rangeStart: options.dateRange.start,
    rangeEnd: options.dateRange.end,
    campaignFilter,
  });
  return getOrSetJson<AdGroupReport>(
    cacheKey,
    () => fetchAdGroupReport(options.dateRange, campaignFilter),
    CACHE_TTL_SECONDS,
    {
      forceRefresh: options.forceRefresh === true,
    },
  );
}

function escapeForGaql(value: string): string {
  return value.replaceAll("'", "\\'");
}

async function fetchAdGroupReport(
  dateRange: { start: string; end: string },
  campaignFilter: string | null,
): Promise<AdGroupReport> {
  const customer = await getCustomer();
  const campaignClause = campaignFilter ? ` AND campaign.name = '${escapeForGaql(campaignFilter)}'` : "";
  const rows = await customer.query(`
    SELECT
      campaign.name,
      ad_group.name,
      metrics.impressions,
      metrics.clicks,
      metrics.ctr,
      metrics.cost_micros,
      metrics.conversions,
      metrics.cost_per_conversion,
      metrics.average_cpc,
      metrics.search_impression_share,
      metrics.search_rank_lost_impression_share,
      metrics.search_top_impression_share,
      metrics.search_absolute_top_impression_share
    FROM ad_group
    WHERE segments.date BETWEEN '${dateRange.start}' AND '${dateRange.end}'
      AND campaign.status = 'ENABLED'
      AND ad_group.status = 'ENABLED'${campaignClause}
    ORDER BY metrics.cost_micros DESC
  `);

  const adGroupRows: AdGroupRow[] = rows.map((r) => {
    const m = r.metrics ?? {};
    const ctr = Number(m.ctr ?? 0);
    const avgCpc = Number(m.average_cpc ?? 0);
    const cost = Number(m.cost_micros ?? 0);
    const conv = Number(m.conversions ?? 0);
    const costPerConv = Number(m.cost_per_conversion ?? 0);
    const spendRaw = cost / 1_000_000;
    const cpaRaw = conv > 0 ? costPerConv / 1_000_000 : 0;

    return {
      campaign: String(r.campaign?.name ?? ""),
      adGroup: String(r.ad_group?.name ?? ""),
      impressions: Number(m.impressions ?? 0),
      clicks: Number(m.clicks ?? 0),
      ctr: `${(ctr * 100).toFixed(2)}%`,
      avgCpc: `₹${(avgCpc / 1_000_000).toFixed(2)}`,
      spend: `₹${spendRaw.toFixed(2)}`,
      spendRaw,
      conversions: conv,
      cpa: conv > 0 ? `₹${cpaRaw.toFixed(2)}` : "N/A",
      cpaRaw,
      impressionShare: parseIsFraction(m.search_impression_share),
      lostIsBudget: null, // not available at ad_group granularity
      lostIsRank: parseIsFraction(m.search_rank_lost_impression_share),
      topIs: parseIsFraction(m.search_top_impression_share),
      absoluteTopIs: parseIsFraction(m.search_absolute_top_impression_share),
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    dateRange,
    rows: adGroupRows,
  };
}
