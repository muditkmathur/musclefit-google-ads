"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";

import { RefreshCw } from "lucide-react";

import { getSchedulePerformance } from "@/app/actions/google-ads";
import { DateRangePicker } from "@/components/date-range-picker";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { last30Days } from "@/lib/date-presets";
import { cn } from "@/lib/utils";
import type { DateRange, DayOfWeek, SchedulePerformanceReport } from "@/types/google-ads";

type MetricKey = "spend" | "clicks" | "conversions" | "impressions";

const METRIC_OPTIONS: ReadonlyArray<{ value: MetricKey; label: string }> = [
  { value: "spend", label: "Spend (₹)" },
  { value: "clicks", label: "Clicks" },
  { value: "conversions", label: "Conversions" },
  { value: "impressions", label: "Impressions" },
];

const DAY_ORDER: DayOfWeek[] = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];

const DAY_LABELS: Record<DayOfWeek, string> = {
  MONDAY: "Mon",
  TUESDAY: "Tue",
  WEDNESDAY: "Wed",
  THURSDAY: "Thu",
  FRIDAY: "Fri",
  SATURDAY: "Sat",
  SUNDAY: "Sun",
};

function formatHour(h: number): string {
  if (h === 0) return "12am";
  if (h < 12) return `${h}am`;
  if (h === 12) return "12pm";
  return `${h - 12}pm`;
}

function intensityClass(intensity: number): string {
  if (intensity === 0) return "bg-muted/30";
  if (intensity < 0.15) return "bg-blue-100 dark:bg-blue-950/60";
  if (intensity < 0.3) return "bg-blue-200 dark:bg-blue-900/70";
  if (intensity < 0.5) return "bg-blue-300 dark:bg-blue-800/80";
  if (intensity < 0.7) return "bg-blue-400 dark:bg-blue-700";
  if (intensity < 0.85) return "bg-blue-500 dark:bg-blue-600";
  return "bg-blue-600 dark:bg-blue-500";
}

function cellValue(report: SchedulePerformanceReport, day: DayOfWeek, hour: number, metric: MetricKey): number {
  const cell = report.cells.find((c) => c.dayOfWeek === day && c.hour === hour);
  return cell ? cell[metric] : 0;
}

function cellTooltip(report: SchedulePerformanceReport, day: DayOfWeek, hour: number): string {
  const cell = report.cells.find((c) => c.dayOfWeek === day && c.hour === hour);
  if (!cell) return `${DAY_LABELS[day]} ${formatHour(hour)}: no data`;
  return `${DAY_LABELS[day]} ${formatHour(hour)} · Clicks: ${cell.clicks.toLocaleString()} · ₹${cell.spend.toFixed(2)} · Conv: ${cell.conversions}`;
}

function ScheduleHeatmap({ report, metric }: { report: SchedulePerformanceReport; metric: MetricKey }) {
  const maxValue = useMemo(() => {
    const values = report.cells.map((c) => c[metric]);
    return Math.max(...values, 1);
  }, [report.cells, metric]);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[700px]">
        {/* Hour axis header */}
        <div className="flex">
          <div className="w-12 shrink-0" />
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="flex-1 text-center text-[10px] text-muted-foreground">
              {h % 3 === 0 ? formatHour(h) : ""}
            </div>
          ))}
        </div>

        {/* Day rows */}
        {DAY_ORDER.map((day) => (
          <div key={day} className="flex items-center gap-0">
            <div className="w-12 shrink-0 pr-2 text-right text-muted-foreground text-xs">{DAY_LABELS[day]}</div>
            {Array.from({ length: 24 }, (_, h) => {
              const val = cellValue(report, day, h, metric);
              const intensity = maxValue > 0 ? val / maxValue : 0;
              return (
                <div
                  key={h}
                  className={cn(
                    "h-8 flex-1 rounded-sm border border-background/50 transition-colors",
                    intensityClass(intensity),
                  )}
                  title={cellTooltip(report, day, h)}
                />
              );
            })}
          </div>
        ))}

        {/* Color scale legend */}
        <div className="mt-3 flex items-center gap-2">
          <span className="text-muted-foreground text-xs">Low</span>
          {[0.05, 0.2, 0.4, 0.6, 0.8, 1].map((v) => (
            <div key={v} className={cn("h-3 w-6 rounded-sm", intensityClass(v))} />
          ))}
          <span className="text-muted-foreground text-xs">High</span>
        </div>
      </div>
    </div>
  );
}

function ScheduleHeatmapCardContent() {
  const [dateRange, setDateRange] = useState<DateRange>(() => last30Days());
  const [metric, setMetric] = useState<MetricKey>("spend");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<SchedulePerformanceReport | null>(null);

  const fetch = useCallback(async (dr: DateRange, opts: { forceRefresh?: boolean } = {}) => {
    setLoading(true);
    setError(null);
    try {
      const res = await getSchedulePerformance({
        start: dr.start,
        end: dr.end,
        forceRefresh: Boolean(opts.forceRefresh),
      });
      if (!res.ok) throw new Error(res.error);
      setReport(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetch(dateRange);
  }, [fetch, dateRange.start, dateRange.end, dateRange]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Schedule performance</CardTitle>
        <CardDescription>
          Hour × day-of-week heatmap. Times are in your Google Ads account timezone. Hover cells for details.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <DateRangePicker value={dateRange} onChange={setDateRange} />

          <Select value={metric} onValueChange={(v) => setMetric(v as MetricKey)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {METRIC_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          {report && !loading && (
            <span className="text-muted-foreground text-xs">
              {report.dateRange.start} → {report.dateRange.end}
            </span>
          )}

          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => void fetch(dateRange, { forceRefresh: true })}
            disabled={loading}
            className="ml-auto"
            aria-label="Refresh"
          >
            {loading ? <Spinner /> : <RefreshCw />}
          </Button>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading && !report && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Spinner />
            Loading…
          </div>
        )}

        {report && <ScheduleHeatmap report={report} metric={metric} />}
      </CardContent>
    </Card>
  );
}

export function ScheduleHeatmapCard() {
  return (
    <Suspense
      fallback={
        <Card>
          <CardHeader>
            <CardTitle>Schedule performance</CardTitle>
            <CardDescription>Loading…</CardDescription>
          </CardHeader>
        </Card>
      }
    >
      <ScheduleHeatmapCardContent />
    </Suspense>
  );
}
