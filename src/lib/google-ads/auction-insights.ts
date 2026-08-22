import { buildCacheKey, getOrSetJson } from "@/lib/cache/query-cache";
import { CACHE_TTL_SECONDS } from "@/lib/cache/file-store";
import type {
  AuctionInsightCompetitorRow,
  AuctionInsightKeywordRow,
  AuctionInsightReport,
  DateRange,
} from "@/types/google-ads";

import { getCustomer, getCustomerId } from "./client";

/** Cap on how many top-spend keywords we consider. Above this the report grows
 *  quadratically (keywords × domains). 50 keeps payloads under a few KB. */
const KEYWORD_CAP = 50;

/** Cap on how many distinct competitor domains we keep per campaign. */
const DOMAIN_CAP_PER_CAMPAIGN = 10;

export interface RunAuctionInsightsOptions {
  dateRange: DateRange;
  campaign?: string | null;
  forceRefresh?: boolean;
}

export async function runAuctionInsights(options: RunAuctionInsightsOptions): Promise<AuctionInsightReport> {
  const campaignFilter = options.campaign?.trim() || null;

  const cacheKey = buildCacheKey("auction-insights:v1", {
    customerId: getCustomerId(),
    rangeStart: options.dateRange.start,
    rangeEnd: options.dateRange.end,
    campaignFilter,
  });

  return getOrSetJson<AuctionInsightReport>(
    cacheKey,
    () => fetchAuctionInsights(options.dateRange, campaignFilter),
    CACHE_TTL_SECONDS,
    { forceRefresh: options.forceRefresh === true },
  );
}

function escapeForGaql(value: string): string {
  return value.replaceAll("'", "\\'");
}

function parseFraction(raw: unknown): number {
  if (raw === null || raw === undefined) return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : 0;
}

const AUCTION_INSIGHT_ACCESS_WARNING =
  "Auction insight metrics are not enabled for this Google Ads developer token. Request Auction Insights access in the Google Ads API Center, or use the Auction insights report in the Google Ads UI.";

