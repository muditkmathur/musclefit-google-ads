import type {
  CampaignDailyEntry,
  CampaignDailyReport,
  CampaignGranularity,
  CampaignRangeKey,
  CampaignReport,
  CampaignSummaryRow,
  CampaignTotals,
  CampaignTotalsRaw,
  DateRange,
  DiffValue,
} from "@/types/google-ads";

import { getCustomer } from "./client";
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

export function dateRangeForLastNDays(n: number): DateRange {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - (n - 1));
  return { start: formatYmd(start), end: formatYmd(end) };
}

function dateRangeForRangeKey(range: CampaignRangeKey): DateRange {
  const end = new Date();
  if (range === "year-to-date") {
    const start = new Date(end.getFullYear(), 0, 1);
    return { start: formatYmd(start), end: formatYmd(end) };
  }
  const days = daysForRange(range);
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  return { start: formatYmd(start), end: formatYmd(end) };
}

function daysForRange(range: CampaignRangeKey): number {
  switch (range) {
    case "last-7-days":
      return 7;
    case "last-4-weeks":
      return 28;
    case "last-3-months":
      return 90;
    case "year-to-date": {
      const now = new Date();
      const start = new Date(now.getFullYear(), 0, 1);
      return daysBetween(start, now);
    }
  }
}

function previousRange(current: DateRange): DateRange {
  const start = new Date(`${current.start}T00:00:00`);
  const end = new Date(`${current.end}T00:00:00`);
  const len = daysBetween(start, end);
  const prevEnd = addDays(start, -1);
  const prevStart = addDays(prevEnd, -(len - 1));
  return { start: formatYmd(prevStart), end: formatYmd(prevEnd) };
}

function rangeLabel(range: CampaignRangeKey): string {
  switch (range) {
    case "last-7-days":
      return "Last 7 days";
    case "last-4-weeks":
      return "Last 4 weeks";
    case "last-3-months":
      return "Last 3 months";
    case "year-to-date":
      return "Year to date";
  }
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
  /** Preferred input. Computed range key. */
  range?: CampaignRangeKey;
  /** Metadata only — pass-through to the returned report. */
  granularity?: CampaignGranularity;
  /** Backwards-compatible: if `range` is not provided, use `days` for an ad-hoc window. */
  days?: number;
  /** Whether to include daily breakdown in the result. Defaults to true. */
  includeDaily?: boolean;
  /** Whether to include previous-period totals. Defaults to true. */
  includePrevious?: boolean;
  saveToDisk?: boolean;
  outputDir?: string;
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

async function queryCampaignSummary(rangeStart: string, rangeEnd: string): Promise<CampaignQueryResult> {
  const gaqlDateFilter = `segments.date BETWEEN '${rangeStart}' AND '${rangeEnd}'`;
  const customer = getCustomer();
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
      metrics.average_cpc
    FROM campaign
    WHERE ${gaqlDateFilter}
      AND campaign.status = 'ENABLED'
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

    return {
      campaign: String(c.name ?? ""),
      status: String(c.status ?? ""),
      impressions: Number(m.impressions ?? 0),
      clicks: Number(m.clicks ?? 0),
      ctr: `${(ctr * 100).toFixed(2)}%`,
      avg_cpc: `₹${(avgCpc / 1_000_000).toFixed(2)}`,
      spend: `₹${(cost / 1_000_000).toFixed(2)}`,
      conversions: conv,
      cpa: conv > 0 ? `₹${(costPerConv / 1_000_000).toFixed(2)}` : "N/A",
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

export async function runCampaignReport(options: RunCampaignReportOptions = {}): Promise<RunCampaignReportResult> {
  const range: CampaignRangeKey = options.range ?? "last-4-weeks";
  const granularity: CampaignGranularity = options.granularity ?? "day";
  const includeDaily = options.includeDaily ?? true;
  const includePrevious = options.includePrevious ?? true;
  const saveToDisk = options.saveToDisk ?? false;

  // If a custom `days` is provided and no `range`, build an ad-hoc range.
  const dateRange =
    options.range === undefined && options.days !== undefined
      ? dateRangeForLastNDays(Math.max(1, Math.floor(options.days)))
      : dateRangeForRangeKey(range);

  const { start: rangeStart, end: rangeEnd } = dateRange;
  const periodLabel = rangeLabel(range);

  const current = await queryCampaignSummary(rangeStart, rangeEnd);

  const previousDateRange = previousRange(dateRange);
  let previous: CampaignQueryResult | null = null;
  if (includePrevious) {
    previous = await queryCampaignSummary(previousDateRange.start, previousDateRange.end);
  }

  const generatedAt = new Date().toISOString();
  const result: CampaignReport = {
    generated_at: generatedAt,
    period: periodLabel,
    range,
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
      periodLabel,
    });
    result.daily = daily;
  }

  if (saveToDisk) {
    const outputDir = options.outputDir ?? join(process.cwd(), "output", "reports");
    await mkdir(outputDir, { recursive: true });
    const timestamp = generatedAt.replace(/[:.]/g, "-");
    const summaryFilename = join(outputDir, `campaign-report-${range}-${timestamp}.json`);
    await writeFile(summaryFilename, JSON.stringify(result, null, 2), "utf8");
    result.saved_to = { summary: summaryFilename };

    if (daily) {
      const dailyFilename = join(outputDir, `campaign-report-daily-${range}-${timestamp}.json`);
      await mkdir(dirname(dailyFilename), { recursive: true });
      await writeFile(dailyFilename, JSON.stringify(daily, null, 2), "utf8");
      result.saved_to = {
        summary: summaryFilename,
        daily: dailyFilename,
      };
    }
  }

  return result;
}

interface DailyContext {
  rangeStart: string;
  rangeEnd: string;
  periodLabel: string;
}

async function getCampaignDailyReport(ctx: DailyContext): Promise<CampaignDailyReport> {
  const { rangeStart, rangeEnd, periodLabel } = ctx;
  const gaqlDateFilter = `segments.date BETWEEN '${rangeStart}' AND '${rangeEnd}'`;

  const customer = getCustomer();
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
      metrics.average_cpc
    FROM campaign
    WHERE ${gaqlDateFilter}
      AND campaign.status = 'ENABLED'
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
  }

  const byCampaign = new Map<string, RawDailyEntry[]>();
  for (const r of rows) {
    const name = String(r.campaign?.name ?? "");
    const date = String(r.segments?.date ?? "");
    const entry: RawDailyEntry = {
      date,
      impressions: Number(r.metrics?.impressions ?? 0),
      clicks: Number(r.metrics?.clicks ?? 0),
      ctr: Number(r.metrics?.ctr ?? 0),
      spend_micros: Number(r.metrics?.cost_micros ?? 0),
      conversions: Number(r.metrics?.conversions ?? 0),
      avg_cpc_micros: Number(r.metrics?.average_cpc ?? 0),
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
