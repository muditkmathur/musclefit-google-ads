import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { getCustomer } from './client';
import type {
  CampaignDailyEntry,
  CampaignDailyReport,
  CampaignReport,
  CampaignSummaryRow,
  CampaignTotals,
  DateRange,
  DiffValue,
} from '@/types/google-ads';

function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function dateRangeForLastNDays(n: number): DateRange {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - (n - 1));
  return { start: formatYmd(start), end: formatYmd(end) };
}

function directionForDelta(delta: number): DiffValue['direction'] {
  if (delta > 0) return 'up';
  if (delta < 0) return 'down';
  return 'flat';
}

function diff(prev: number, curr: number): DiffValue {
  const delta = curr - prev;
  return { delta, direction: directionForDelta(delta) };
}

export interface RunCampaignReportOptions {
  days?: number;
  includeDaily?: boolean;
  saveToDisk?: boolean;
  outputDir?: string;
}

export type RunCampaignReportResult = CampaignReport;

export async function runCampaignReport(
  options: RunCampaignReportOptions = {},
): Promise<RunCampaignReportResult> {
  const days = Math.max(1, Math.floor(options.days ?? 30));
  const includeDaily = Boolean(options.includeDaily);
  const saveToDisk = options.saveToDisk ?? false;

  const { start: rangeStart, end: rangeEnd } = dateRangeForLastNDays(days);
  const periodLabel = `Last ${days} Days`;
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
      campaign: String(c.name ?? ''),
      status: String(c.status ?? ''),
      impressions: Number(m.impressions ?? 0),
      clicks: Number(m.clicks ?? 0),
      ctr: `${(ctr * 100).toFixed(2)}%`,
      avg_cpc: `₹${(avgCpc / 1_000_000).toFixed(2)}`,
      spend: `₹${(cost / 1_000_000).toFixed(2)}`,
      conversions: conv,
      cpa: conv > 0 ? `₹${(costPerConv / 1_000_000).toFixed(2)}` : 'N/A',
    };
  });

  const totalSpend =
    rows.reduce((s, r) => s + Number(r.metrics?.cost_micros ?? 0), 0) /
    1_000_000;
  const totalClicks = rows.reduce(
    (s, r) => s + Number(r.metrics?.clicks ?? 0),
    0,
  );
  const totalImpressions = rows.reduce(
    (s, r) => s + Number(r.metrics?.impressions ?? 0),
    0,
  );
  const totalConversions = rows.reduce(
    (s, r) => s + Number(r.metrics?.conversions ?? 0),
    0,
  );

  const totals: CampaignTotals = {
    campaign: 'TOTAL',
    status: '—',
    impressions: totalImpressions,
    clicks: totalClicks,
    ctr: `${
      totalImpressions > 0
        ? ((totalClicks / totalImpressions) * 100).toFixed(2)
        : 0
    }%`,
    avg_cpc: '—',
    spend: `₹${totalSpend.toFixed(2)}`,
    conversions: totalConversions,
    cpa:
      totalConversions > 0
        ? `₹${(totalSpend / totalConversions).toFixed(2)}`
        : 'N/A',
  };

  const generatedAt = new Date().toISOString();
  const result: CampaignReport = {
    generated_at: generatedAt,
    period: periodLabel,
    date_range: { start: rangeStart, end: rangeEnd },
    campaigns,
    totals,
  };

  let daily: CampaignDailyReport | undefined;
  if (includeDaily) {
    daily = await getCampaignDailyReport({
      days,
      rangeStart,
      rangeEnd,
      periodLabel,
    });
    result.daily = daily;
  }

  if (saveToDisk) {
    const outputDir =
      options.outputDir ?? join(process.cwd(), 'output', 'reports');
    await mkdir(outputDir, { recursive: true });
    const timestamp = generatedAt.replace(/[:.]/g, '-');
    const summaryFilename = join(
      outputDir,
      `campaign-report-${days}d-${timestamp}.json`,
    );
    await writeFile(summaryFilename, JSON.stringify(result, null, 2), 'utf8');
    result.saved_to = { summary: summaryFilename };

    if (daily) {
      const dailyFilename = join(
        outputDir,
        `campaign-report-daily-${days}d-${timestamp}.json`,
      );
      await mkdir(dirname(dailyFilename), { recursive: true });
      await writeFile(dailyFilename, JSON.stringify(daily, null, 2), 'utf8');
      result.saved_to = {
        summary: summaryFilename,
        daily: dailyFilename,
      };
    }
  }

  return result;
}

interface DailyContext {
  days: number;
  rangeStart: string;
  rangeEnd: string;
  periodLabel: string;
}

async function getCampaignDailyReport(
  ctx: DailyContext,
): Promise<CampaignDailyReport> {
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
    const name = String(r.campaign?.name ?? '');
    const date = String(r.segments?.date ?? '');
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

  const campaigns: CampaignDailyReport['campaigns'] = [];
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
