import { buildCacheKey, getOrSetJson } from "@/lib/cache/query-cache";
import { CACHE_TTL_SECONDS } from "@/lib/cache/file-store";
import type { DateRange, KeywordSearchTermMapReport, KeywordSearchTermMapRow } from "@/types/google-ads";

import { getCustomer, getCustomerId } from "./client";

const DEFAULT_TOP = 300;
const WASTE_SPEND_THRESHOLD = 200;

const MATCH_TYPE_LABELS: Record<string, string> = {
  "2": "Broad",
  BROAD: "Broad",
  "3": "Phrase",
  PHRASE: "Phrase",
  "4": "Exact",
  EXACT: "Exact",
};

const STATUS_LABELS: Record<string, string> = {
  "2": "Added",
  ADDED: "Added",
  "3": "Excluded",
  EXCLUDED: "Excluded",
  "4": "Added/Excluded",
  ADDED_EXCLUDED: "Added/Excluded",
  "5": "None",
  NONE: "None",
  UNKNOWN: "Unknown",
};

/**
 * Stopwords stripped before mismatch detection. We intentionally include common
 * cross-keyword tokens for this account ("massage", "near", "me") so that the
 * comparison highlights *meaningful* divergence rather than noise.
 */
const MISMATCH_STOPWORDS = new Set<string>([
  "a",
  "an",
  "and",
  "at",
  "for",
  "in",
  "me",
  "my",
  "near",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
  "massage",
]);

function normaliseTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !MISMATCH_STOPWORDS.has(t));
}

function isIntentMismatch(searchTerm: string, keyword: string): boolean {
  const kwTokens = normaliseTokens(keyword);
  if (kwTokens.length === 0) return false;
  const stTokens = new Set(normaliseTokens(searchTerm));
  if (stTokens.size === 0) return true;
  return !kwTokens.some((t) => stTokens.has(t));
}

function escapeForGaql(value: string): string {
  return value.replaceAll("'", "\\'");
}

export interface RunKeywordSearchTermMapOptions {
  dateRange: DateRange;
  campaign?: string | null;
  adGroup?: string | null;
  top?: number;
  forceRefresh?: boolean;
}

export async function runKeywordSearchTermMap(
  options: RunKeywordSearchTermMapOptions,
): Promise<KeywordSearchTermMapReport> {
  const campaignFilter = options.campaign?.trim() || null;
  const adGroupFilter = options.adGroup?.trim() || null;
  const top = options.top && options.top > 0 ? Math.min(Math.floor(options.top), 1000) : DEFAULT_TOP;

  const cacheKey = buildCacheKey("keyword-search-term-map:v1", {
    customerId: getCustomerId(),
    rangeStart: options.dateRange.start,
    rangeEnd: options.dateRange.end,
    campaignFilter,
    adGroupFilter,
    top,
  });

  return getOrSetJson<KeywordSearchTermMapReport>(
    cacheKey,
    () => fetchKeywordSearchTermMap(options.dateRange, campaignFilter, adGroupFilter, top),
    CACHE_TTL_SECONDS,
    { forceRefresh: options.forceRefresh === true },
  );
}

async function fetchKeywordSearchTermMap(
  dateRange: DateRange,
  campaignFilter: string | null,
  adGroupFilter: string | null,
  top: number,
): Promise<KeywordSearchTermMapReport> {
  const customer = await getCustomer();

  const campaignClause = campaignFilter ? ` AND campaign.name LIKE '%${escapeForGaql(campaignFilter)}%'` : "";
  const adGroupClause = adGroupFilter ? ` AND ad_group.name = '${escapeForGaql(adGroupFilter)}'` : "";

  const response = await customer.query(`
    SELECT
      search_term_view.search_term,
      search_term_view.status,
      segments.keyword.info.text,
      segments.keyword.info.match_type,
      campaign.name,
      campaign.status,
      ad_group.name,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions
    FROM search_term_view
    WHERE segments.date BETWEEN '${dateRange.start}' AND '${dateRange.end}'
      AND campaign.status = 'ENABLED'${campaignClause}${adGroupClause}
    ORDER BY metrics.cost_micros DESC
  `);

  const allRows: KeywordSearchTermMapRow[] = response.map((r): KeywordSearchTermMapRow => {
    const m = r.metrics ?? {};
    const seg = (r.segments as { keyword?: { info?: { text?: unknown; match_type?: unknown } } } | undefined)?.keyword
      ?.info;

    const searchTerm = String(r.search_term_view?.search_term ?? "");
    const keyword = String(seg?.text ?? "");
    const rawMatchType = String(seg?.match_type ?? "");
    const matchType = MATCH_TYPE_LABELS[rawMatchType] ?? rawMatchType ?? "";
    const rawStatus = String(r.search_term_view?.status ?? "");
    const status = STATUS_LABELS[rawStatus] ?? rawStatus;

    const clicks = Number(m.clicks ?? 0);
    const impressions = Number(m.impressions ?? 0);
    const conversions = Number(m.conversions ?? 0);
    const spend = Number(m.cost_micros ?? 0) / 1_000_000;

    return {
      campaign: String(r.campaign?.name ?? ""),
      adGroup: String(r.ad_group?.name ?? ""),
      searchTerm,
      keyword,
      matchType,
      status,
      impressions,
      clicks,
      spend,
      conversions,
      cpa: conversions > 0 ? spend / conversions : 0,
      convRate: clicks > 0 ? conversions / clicks : 0,
      intentMismatch: keyword.length > 0 ? isIntentMismatch(searchTerm, keyword) : false,
      isBroadTrigger: matchType === "Broad",
      isWaste: spend >= WASTE_SPEND_THRESHOLD && conversions === 0,
    };
  });

  const sorted = allRows.sort((a, b) => b.spend - a.spend);
  const rows = sorted.slice(0, top);

  return {
    generatedAt: new Date().toISOString(),
    dateRange,
    campaignFilter,
    rowCount: rows.length,
    topLimit: top,
    rows,
  };
}
