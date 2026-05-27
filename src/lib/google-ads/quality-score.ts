import { buildCacheKey, getOrSetJson } from "@/lib/cache/query-cache";
import { CACHE_TTL_SECONDS } from "@/lib/cache/redis";
import type {
  DateRange,
  QualityScoreBottleneck,
  QualityScoreComponent,
  QualityScoreReport,
  QualityScoreRow,
} from "@/types/google-ads";

import { getCustomer, getCustomerId } from "./client";

const COMPONENT_MAP: Record<string, QualityScoreComponent> = {
  "2": "BELOW_AVERAGE",
  BELOW_AVERAGE: "BELOW_AVERAGE",
  "3": "AVERAGE",
  AVERAGE: "AVERAGE",
  "4": "ABOVE_AVERAGE",
  ABOVE_AVERAGE: "ABOVE_AVERAGE",
};

const MATCH_TYPE_LABELS: Record<string, string> = {
  "2": "Broad",
  BROAD: "Broad",
  "3": "Phrase",
  PHRASE: "Phrase",
  "4": "Exact",
  EXACT: "Exact",
};

function parseComponent(raw: unknown): QualityScoreComponent {
  return COMPONENT_MAP[String(raw ?? "")] ?? "UNKNOWN";
}

function parseMicros(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n / 1_000_000 : null;
}

function classifyBottleneck(
  qualityScore: number | null,
  maxCpcBid: number | null,
  firstPageCpc: number | null,
): QualityScoreBottleneck {
  if (firstPageCpc === null && qualityScore === null) return "unknown";
  // maxCpcBid is null when the campaign uses smart bidding (system controls bids).
  // In that case we can't assess bid level — only QS.
  const bidLow = maxCpcBid !== null && firstPageCpc !== null && maxCpcBid > 0 && maxCpcBid < firstPageCpc * 0.9;
  const qsLow = qualityScore !== null && qualityScore <= 5;
  if (bidLow && qsLow) return "both";
  if (bidLow) return "bid";
  if (qsLow) return "qs";
  if (qualityScore !== null && qualityScore >= 6) return "competitive";
  return "unknown";
}

export interface RunQualityScoreOptions {
  dateRange: DateRange;
  campaign?: string | null;
  forceRefresh?: boolean;
}

export async function runQualityScore(options: RunQualityScoreOptions): Promise<QualityScoreReport> {
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
    {
      forceRefresh: options.forceRefresh === true,
    },
  );
}

function escapeForGaql(value: string): string {
  return value.replaceAll("'", "\\'");
}

async function fetchQualityScore(
  dateRange: { start: string; end: string },
  campaignFilter: string | null,
): Promise<QualityScoreReport> {
  const customer = await getCustomer();
  const campaignClause = campaignFilter ? ` AND campaign.name = '${escapeForGaql(campaignFilter)}'` : "";

  const rows = await customer.query(`
    SELECT
      campaign.name,
      ad_group.name,
      ad_group_criterion.keyword.text,
      ad_group_criterion.keyword.match_type,
      ad_group_criterion.status,
      ad_group_criterion.quality_info.quality_score,
      ad_group_criterion.quality_info.creative_quality_score,
      ad_group_criterion.quality_info.post_click_quality_score,
      ad_group_criterion.quality_info.search_predicted_ctr,
      ad_group_criterion.effective_cpc_bid_micros,
      ad_group_criterion.position_estimates.first_page_cpc_micros,
      ad_group_criterion.position_estimates.top_of_page_cpc_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.average_cpc
    FROM keyword_view
    WHERE ad_group_criterion.status != 'REMOVED'
      AND campaign.status = 'ENABLED'
      AND ad_group.status = 'ENABLED'
      AND segments.date BETWEEN '${dateRange.start}' AND '${dateRange.end}'${campaignClause}
    ORDER BY metrics.cost_micros DESC
  `);

  const qsRows: QualityScoreRow[] = rows.map((r): QualityScoreRow => {
    const c = r.ad_group_criterion ?? {};
    const qi = (c as Record<string, unknown>).quality_info as Record<string, unknown> | null | undefined;
    const kw = (c as Record<string, unknown>).keyword as Record<string, unknown> | null | undefined;
    const pe = (c as Record<string, unknown>).position_estimates as Record<string, unknown> | null | undefined;
    const m = r.metrics ?? {};

    const rawQs = qi?.quality_score;
    const qualityScore = rawQs !== null && rawQs !== undefined && Number.isFinite(Number(rawQs)) ? Number(rawQs) : null;

    const avgCpc = Number(m.average_cpc ?? 0) / 1_000_000;
    // Smart-bidding campaigns (Target CPA, Maximize Conversions) use effective_cpc_bid_micros = 10000
    // (₹0.01) as a placeholder sentinel — not a real bid. Treat anything ≤ 10000 as null.
    const rawMaxBid = Number((c as Record<string, unknown>).effective_cpc_bid_micros ?? 0);
    const maxCpcBid = rawMaxBid > 10_000 ? rawMaxBid / 1_000_000 : null;
    const firstPageCpc = parseMicros(pe?.first_page_cpc_micros);
    const topOfPageCpc = parseMicros(pe?.top_of_page_cpc_micros);

    return {
      campaign: String(r.campaign?.name ?? ""),
      adGroup: String(r.ad_group?.name ?? ""),
      keyword: String(kw?.text ?? ""),
      matchType: MATCH_TYPE_LABELS[String(kw?.match_type ?? "")] ?? String(kw?.match_type ?? ""),
      status: String((c as Record<string, unknown>).status ?? ""),
      qualityScore,
      expectedCtr: parseComponent(qi?.search_predicted_ctr),
      adRelevance: parseComponent(qi?.creative_quality_score),
      landingPageExperience: parseComponent(qi?.post_click_quality_score),
      avgCpc,
      maxCpcBid,
      firstPageCpc,
      topOfPageCpc,
      bottleneck: classifyBottleneck(qualityScore, maxCpcBid, firstPageCpc),
      impressions: Number(m.impressions ?? 0),
      clicks: Number(m.clicks ?? 0),
      spend: Number(m.cost_micros ?? 0) / 1_000_000,
      conversions: Number(m.conversions ?? 0),
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    dateRange,
    rows: qsRows,
  };
}
