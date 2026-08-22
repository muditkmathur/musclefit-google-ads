import { buildCacheKey, getOrSetJson } from "@/lib/cache/query-cache";
import { CACHE_TTL_SECONDS } from "@/lib/cache/file-store";
import type { DateRange, SearchConsoleReport, SearchConsoleRow } from "@/types/google-ads";

import { getAccessToken, resolveSearchConsoleSiteUrl } from "./client";

const SEARCH_CONSOLE_API_BASE = "https://www.googleapis.com/webmasters/v3";
const DEFAULT_ROW_LIMIT = 500;

interface SearchAnalyticsApiRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface SearchAnalyticsApiResponse {
  rows?: SearchAnalyticsApiRow[];
}

export interface RunSearchConsoleReportOptions {
  dateRange: DateRange;
  siteUrl?: string | null;
  rowLimit?: number;
  forceRefresh?: boolean;
}

export async function runSearchConsoleReport(options: RunSearchConsoleReportOptions): Promise<SearchConsoleReport> {
  const rowLimit = options.rowLimit && options.rowLimit > 0 ? options.rowLimit : DEFAULT_ROW_LIMIT;
  const siteUrl = options.siteUrl?.trim() || (await resolveSearchConsoleSiteUrl());

  const cacheKey = buildCacheKey("search-console-report:v1", {
    siteUrl,
    rangeStart: options.dateRange.start,
    rangeEnd: options.dateRange.end,
    rowLimit,
  });

  return getOrSetJson<SearchConsoleReport>(
    cacheKey,
    () => fetchSearchConsoleReport(siteUrl, options.dateRange, rowLimit),
    CACHE_TTL_SECONDS,
    { forceRefresh: options.forceRefresh === true },
  );
}

async function fetchSearchConsoleReport(
  siteUrl: string,
  dateRange: DateRange,
  rowLimit: number,
): Promise<SearchConsoleReport> {
  const accessToken = await getAccessToken();

  const res = await fetch(`${SEARCH_CONSOLE_API_BASE}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      startDate: dateRange.start,
      endDate: dateRange.end,
      dimensions: ["query", "page"],
      rowLimit,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Search Console searchAnalytics.query failed: HTTP ${res.status} ${text}`);
  }

  const data = (await res.json()) as SearchAnalyticsApiResponse;
  const apiRows = data.rows ?? [];

  const rows: SearchConsoleRow[] = apiRows.map((r) => ({
    query: r.keys[0] ?? "",
    page: r.keys[1] ?? "",
    clicks: r.clicks,
    impressions: r.impressions,
    ctr: r.ctr,
    position: r.position,
  }));

  const totals = rows.reduce(
    (acc, r) => {
      acc.clicks += r.clicks;
      acc.impressions += r.impressions;
      acc.positionWeighted += r.position * r.impressions;
      return acc;
    },
    { clicks: 0, impressions: 0, positionWeighted: 0 },
  );

  return {
    generatedAt: new Date().toISOString(),
    dateRange,
    siteUrl,
    rows,
    totals: {
      clicks: totals.clicks,
      impressions: totals.impressions,
      ctr: totals.impressions > 0 ? totals.clicks / totals.impressions : 0,
      position: totals.impressions > 0 ? totals.positionWeighted / totals.impressions : 0,
    },
  };
}
