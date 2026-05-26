import { buildCacheKey, getOrSetJson } from "@/lib/cache/query-cache";
import { CACHE_TTL_SECONDS } from "@/lib/cache/redis";
import type { DateRange, DevicePerformanceReport, DeviceRow } from "@/types/google-ads";

import { getCustomer, getCustomerId } from "./client";

const DEVICE_LABELS: Record<string, string> = {
  "2": "Mobile",
  MOBILE: "Mobile",
  "3": "Tablet",
  TABLET: "Tablet",
  "4": "Desktop",
  DESKTOP: "Desktop",
  "5": "Other",
  OTHER: "Other",
  "6": "Connected TV",
  CONNECTED_TV: "Connected TV",
};

export interface RunDevicePerformanceOptions {
  dateRange: DateRange;
  forceRefresh?: boolean;
}

export async function runDevicePerformance(options: RunDevicePerformanceOptions): Promise<DevicePerformanceReport> {
  const cacheKey = buildCacheKey("device:v1", {
    customerId: getCustomerId(),
    rangeStart: options.dateRange.start,
    rangeEnd: options.dateRange.end,
  });
  return getOrSetJson<DevicePerformanceReport>(
    cacheKey,
    () => fetchDevicePerformance(options.dateRange),
    CACHE_TTL_SECONDS,
    {
      forceRefresh: options.forceRefresh === true,
    },
  );
}

async function fetchDevicePerformance(dateRange: { start: string; end: string }): Promise<DevicePerformanceReport> {
  const customer = await getCustomer();
  const rows = await customer.query(`
    SELECT
      segments.device,
      metrics.impressions,
      metrics.clicks,
      metrics.ctr,
      metrics.cost_micros,
      metrics.conversions,
      metrics.cost_per_conversion,
      metrics.average_cpc
    FROM campaign
    WHERE segments.date BETWEEN '${dateRange.start}' AND '${dateRange.end}'
      AND campaign.status = 'ENABLED'
  `);

  // Aggregate by device across all campaigns
  const map = new Map<
    string,
    {
      label: string;
      impressions: number;
      clicks: number;
      ctrNum: number;
      ctrDen: number;
      spend: number;
      conversions: number;
      costPerConv: number;
      avgCpcNum: number;
      avgCpcDen: number;
    }
  >();

  for (const r of rows) {
    const rawDevice = String(r.segments?.device ?? "");
    const label = DEVICE_LABELS[rawDevice] ?? `Device ${rawDevice || "?"}`;
    const m = r.metrics ?? {};
    const impressions = Number(m.impressions ?? 0);
    const clicks = Number(m.clicks ?? 0);
    const ctr = Number(m.ctr ?? 0);
    const costMicros = Number(m.cost_micros ?? 0);
    const conversions = Number(m.conversions ?? 0);
    const costPerConv = Number(m.cost_per_conversion ?? 0);
    const avgCpc = Number(m.average_cpc ?? 0);

    const existing = map.get(label) ?? {
      label,
      impressions: 0,
      clicks: 0,
      ctrNum: 0,
      ctrDen: 0,
      spend: 0,
      conversions: 0,
      costPerConv: 0,
      avgCpcNum: 0,
      avgCpcDen: 0,
    };
    existing.impressions += impressions;
    existing.clicks += clicks;
    existing.ctrNum += ctr * impressions;
    existing.ctrDen += impressions;
    existing.spend += costMicros / 1_000_000;
    existing.conversions += conversions;
    existing.costPerConv += costPerConv * conversions;
    existing.avgCpcNum += avgCpc * clicks;
    existing.avgCpcDen += clicks;
    map.set(label, existing);
  }

  const deviceRows: DeviceRow[] = Array.from(map.values())
    .map(
      (d): DeviceRow => ({
        device: d.label,
        impressions: d.impressions,
        clicks: d.clicks,
        ctr: d.ctrDen > 0 ? d.ctrNum / d.ctrDen : 0,
        spend: d.spend,
        conversions: d.conversions,
        cpa: d.conversions > 0 ? d.spend / d.conversions : 0,
        avgCpc: d.avgCpcDen > 0 ? d.avgCpcNum / d.avgCpcDen / 1_000_000 : 0,
      }),
    )
    .sort((a, b) => b.spend - a.spend);

  return {
    generatedAt: new Date().toISOString(),
    dateRange,
    rows: deviceRows,
  };
}
