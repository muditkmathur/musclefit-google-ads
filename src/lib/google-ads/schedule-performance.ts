import { buildCacheKey, getOrSetJson } from "@/lib/cache/query-cache";
import { CACHE_TTL_SECONDS } from "@/lib/cache/redis";
import type { DateRange, DayOfWeek, ScheduleCell, SchedulePerformanceReport } from "@/types/google-ads";

import { getCustomer, getCustomerId } from "./client";

const DAY_OF_WEEK_MAP: Record<string, DayOfWeek> = {
  "2": "MONDAY",
  MONDAY: "MONDAY",
  "3": "TUESDAY",
  TUESDAY: "TUESDAY",
  "4": "WEDNESDAY",
  WEDNESDAY: "WEDNESDAY",
  "5": "THURSDAY",
  THURSDAY: "THURSDAY",
  "6": "FRIDAY",
  FRIDAY: "FRIDAY",
  "7": "SATURDAY",
  SATURDAY: "SATURDAY",
  "8": "SUNDAY",
  SUNDAY: "SUNDAY",
};

export interface RunSchedulePerformanceOptions {
  dateRange: DateRange;
  forceRefresh?: boolean;
}

export async function runSchedulePerformance(
  options: RunSchedulePerformanceOptions,
): Promise<SchedulePerformanceReport> {
  const cacheKey = buildCacheKey("schedule:v1", {
    customerId: getCustomerId(),
    rangeStart: options.dateRange.start,
    rangeEnd: options.dateRange.end,
  });
  return getOrSetJson<SchedulePerformanceReport>(
    cacheKey,
    () => fetchSchedulePerformance(options.dateRange),
    CACHE_TTL_SECONDS,
    { forceRefresh: options.forceRefresh === true },
  );
}

async function fetchSchedulePerformance(dateRange: DateRange): Promise<SchedulePerformanceReport> {
  const customer = await getCustomer();
  const rows = await customer.query(`
    SELECT
      segments.hour,
      segments.day_of_week,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions
    FROM campaign
    WHERE segments.date BETWEEN '${dateRange.start}' AND '${dateRange.end}'
      AND campaign.status = 'ENABLED'
  `);

  const map = new Map<string, ScheduleCell>();

  for (const r of rows) {
    const hour = Number(r.segments?.hour ?? 0);
    const rawDay = String(r.segments?.day_of_week ?? "");
    const dayOfWeek: DayOfWeek = DAY_OF_WEEK_MAP[rawDay] ?? "MONDAY";
    const key = `${dayOfWeek}:${hour}`;

    const existing: ScheduleCell = map.get(key) ?? {
      dayOfWeek,
      hour,
      impressions: 0,
      clicks: 0,
      spend: 0,
      conversions: 0,
      ctr: 0,
    };

    const m = r.metrics ?? {};
    existing.impressions += Number(m.impressions ?? 0);
    existing.clicks += Number(m.clicks ?? 0);
    existing.spend += Number(m.cost_micros ?? 0) / 1_000_000;
    existing.conversions += Number(m.conversions ?? 0);
    map.set(key, existing);
  }

  const cells: ScheduleCell[] = Array.from(map.values()).map((cell) => ({
    ...cell,
    ctr: cell.impressions > 0 ? cell.clicks / cell.impressions : 0,
  }));

  return {
    generatedAt: new Date().toISOString(),
    dateRange,
    cells,
  };
}
