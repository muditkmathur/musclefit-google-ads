import { buildCacheKey, getOrSetJson } from "@/lib/cache/query-cache";
import type {
  CampaignDailyEntry,
  CampaignDailyReport,
  CampaignDemographicDailyEntry,
  CampaignDemographicEntry,
  CampaignDemographicSlice,
  CampaignDemographicsReport,
  CampaignGranularity,
  CampaignReport,
  CampaignSummaryRow,
  CampaignTotals,
  CampaignTotalsRaw,
  DateRange,
  DemographicDimension,
  DiffValue,
} from "@/types/google-ads";

export { dateRangeForLastNDays, dateRangeForRangeKey } from "@/lib/date-presets";

import { getCustomer, getCustomerId } from "./client";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function daysBetween(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24)) + 1;
}

function previousRange(current: DateRange): DateRange {
  const start = new Date(`${current.start}T00:00:00`);
  const end = new Date(`${current.end}T00:00:00`);
  const len = daysBetween(start, end);
  const prevEnd = addDays(start, -1);
  const prevStart = addDays(prevEnd, -(len - 1));
  return { start: formatYmd(prevStart), end: formatYmd(prevEnd) };
}

function directionForDelta(delta: number): DiffValue["direction"] {
  if (delta > 0) return "up";
  if (delta < 0) return "down";
  return "flat";
}

function diff(prev: number, curr: number): DiffValue {
  const delta = curr - prev;
  return { delta, direction: directionForDelta(delta) };
}

export interface RunCampaignReportOptions {
  dateRange: DateRange;
  campaign?: string | null;
  granularity?: CampaignGranularity;
  includeDaily?: boolean;
  includeDemographics?: boolean;
  includePrevious?: boolean;
  saveToDisk?: boolean;
  outputDir?: string;
  forceRefresh?: boolean;
}

export type RunCampaignReportResult = CampaignReport;

interface AggregatedTotals {
  totals: CampaignTotals;
  totalsRaw: CampaignTotalsRaw;
}

interface CampaignQueryResult {
  campaigns: CampaignSummaryRow[];
  totals: CampaignTotals;
  totalsRaw: CampaignTotalsRaw;
}

function parseIsFraction(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : null;
}

function escapeForGaql(value: string): string {
  return value.replaceAll("'", "\\'");
}

async function queryCampaignSummary(
  rangeStart: string,
  rangeEnd: string,
  options: { forceRefresh?: boolean; campaignFilter?: string | null } = {},
): Promise<CampaignQueryResult> {
  const campaignFilter = options.campaignFilter ?? null;
  const cacheKey = buildCacheKey("report:summary:v3", {
    customerId: getCustomerId(),
    rangeStart,
    rangeEnd,
    campaignFilter,
  });
  return getOrSetJson<CampaignQueryResult>(
    cacheKey,
    async () => {
      return queryCampaignSummaryUncached(rangeStart, rangeEnd, campaignFilter);
    },
    undefined,
    { forceRefresh: options.forceRefresh === true },
  );
}

