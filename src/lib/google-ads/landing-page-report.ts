import { buildCacheKey, getOrSetJson } from "@/lib/cache/query-cache";
import { CACHE_TTL_SECONDS } from "@/lib/cache/file-store";
import type { DateRange, LandingPageReport, LandingPageRow } from "@/types/google-ads";

import { getCustomer, getCustomerId } from "./client";

const WASTE_SPEND_THRESHOLD = 500;

export interface RunLandingPageReportOptions {
  dateRange: DateRange;
  campaign?: string | null;
  forceRefresh?: boolean;
}

export async function runLandingPageReport(options: RunLandingPageReportOptions): Promise<LandingPageReport> {
  const campaignFilter = options.campaign?.trim() || null;

  const cacheKey = buildCacheKey("landing-pages:v1", {
    customerId: getCustomerId(),
    rangeStart: options.dateRange.start,
    rangeEnd: options.dateRange.end,
    campaignFilter,
  });

  return getOrSetJson<LandingPageReport>(
    cacheKey,
    () => fetchLandingPageReport(options.dateRange, campaignFilter),
    CACHE_TTL_SECONDS,
    { forceRefresh: options.forceRefresh === true },
  );
}

function escapeForGaql(value: string): string {
  return value.replaceAll("'", "\\'");
}

async function fetchLandingPageReport(dateRange: DateRange, campaignFilter: string | null): Promise<LandingPageReport> {
  const customer = await getCustomer();

  const campaignClause = campaignFilter ? ` AND campaign.name LIKE '%${escapeForGaql(campaignFilter)}%'` : "";

  const metricRows = await customer.query(`
    SELECT
      campaign.name,
      campaign.status,
      landing_page_view.unexpanded_final_url,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions
    FROM landing_page_view
    WHERE segments.date BETWEEN '${dateRange.start}' AND '${dateRange.end}'
      AND campaign.status = 'ENABLED'${campaignClause}
    ORDER BY metrics.cost_micros DESC
  `);

  // Second pass: which ad groups use which URL? Best-effort attribution.
  const adGroupRows = await customer.query(`
    SELECT
      campaign.name,
      campaign.status,
      ad_group.name,
      ad_group.status,
      ad_group_ad.ad.final_urls
    FROM ad_group_ad
    WHERE campaign.status = 'ENABLED'
      AND ad_group.status = 'ENABLED'
      AND ad_group_ad.status = 'ENABLED'${campaignClause}
  `);

  const urlToAdGroups = new Map<string, Set<string>>();
  for (const r of adGroupRows) {
    const campaign = String(r.campaign?.name ?? "");
    const adGroup = String(r.ad_group?.name ?? "");
    const urls = (r.ad_group_ad as { ad?: { final_urls?: unknown } } | undefined)?.ad?.final_urls;
    if (!Array.isArray(urls)) continue;
    for (const u of urls) {
      const url = String(u ?? "").trim();
      if (!url) continue;
      const key = url;
      const set = urlToAdGroups.get(key) ?? new Set<string>();
      if (campaign && adGroup) set.add(`${campaign} › ${adGroup}`);
      urlToAdGroups.set(key, set);
    }
  }

  const agg = new Map<
    string,
    {
      url: string;
      campaigns: Set<string>;
      impressions: number;
      clicks: number;
      spend: number;
      conversions: number;
    }
  >();

  for (const r of metricRows) {
    const url = String(
      (r.landing_page_view as { unexpanded_final_url?: unknown } | undefined)?.unexpanded_final_url ?? "",
    ).trim();
    if (!url) continue;

    const campaign = String(r.campaign?.name ?? "");
    const m = r.metrics ?? {};
    const existing = agg.get(url) ?? {
      url,
      campaigns: new Set<string>(),
      impressions: 0,
      clicks: 0,
      spend: 0,
      conversions: 0,
    };
    if (campaign) existing.campaigns.add(campaign);
    existing.impressions += Number(m.impressions ?? 0);
    existing.clicks += Number(m.clicks ?? 0);
    existing.spend += Number(m.cost_micros ?? 0) / 1_000_000;
    existing.conversions += Number(m.conversions ?? 0);
    agg.set(url, existing);
  }

  const rows: LandingPageRow[] = Array.from(agg.values())
    .map((a): LandingPageRow => {
      const ctr = a.impressions > 0 ? a.clicks / a.impressions : 0;
      const cpa = a.conversions > 0 ? a.spend / a.conversions : 0;
      const convRate = a.clicks > 0 ? a.conversions / a.clicks : 0;
      const isWaste = a.spend >= WASTE_SPEND_THRESHOLD && a.conversions === 0;
      const usedByAdGroups = Array.from(urlToAdGroups.get(a.url) ?? []).sort();

      return {
        url: a.url,
        campaigns: Array.from(a.campaigns).sort(),
        usedByAdGroups,
        impressions: a.impressions,
        clicks: a.clicks,
        ctr,
        spend: a.spend,
        conversions: a.conversions,
        cpa,
        convRate,
        isWaste,
      };
    })
    .sort((a, b) => b.spend - a.spend);

  return {
    generatedAt: new Date().toISOString(),
    dateRange,
    campaignFilter,
    rows,
  };
}