function errorText(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function isAuctionInsightAccessDenied(err: unknown): boolean {
  const text = errorText(err);
  return text.includes("auction_insight");
}

function emptyAuctionInsightReport(
  dateRange: DateRange,
  campaignFilter: string | null,
  warning: string,
): AuctionInsightReport {
  return {
    generatedAt: new Date().toISOString(),
    dateRange,
    campaignFilter,
    competitors: [],
    keywordRows: [],
    warning,
  };
}

async function fetchAuctionInsights(
  dateRange: DateRange,
  campaignFilter: string | null,
): Promise<AuctionInsightReport> {
  const customer = await getCustomer();

  const campaignClause = campaignFilter ? ` AND campaign.name LIKE '%${escapeForGaql(campaignFilter)}%'` : "";

  // Step 1: pick the top-spend keywords across all enabled Search campaigns.
  // Auction insights are joined per-keyword on the next pass — limiting upfront
  // keeps the second query small and the report focused on what matters.
  const topKeywordRows = await customer.query(`
    SELECT
      campaign.name,
      campaign.status,
      ad_group.name,
      ad_group.status,
      ad_group_criterion.status,
      ad_group_criterion.keyword.text,
      ad_group_criterion.criterion_id,
      metrics.impressions,
      metrics.cost_micros
    FROM keyword_view
    WHERE segments.date BETWEEN '${dateRange.start}' AND '${dateRange.end}'
      AND campaign.status = 'ENABLED'
      AND ad_group.status = 'ENABLED'
      AND ad_group_criterion.status = 'ENABLED'
      AND campaign.advertising_channel_type = 'SEARCH'${campaignClause}
    ORDER BY metrics.cost_micros DESC
    LIMIT ${KEYWORD_CAP}
  `);

  if (topKeywordRows.length === 0) {
    return {
      generatedAt: new Date().toISOString(),
      dateRange,
      campaignFilter,
      competitors: [],
      keywordRows: [],
      warning: null,
    };
  }

  // Step 2: auction insight segment fetch with the same filters. Empty domains
  // appear in the API for "You" (the advertiser themselves) and must be excluded.
  let insightRows: typeof topKeywordRows;
  try {
    insightRows = await customer.query(`
    SELECT
      campaign.name,
      campaign.status,
      ad_group.name,
      ad_group.status,
      ad_group_criterion.status,
      ad_group_criterion.keyword.text,
      segments.auction_insight_domain,
      metrics.auction_insight_search_impression_share,
      metrics.auction_insight_search_overlap_rate,
      metrics.auction_insight_search_position_above_rate,
      metrics.auction_insight_search_outranking_share
    FROM keyword_view
    WHERE segments.date BETWEEN '${dateRange.start}' AND '${dateRange.end}'
      AND campaign.status = 'ENABLED'
      AND ad_group.status = 'ENABLED'
      AND campaign.advertising_channel_type = 'SEARCH'${campaignClause}
  `);
  } catch (err) {
    if (isAuctionInsightAccessDenied(err)) {
      return emptyAuctionInsightReport(dateRange, campaignFilter, AUCTION_INSIGHT_ACCESS_WARNING);
    }
    throw err;
  }

  // Restrict insight rows to the top-spend keyword set.
  const keywordKey = (campaign: string, adGroup: string, keyword: string) =>
    `${campaign}\u0000${adGroup}\u0000${keyword}`;
  const allowedKeywords = new Set<string>();
  const keywordMetrics = new Map<string, { impressions: number; spend: number }>();

  for (const r of topKeywordRows) {
    const k = keywordKey(
      String(r.campaign?.name ?? ""),
      String(r.ad_group?.name ?? ""),
      String((r.ad_group_criterion as { keyword?: { text?: unknown } } | undefined)?.keyword?.text ?? ""),
    );
    allowedKeywords.add(k);
    const m = r.metrics ?? {};
    keywordMetrics.set(k, {
      impressions: Number(m.impressions ?? 0),
      spend: Number(m.cost_micros ?? 0) / 1_000_000,
    });
  }

  const detailRows: AuctionInsightKeywordRow[] = [];

  for (const r of insightRows) {
    const domain = String(
      (r.segments as { auction_insight_domain?: unknown } | undefined)?.auction_insight_domain ?? "",
    ).trim();
    if (!domain) continue;

    const campaign = String(r.campaign?.name ?? "");
    const adGroup = String(r.ad_group?.name ?? "");
    const keyword = String((r.ad_group_criterion as { keyword?: { text?: unknown } } | undefined)?.keyword?.text ?? "");

    const k = keywordKey(campaign, adGroup, keyword);
    if (!allowedKeywords.has(k)) continue;

    const m = r.metrics ?? {};
    const km = keywordMetrics.get(k) ?? { impressions: 0, spend: 0 };
    detailRows.push({
      campaign,
      adGroup,
      keyword,
      domain,
      impressionShare: parseFraction(m.auction_insight_search_impression_share),
      overlapRate: parseFraction(m.auction_insight_search_overlap_rate),
      positionAboveRate: parseFraction(m.auction_insight_search_position_above_rate),
      outrankingShare: parseFraction(m.auction_insight_search_outranking_share),
      impressions: km.impressions,
      spend: km.spend,
    });
  }

  // Aggregate per (campaign, domain). Weight each metric by impressions so a
  // competitor that only appeared once on a tiny keyword doesn't dominate the
  // rollup.
  const agg = new Map<
    string,
    {
      campaign: string;
      domain: string;
      impressions: number;
      keywordSet: Set<string>;
      countedKeywords: Set<string>;
      isNum: number;
      overlapNum: number;
      posAboveNum: number;
      outrankNum: number;
    }
  >();

  for (const row of detailRows) {
    const key = `${row.campaign}\u0000${row.domain}`;
    const kwKey = keywordKey(row.campaign, row.adGroup, row.keyword);
    const existing = agg.get(key) ?? {
      campaign: row.campaign,
      domain: row.domain,
      impressions: 0,
      keywordSet: new Set<string>(),
      countedKeywords: new Set<string>(),
      isNum: 0,
      overlapNum: 0,
      posAboveNum: 0,
      outrankNum: 0,
    };
    const w = keywordMetrics.get(kwKey)?.impressions || row.impressions || 1;
    if (row.keyword) existing.keywordSet.add(row.keyword);
    if (!existing.countedKeywords.has(kwKey)) {
      existing.countedKeywords.add(kwKey);
      existing.impressions += keywordMetrics.get(kwKey)?.impressions ?? 0;
    }
    existing.isNum += row.impressionShare * w;
    existing.overlapNum += row.overlapRate * w;
    existing.posAboveNum += row.positionAboveRate * w;
    existing.outrankNum += row.outrankingShare * w;
    agg.set(key, existing);
  }

  // Sort per campaign, keep the top N competitors by overlap rate.
  const byCampaign = new Map<string, AuctionInsightCompetitorRow[]>();
  for (const a of agg.values()) {
    const denom = a.impressions || a.keywordSet.size || 1;
    const row: AuctionInsightCompetitorRow = {
      campaign: a.campaign,
      domain: a.domain,
      impressionShare: a.isNum / denom,
      overlapRate: a.overlapNum / denom,
      positionAboveRate: a.posAboveNum / denom,
      outrankingShare: a.outrankNum / denom,
      keywordCount: a.keywordSet.size,
      impressions: a.impressions,
    };
    const list = byCampaign.get(a.campaign) ?? [];
    list.push(row);
    byCampaign.set(a.campaign, list);
  }

  const competitors: AuctionInsightCompetitorRow[] = [];
  for (const [, list] of byCampaign) {
    list.sort((x, y) => y.overlapRate - x.overlapRate);
    for (const r of list.slice(0, DOMAIN_CAP_PER_CAMPAIGN)) competitors.push(r);
  }

  // Trim detail rows similarly: sort by spend then take a reasonable cap so the
  // payload stays bounded even when impression counts are noisy.
  const keywordRows = [...detailRows].sort((a, b) => b.spend - a.spend).slice(0, KEYWORD_CAP * 5);

  return {
    generatedAt: new Date().toISOString(),
    dateRange,
    campaignFilter,
    competitors,
    keywordRows,
    warning: null,
  };
}