async function queryCampaignSummaryUncached(
  rangeStart: string,
  rangeEnd: string,
  campaignFilter: string | null,
): Promise<CampaignQueryResult> {
  const rangeStartDate = new Date(`${rangeStart}T00:00:00`);
  const rangeEndDate = new Date(`${rangeEnd}T00:00:00`);
  const rangeDays = daysBetween(rangeStartDate, rangeEndDate);
  const gaqlDateFilter = `segments.date BETWEEN '${rangeStart}' AND '${rangeEnd}'`;
  const campaignClause = campaignFilter ? ` AND campaign.name = '${escapeForGaql(campaignFilter)}'` : "";
  const customer = await getCustomer();
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
      AND campaign.status = 'ENABLED'${campaignClause}
    ORDER BY metrics.cost_micros DESC
  `);

  const campaigns: CampaignSummaryRow[] = rows.map((r) => {
    const m = r.metrics ?? {};
    const c = r.campaign ?? {};
    const ctr = Number(m.ctr ?? 0);
    const avgCpc = Number(m.average_cpc ?? 0);
    const cost = Number(m.cost_micros ?? 0);
    const conv = Number(m.conversions ?? 0);
    const costPerConv = Number(m.cost_per_conversion ?? 0);

    const spendRaw = cost / 1_000_000;
    const cpaRaw = conv > 0 ? costPerConv / 1_000_000 : 0;

    const b = r.campaign_budget ?? {};
    // STANDARD (daily cap) and UNKNOWN/unset budgets are treated as daily.
    // FIXED (total lifetime) budgets produce a meaningless periodBudget, so we zero
    // them out — BudgetBar renders "—" when dailyBudget is 0.
    const budgetType = String(b.type ?? "");
    const isStandardBudget = budgetType === "" || budgetType === "STANDARD" || budgetType === "2";
    const dailyBudget = isStandardBudget ? Number(b.amount_micros ?? 0) / 1_000_000 : 0;
    const periodBudget = dailyBudget * rangeDays;

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
  });

  const totalSpend = rows.reduce((s, r) => s + Number(r.metrics?.cost_micros ?? 0), 0) / 1_000_000;
  const totalClicks = rows.reduce((s, r) => s + Number(r.metrics?.clicks ?? 0), 0);
  const totalImpressions = rows.reduce((s, r) => s + Number(r.metrics?.impressions ?? 0), 0);
  const totalConversions = rows.reduce((s, r) => s + Number(r.metrics?.conversions ?? 0), 0);

  const ctrRaw = totalImpressions > 0 ? totalClicks / totalImpressions : 0;
  const cpaRaw = totalConversions > 0 ? totalSpend / totalConversions : 0;

  const totals: CampaignTotals = {
    campaign: "TOTAL",
    status: "—",
    impressions: totalImpressions,
    clicks: totalClicks,
    ctr: `${(ctrRaw * 100).toFixed(2)}%`,
    avg_cpc: "—",
    spend: `₹${totalSpend.toFixed(2)}`,
    conversions: totalConversions,
    cpa: totalConversions > 0 ? `₹${cpaRaw.toFixed(2)}` : "N/A",
  };

  const totalsRaw: CampaignTotalsRaw = {
    impressions: totalImpressions,
    clicks: totalClicks,
    ctr: ctrRaw,
    spend: totalSpend,
    conversions: totalConversions,
    cpa: cpaRaw,
  };

  return { campaigns, totals, totalsRaw } satisfies CampaignQueryResult & AggregatedTotals;
}

export async function runCampaignReport(options: RunCampaignReportOptions): Promise<RunCampaignReportResult> {
  const { dateRange } = options;
  const campaignFilter = options.campaign?.trim() || null;
  const granularity: CampaignGranularity = options.granularity ?? "day";
  const includeDaily = options.includeDaily ?? true;
  const includeDemographics = options.includeDemographics ?? false;
  const includePrevious = options.includePrevious ?? true;
  const saveToDisk = options.saveToDisk ?? false;

  const { start: rangeStart, end: rangeEnd } = dateRange;
  const period = `${rangeStart} to ${rangeEnd}`;
  const forceRefresh = options.forceRefresh === true;

  const current = await queryCampaignSummary(rangeStart, rangeEnd, { forceRefresh, campaignFilter });

  const previousDateRange = previousRange(dateRange);
  let previous: CampaignQueryResult | null = null;
  if (includePrevious) {
    previous = await queryCampaignSummary(previousDateRange.start, previousDateRange.end, {
      forceRefresh,
      campaignFilter,
    });
  }

  const generatedAt = new Date().toISOString();
  const result: CampaignReport = {
    generated_at: generatedAt,
    period,
    granularity,
    date_range: dateRange,
    previous_date_range: previousDateRange,
    campaigns: current.campaigns,
    totals: current.totals,
    totals_raw: current.totalsRaw,
    previous_totals:
      previous?.totals ??
      ({
        campaign: "TOTAL",
        status: "—",
        impressions: 0,
        clicks: 0,
        ctr: "0.00%",
        avg_cpc: "—",
        spend: "₹0.00",
        conversions: 0,
        cpa: "N/A",
      } satisfies CampaignTotals),
    previous_totals_raw:
      previous?.totalsRaw ??
      ({
        impressions: 0,
        clicks: 0,
        ctr: 0,
        spend: 0,
        conversions: 0,
        cpa: 0,
      } satisfies CampaignTotalsRaw),
  };

  let daily: CampaignDailyReport | undefined;
  if (includeDaily) {
    daily = await getCampaignDailyReport({
      rangeStart,
      rangeEnd,
      periodLabel: period,
      granularity,
      forceRefresh,
      campaignFilter,
    });
    result.daily = daily;
  }

  let demographics: CampaignDemographicsReport | undefined;
  if (includeDemographics) {
    try {
      demographics = await getCampaignDemographicsReport({
        rangeStart,
        rangeEnd,
        periodLabel: period,
        granularity,
        forceRefresh,
        campaignFilter,
      });
      result.demographics = demographics;
    } catch (err) {
      console.warn("[report] Failed to fetch demographics; continuing without demographics section.", err);
    }
  }

  if (saveToDisk) {
    const outputDir = options.outputDir ?? join(process.cwd(), "output", "reports");
    await mkdir(outputDir, { recursive: true });
    const timestamp = generatedAt.replace(/[:.]/g, "-");
    const tag = `${rangeStart}_${rangeEnd}`;
    const summaryFilename = join(outputDir, `campaign-report-${tag}-${timestamp}.json`);
    await writeFile(summaryFilename, JSON.stringify(result, null, 2), "utf8");
    result.saved_to = { summary: summaryFilename };

    if (daily) {
      const dailyFilename = join(outputDir, `campaign-report-daily-${tag}-${timestamp}.json`);
      await mkdir(dirname(dailyFilename), { recursive: true });
      await writeFile(dailyFilename, JSON.stringify(daily, null, 2), "utf8");
      result.saved_to = { ...result.saved_to, daily: dailyFilename };
    }

    if (demographics) {
      const demographicsFilename = join(outputDir, `campaign-report-demographics-${tag}-${timestamp}.json`);
      await mkdir(dirname(demographicsFilename), { recursive: true });
      await writeFile(demographicsFilename, JSON.stringify(demographics, null, 2), "utf8");
      result.saved_to = { ...result.saved_to, demographics: demographicsFilename };
    }
  }

  return result;
}

interface DailyContext {
  rangeStart: string;
  rangeEnd: string;
  periodLabel: string;
  granularity: CampaignGranularity;
  forceRefresh?: boolean;
  campaignFilter?: string | null;
}

async function getCampaignDailyReport(ctx: DailyContext): Promise<CampaignDailyReport> {
  const { rangeStart, rangeEnd, periodLabel, granularity, forceRefresh, campaignFilter } = ctx;
  const isHourly = granularity === "hour";
  const cacheKey = buildCacheKey(isHourly ? "report:hourly:v1" : "report:daily:v2", {
    customerId: getCustomerId(),
    rangeStart,
    rangeEnd,
    periodLabel,
    campaignFilter: campaignFilter ?? null,
  });
  const loader = isHourly ? () => getCampaignHourlyReportUncached(ctx) : () => getCampaignDailyReportUncached(ctx);
  return getOrSetJson<CampaignDailyReport>(cacheKey, loader, undefined, {
    forceRefresh: forceRefresh === true,
  });
}

async function getCampaignDailyReportUncached(ctx: DailyContext): Promise<CampaignDailyReport> {
  const { rangeStart, rangeEnd, periodLabel, campaignFilter } = ctx;
  const gaqlDateFilter = `segments.date BETWEEN '${rangeStart}' AND '${rangeEnd}'`;
  const campaignClause = campaignFilter ? ` AND campaign.name = '${escapeForGaql(campaignFilter)}'` : "";

  const customer = await getCustomer();
  const rows = await customer.query(`
    SELECT
      segments.date,
      campaign.name,
      campaign.status,
      metrics.impressions,
      metrics.clicks,
      metrics.ctr,
      metrics.cost_micros,
      metrics.conversions,
      metrics.average_cpc,
      metrics.search_impression_share,
      metrics.search_budget_lost_impression_share,
      metrics.search_rank_lost_impression_share
    FROM campaign
    WHERE ${gaqlDateFilter}
      AND campaign.status = 'ENABLED'${campaignClause}
    ORDER BY campaign.name, segments.date
  `);

  interface RawDailyEntry {
    date: string;
    impressions: number;
    clicks: number;
    ctr: number;
    spend_micros: number;
    conversions: number;
    avg_cpc_micros: number;
    impressionShare: number | null;
    lostIsBudget: number | null;
    lostIsRank: number | null;
  }

  const byCampaign = new Map<string, RawDailyEntry[]>();
  for (const r of rows) {
    const name = String(r.campaign?.name ?? "");
    const date = String(r.segments?.date ?? "");
    const m = r.metrics ?? {};
    const entry: RawDailyEntry = {
      date,
      impressions: Number(m.impressions ?? 0),
      clicks: Number(m.clicks ?? 0),
      ctr: Number(m.ctr ?? 0),
      spend_micros: Number(m.cost_micros ?? 0),
      conversions: Number(m.conversions ?? 0),
      avg_cpc_micros: Number(m.average_cpc ?? 0),
      impressionShare: parseIsFraction(m.search_impression_share),
      lostIsBudget: parseIsFraction(m.search_budget_lost_impression_share),
      lostIsRank: parseIsFraction(m.search_rank_lost_impression_share),
    };
    const list = byCampaign.get(name) ?? [];
    list.push(entry);
    byCampaign.set(name, list);
  }

  const campaigns: CampaignDailyReport["campaigns"] = [];
  for (const [campaign, dayRows] of byCampaign.entries()) {
    dayRows.sort((a, b) => a.date.localeCompare(b.date));

    const enriched: CampaignDailyEntry[] = dayRows.map((r, idx) => {
      const prev = idx > 0 ? dayRows[idx - 1] : null;
      const dod = prev
        ? {
            impressions: diff(prev.impressions, r.impressions),
            clicks: diff(prev.clicks, r.clicks),
            spend_micros: diff(prev.spend_micros, r.spend_micros),
            conversions: diff(prev.conversions, r.conversions),
            ctr: diff(prev.ctr, r.ctr),
            avg_cpc_micros: diff(prev.avg_cpc_micros, r.avg_cpc_micros),
          }
        : null;

      return {
        date: r.date,
        impressions: r.impressions,
        clicks: r.clicks,
        ctr: Number.isFinite(r.ctr) ? +(r.ctr * 100).toFixed(4) : null,
        spend: +(r.spend_micros / 1_000_000).toFixed(2),
        conversions: r.conversions,
        avg_cpc: +(r.avg_cpc_micros / 1_000_000).toFixed(2),
        impressionShare: r.impressionShare,
        lostIsBudget: r.lostIsBudget,
        lostIsRank: r.lostIsRank,
        dod: dod
          ? {
              impressions: dod.impressions,
              clicks: dod.clicks,
              spend: {
                delta: +(dod.spend_micros.delta / 1_000_000).toFixed(2),
                direction: dod.spend_micros.direction,
              },
              conversions: dod.conversions,
              ctr: {
                delta: +(dod.ctr.delta * 100).toFixed(4),
                direction: dod.ctr.direction,
              },
              avg_cpc: {
                delta: +(dod.avg_cpc_micros.delta / 1_000_000).toFixed(2),
                direction: dod.avg_cpc_micros.direction,
              },
            }
          : null,
      };
    });

    campaigns.push({ campaign, days: enriched });
  }

  return {
    generated_at: new Date().toISOString(),
    period: periodLabel,
    date_range: { start: rangeStart, end: rangeEnd },
    campaigns,
  };
}

async function getCampaignHourlyReportUncached(ctx: DailyContext): Promise<CampaignDailyReport> {
  const { rangeStart, rangeEnd, periodLabel, campaignFilter } = ctx;
  const gaqlDateFilter = `segments.date BETWEEN '${rangeStart}' AND '${rangeEnd}'`;
  const campaignClause = campaignFilter ? ` AND campaign.name = '${escapeForGaql(campaignFilter)}'` : "";

  const customer = await getCustomer();
  const rows = await customer.query(`
    SELECT
      segments.date,
      segments.hour,
      campaign.name,
      campaign.status,
      metrics.impressions,
      metrics.clicks,
      metrics.ctr,
      metrics.cost_micros,
      metrics.conversions,
      metrics.average_cpc
    FROM campaign
    WHERE ${gaqlDateFilter}
      AND campaign.status = 'ENABLED'${campaignClause}
    ORDER BY campaign.name, segments.date, segments.hour
  `);

  const byCampaign = new Map<string, Array<{ date: string; hour: number; impressions: number; clicks: number; ctr: number; spend_micros: number; conversions: number; avg_cpc_micros: number }>>();
  for (const r of rows) {
    const name = String(r.campaign?.name ?? "");
    const date = String(r.segments?.date ?? "");
    const hour = Number(r.segments?.hour ?? 0);
    const m = r.metrics ?? {};
    const entry = {
      date,
      hour,
      impressions: Number(m.impressions ?? 0),
      clicks: Number(m.clicks ?? 0),
      ctr: Number(m.ctr ?? 0),
      spend_micros: Number(m.cost_micros ?? 0),
      conversions: Number(m.conversions ?? 0),
      avg_cpc_micros: Number(m.average_cpc ?? 0),
    };
    const list = byCampaign.get(name) ?? [];
    list.push(entry);
    byCampaign.set(name, list);
  }

  const campaigns: CampaignDailyReport["campaigns"] = [];
  for (const [campaign, hourRows] of byCampaign.entries()) {
    hourRows.sort((a, b) => a.date.localeCompare(b.date) || a.hour - b.hour);
    const enriched: CampaignDailyEntry[] = hourRows.map((r) => ({
      date: r.date,
      hour: r.hour,
      impressions: r.impressions,
      clicks: r.clicks,
      ctr: Number.isFinite(r.ctr) ? +(r.ctr * 100).toFixed(4) : null,
      spend: +(r.spend_micros / 1_000_000).toFixed(2),
      conversions: r.conversions,
      avg_cpc: +(r.avg_cpc_micros / 1_000_000).toFixed(2),
      impressionShare: null,
      lostIsBudget: null,
      lostIsRank: null,
      dod: null,
    }));
    campaigns.push({ campaign, days: enriched });
  }

  return {
    generated_at: new Date().toISOString(),
    period: periodLabel,
    date_range: { start: rangeStart, end: rangeEnd },
    campaigns,
  };
}

// ---------------------------------------------------------------------------
// Demographics: campaign x date x demographic bucket (gender, age range)
// ---------------------------------------------------------------------------

/**
 * Mapping of Google Ads `GenderType` enum values (numeric and string forms)
 * to display labels. The library returns numeric enum codes by default but
 * may sometimes surface the string form, so both keys are accepted.
 *
 * Source enum: GenderTypeEnum.GenderType.
 */
const GENDER_LABELS: Record<string, string> = {
  "10": "Male",
  MALE: "Male",
  "11": "Female",
  FEMALE: "Female",
  "20": "Undetermined",
  UNDETERMINED: "Undetermined",
  "1": "Unknown",
  UNKNOWN: "Unknown",
  "0": "Unspecified",
  UNSPECIFIED: "Unspecified",
};

const GENDER_BUCKET_ORDER = ["Male", "Female", "Undetermined", "Unknown", "Unspecified"];

/**
 * Mapping of Google Ads `AgeRangeType` enum values (numeric and string forms)
 * to display labels.
 *
 * Source enum: AgeRangeTypeEnum.AgeRangeType.
 */
const AGE_RANGE_LABELS: Record<string, string> = {
  "503001": "18-24",
  AGE_RANGE_18_24: "18-24",
  "503002": "25-34",
  AGE_RANGE_25_34: "25-34",
  "503003": "35-44",
  AGE_RANGE_35_44: "35-44",
  "503004": "45-54",
  AGE_RANGE_45_54: "45-54",
  "503005": "55-64",
  AGE_RANGE_55_64: "55-64",
  "503006": "65+",
  AGE_RANGE_65_UP: "65+",
  "503999": "Undetermined",
  AGE_RANGE_UNDETERMINED: "Undetermined",
  "1": "Unknown",
  UNKNOWN: "Unknown",
  "0": "Unspecified",
  UNSPECIFIED: "Unspecified",
};

const AGE_RANGE_BUCKET_ORDER = [
  "18-24",
  "25-34",
  "35-44",
  "45-54",
  "55-64",
  "65+",
  "Undetermined",
  "Unknown",
  "Unspecified",
];

function labelForBucket(dimension: DemographicDimension, raw: unknown): string {
  const key = String(raw ?? "");
  if (dimension === "gender") return GENDER_LABELS[key] ?? `Gender ${key || "?"}`;
  return AGE_RANGE_LABELS[key] ?? `Age ${key || "?"}`;
}

interface DemographicRowAccumulator {
  date: string;
  bucket: string;
  bucketLabel: string;
  impressions: number;
  clicks: number;
  spend_micros: number;
  conversions: number;
  ctr_weighted_numerator: number;
  ctr_weighted_denominator: number;
  avg_cpc_weighted_numerator: number;
  avg_cpc_weighted_denominator: number;
}

function accumulatorKey(date: string, bucket: string): string {
  return `${date}__${bucket}`;
}

function emptyAccumulator(date: string, bucket: string, bucketLabel: string): DemographicRowAccumulator {
  return {
    date,
    bucket,
    bucketLabel,
    impressions: 0,
    clicks: 0,
    spend_micros: 0,
    conversions: 0,
    ctr_weighted_numerator: 0,
    ctr_weighted_denominator: 0,
    avg_cpc_weighted_numerator: 0,
    avg_cpc_weighted_denominator: 0,
  };
}

function finalizeAccumulator(acc: DemographicRowAccumulator): CampaignDemographicDailyEntry {
  const ctr = acc.ctr_weighted_denominator > 0 ? acc.ctr_weighted_numerator / acc.ctr_weighted_denominator : null;
  const avgCpcMicros =
    acc.avg_cpc_weighted_denominator > 0 ? acc.avg_cpc_weighted_numerator / acc.avg_cpc_weighted_denominator : 0;
  return {
    date: acc.date,
    bucket: acc.bucket,
    bucketLabel: acc.bucketLabel,
    impressions: acc.impressions,
    clicks: acc.clicks,
    ctr: ctr === null ? null : +(ctr * 100).toFixed(4),
    spend: +(acc.spend_micros / 1_000_000).toFixed(2),
    conversions: acc.conversions,
    avg_cpc: +(avgCpcMicros / 1_000_000).toFixed(2),
  };
}

function bucketOrder(dimension: DemographicDimension): string[] {
  return dimension === "gender" ? GENDER_BUCKET_ORDER : AGE_RANGE_BUCKET_ORDER;
}

function sortBuckets(dimension: DemographicDimension, buckets: Array<{ key: string; label: string }>) {
  const order = bucketOrder(dimension);
  const indexFor = (label: string) => {
    const idx = order.indexOf(label);
    return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
  };
  buckets.sort((a, b) => {
    const ai = indexFor(a.label);
    const bi = indexFor(b.label);
    if (ai !== bi) return ai - bi;
    return a.label.localeCompare(b.label);
  });
}

async function getCampaignDemographicsReport(ctx: DailyContext): Promise<CampaignDemographicsReport> {
  const { rangeStart, rangeEnd, periodLabel, forceRefresh, campaignFilter } = ctx;
  const cacheKey = buildCacheKey("report:demographics", {
    customerId: getCustomerId(),
    rangeStart,
    rangeEnd,
    periodLabel,
    campaignFilter: campaignFilter ?? null,
  });
  return getOrSetJson<CampaignDemographicsReport>(
    cacheKey,
    () => getCampaignDemographicsReportUncached(ctx),
    undefined,
    {
      forceRefresh: forceRefresh === true,
    },
  );
}

interface RawDemographicRow {
  campaign: string;
  date: string;
  bucket: string;
  impressions: number;
  clicks: number;
  ctr: number;
  spend_micros: number;
  conversions: number;
  avg_cpc_micros: number;
}

async function queryDemographicView(
  resource: "age_range_view" | "gender_view",
  rangeStart: string,
  rangeEnd: string,
  bucketField: "ad_group_criterion.age_range.type" | "ad_group_criterion.gender.type",
  campaignFilter: string | null,
): Promise<RawDemographicRow[]> {
  const customer = await getCustomer();
  const campaignClause = campaignFilter ? ` AND campaign.name = '${escapeForGaql(campaignFilter)}'` : "";
  const rows = await customer.query(`
    SELECT
      segments.date,
      campaign.name,
      campaign.status,
      ${bucketField},
      metrics.impressions,
      metrics.clicks,
      metrics.ctr,
      metrics.cost_micros,
      metrics.conversions,
      metrics.average_cpc
    FROM ${resource}
    WHERE segments.date BETWEEN '${rangeStart}' AND '${rangeEnd}'
      AND campaign.status = 'ENABLED'${campaignClause}
    ORDER BY campaign.name, segments.date
  `);

  return rows.map((r) => {
    const m = r.metrics ?? {};
    const criterion = r.ad_group_criterion ?? {};
    // The criterion field may surface either an enum number or a string depending on lib version/settings.
    // Normalize to string so it can be looked up in our label table.
    const rawBucket =
      bucketField === "ad_group_criterion.age_range.type"
        ? (criterion.age_range?.type ?? criterion.age_range)
        : (criterion.gender?.type ?? criterion.gender);
    return {
      campaign: String(r.campaign?.name ?? ""),
      date: String(r.segments?.date ?? ""),
      bucket: String(rawBucket ?? ""),
      impressions: Number(m.impressions ?? 0),
      clicks: Number(m.clicks ?? 0),
      ctr: Number(m.ctr ?? 0),
      spend_micros: Number(m.cost_micros ?? 0),
      conversions: Number(m.conversions ?? 0),
      avg_cpc_micros: Number(m.average_cpc ?? 0),
    } satisfies RawDemographicRow;
  });
}

function buildSliceFromRows(dimension: DemographicDimension, rows: RawDemographicRow[]): CampaignDemographicSlice {
  // Aggregate to one entry per (date, bucket). Multiple ad groups can yield several rows for the same day.
  const accumulators = new Map<string, DemographicRowAccumulator>();
  const bucketLabelByKey = new Map<string, string>();

  for (const r of rows) {
    const label = labelForBucket(dimension, r.bucket);
    bucketLabelByKey.set(r.bucket, label);
    const key = accumulatorKey(r.date, r.bucket);
    const acc = accumulators.get(key) ?? emptyAccumulator(r.date, r.bucket, label);
    acc.impressions += r.impressions;
    acc.clicks += r.clicks;
    acc.spend_micros += r.spend_micros;
    acc.conversions += r.conversions;
    acc.ctr_weighted_numerator += r.ctr * r.impressions;
    acc.ctr_weighted_denominator += r.impressions;
    acc.avg_cpc_weighted_numerator += r.avg_cpc_micros * r.clicks;
    acc.avg_cpc_weighted_denominator += r.clicks;
    accumulators.set(key, acc);
  }

  const days: CampaignDemographicDailyEntry[] = Array.from(accumulators.values())
    .map(finalizeAccumulator)
    .sort((a, b) => a.date.localeCompare(b.date) || a.bucketLabel.localeCompare(b.bucketLabel));

  const buckets = Array.from(bucketLabelByKey.entries()).map(([key, label]) => ({ key, label }));
  sortBuckets(dimension, buckets);

  return { dimension, buckets, days };
}

async function getCampaignDemographicsReportUncached(ctx: DailyContext): Promise<CampaignDemographicsReport> {
  const { rangeStart, rangeEnd, periodLabel, campaignFilter } = ctx;
  const filter = campaignFilter ?? null;

  const [ageRows, genderRows] = await Promise.all([
    queryDemographicView("age_range_view", rangeStart, rangeEnd, "ad_group_criterion.age_range.type", filter),
    queryDemographicView("gender_view", rangeStart, rangeEnd, "ad_group_criterion.gender.type", filter),
  ]);

  const byCampaign = new Map<string, { age: RawDemographicRow[]; gender: RawDemographicRow[] }>();
  for (const r of ageRows) {
    const entry = byCampaign.get(r.campaign) ?? { age: [], gender: [] };
    entry.age.push(r);
    byCampaign.set(r.campaign, entry);
  }
  for (const r of genderRows) {
    const entry = byCampaign.get(r.campaign) ?? { age: [], gender: [] };
    entry.gender.push(r);
    byCampaign.set(r.campaign, entry);
  }

  const campaigns: CampaignDemographicEntry[] = Array.from(byCampaign.entries())
    .map(([campaign, group]) => {
      const slices: CampaignDemographicSlice[] = [];
      if (group.age.length > 0) slices.push(buildSliceFromRows("age_range", group.age));
      if (group.gender.length > 0) slices.push(buildSliceFromRows("gender", group.gender));
      return { campaign, slices };
    })
    .filter((entry) => entry.slices.length > 0)
    .sort((a, b) => a.campaign.localeCompare(b.campaign));

  return {
    generated_at: new Date().toISOString(),
    period: periodLabel,
    date_range: { start: rangeStart, end: rangeEnd },
    campaigns,
  };
}
