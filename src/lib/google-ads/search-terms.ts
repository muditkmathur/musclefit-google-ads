import { buildCacheKey, getOrSetJson } from "@/lib/cache/query-cache";
import { CACHE_TTL_SECONDS } from "@/lib/cache/file-store";
import type { DateRange, SearchTermRow, SearchTermsReport } from "@/types/google-ads";

import { getCustomer, getCustomerId } from "./client";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export interface RunSearchTermsOptions {
  campaign?: string | null;
  monthsBack?: number;
  saveToPath?: string | null;
  forceRefresh?: boolean;
}

export async function runSearchTermsReport(options: RunSearchTermsOptions = {}): Promise<SearchTermsReport> {
  const monthsBack = Math.max(1, Math.floor(options.monthsBack ?? 3));
  const campaignFilter = options.campaign?.trim() || null;

  const cacheKey = buildCacheKey("search-terms:v2", {
    customerId: getCustomerId(),
    monthsBack,
    campaignFilter,
  });

  const result = await getOrSetJson<SearchTermsReport>(
    cacheKey,
    () => fetchSearchTermsReport(monthsBack, campaignFilter),
    CACHE_TTL_SECONDS,
    { forceRefresh: options.forceRefresh === true },
  );

  if (options.saveToPath) {
    await mkdir(dirname(options.saveToPath), { recursive: true });
    await writeFile(options.saveToPath, JSON.stringify(result, null, 2), "utf8");
  }

  return result;
}

export async function fetchSearchTermsReport(
  monthsBack: number,
  campaignFilter: string | null,
): Promise<SearchTermsReport> {
  const end = new Date();
  const start = new Date(end);
  start.setMonth(start.getMonth() - monthsBack);
  const dateRange: DateRange = {
    start: formatYmd(start),
    end: formatYmd(end),
  };

  const customer = await getCustomer();
  const whereClause = campaignFilter
    ? `WHERE segments.date BETWEEN '${dateRange.start}' AND '${dateRange.end}' AND campaign.name LIKE '%${campaignFilter.replaceAll("'", "\\'")}%'`
    : `WHERE segments.date BETWEEN '${dateRange.start}' AND '${dateRange.end}'`;

  const response = await customer.query(`
    SELECT
      search_term_view.search_term,
      search_term_view.status,
      campaign.name,
      ad_group.name,
      metrics.clicks,
      metrics.impressions,
      metrics.ctr,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value,
      metrics.all_conversions_value
    FROM search_term_view
    ${whereClause}
    ORDER BY metrics.clicks DESC
  `);

  const rows: SearchTermRow[] = response.map((r) => {
    const m = r.metrics ?? {};
    const costMicros = Number(m.cost_micros ?? 0);
    const conversions = Number(m.conversions ?? 0);
    const conversionValue = Number(
      // Google Ads API surfaces both conversions_value and all_conversions_value. Some accounts/actions
      // only populate one of them depending on attribution & settings.
      (m as Record<string, unknown>).conversions_value ?? (m as Record<string, unknown>).all_conversions_value ?? 0,
    );
    return {
      searchTerm: String(r.search_term_view?.search_term ?? ""),
      status: String(r.search_term_view?.status ?? ""),
      campaign: String(r.campaign?.name ?? ""),
      adGroup: String(r.ad_group?.name ?? ""),
      clicks: Number(m.clicks ?? 0),
      impressions: Number(m.impressions ?? 0),
      ctr: Number(m.ctr ?? 0),
      costMicros,
      cost: costMicros / 1_000_000,
      conversions,
      conversionValue,
    };
  });

  const totalClicks = rows.reduce((s, r) => s + r.clicks, 0);
  const totalImpressions = rows.reduce((s, r) => s + r.impressions, 0);
  const totalCost = rows.reduce((s, r) => s + r.costMicros, 0) / 1_000_000;
  const totalConversions = rows.reduce((s, r) => s + r.conversions, 0);
  const totalConversionValue = rows.reduce((s, r) => s + r.conversionValue, 0);

  return {
    generatedAt: new Date().toISOString(),
    dateRange,
    campaignFilter,
    totalTerms: rows.length,
    rows,
    summary: {
      totalClicks,
      totalImpressions,
      overallCtr: totalImpressions ? totalClicks / totalImpressions : 0,
      totalCost,
      totalConversions,
      totalConversionValue,
    },
  };
}

export const DEFAULT_SEARCH_TERMS_OUTPUT = join(process.cwd(), "data", "output.json");
