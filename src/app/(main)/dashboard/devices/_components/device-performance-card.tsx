"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";

import { RefreshCw } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";

import { getDevicePerformance } from "@/app/actions/google-ads";
import { DateRangePicker } from "@/components/date-range-picker";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { last30Days } from "@/lib/date-presets";
import type { DateRange, DevicePerformanceReport, DeviceRow } from "@/types/google-ads";

type ChartMetric = "spend" | "clicks" | "conversions" | "cpa";

const CHART_METRIC_OPTIONS: ReadonlyArray<{ value: ChartMetric; label: string }> = [
  { value: "spend", label: "Spend (₹)" },
  { value: "clicks", label: "Clicks" },
  { value: "conversions", label: "Conversions" },
  { value: "cpa", label: "CPA (₹)" },
];

const DEVICE_COLORS: Record<string, string> = {
  Desktop: "#2563eb",
  Mobile: "#f97316",
  Tablet: "#16a34a",
  "Connected TV": "#9333ea",
  "Smart TV": "#0d9488",
  Other: "#94a3b8",
};

function deviceColor(device: string): string {
  return DEVICE_COLORS[device] ?? "#94a3b8";
}

function formatChartValue(value: number, metric: ChartMetric): string {
  if (metric === "spend" || metric === "cpa") return `₹${value.toFixed(2)}`;
  return value.toLocaleString();
}

function DeviceChart({ rows, metric }: { rows: DeviceRow[]; metric: ChartMetric }) {
  const chartData = rows.map((r) => ({ device: r.device, value: r[metric] }));

  const chartConfig: ChartConfig = Object.fromEntries(
    rows.map((r) => [r.device, { label: r.device, color: deviceColor(r.device) }]),
  );

  return (
    <ChartContainer config={chartConfig} className="h-56 w-full">
      <BarChart data={chartData} margin={{ top: 8, bottom: 0, left: 0, right: 0 }}>
        <CartesianGrid horizontal vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="device" tickLine={false} axisLine={false} fontSize={12} />
        <YAxis
          tickLine={false}
          axisLine={false}
          fontSize={11}
          tickFormatter={(v: number) =>
            metric === "spend" || metric === "cpa" ? `₹${v.toFixed(0)}` : v.toLocaleString()
          }
          width={60}
        />
        <ChartTooltip
          content={<ChartTooltipContent formatter={(value) => formatChartValue(Number(value), metric)} />}
        />
        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
          {chartData.map((entry) => (
            <Cell key={entry.device} fill={deviceColor(entry.device)} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

function DeviceTable({ rows }: { rows: DeviceRow[] }) {
  const total = useMemo(
    () => ({
      impressions: rows.reduce((s, r) => s + r.impressions, 0),
      clicks: rows.reduce((s, r) => s + r.clicks, 0),
      spend: rows.reduce((s, r) => s + r.spend, 0),
      conversions: rows.reduce((s, r) => s + r.conversions, 0),
    }),
    [rows],
  );

  return (
    <div className="rounded-lg border">
      <Table noScrollContainer>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Device</TableHead>
            <TableHead className="text-right">Spend</TableHead>
            <TableHead className="text-right">Clicks</TableHead>
            <TableHead className="text-right">Impr.</TableHead>
            <TableHead className="text-right">CTR</TableHead>
            <TableHead className="text-right">Conv.</TableHead>
            <TableHead className="text-right">CPA</TableHead>
            <TableHead className="text-right">Avg CPC</TableHead>
            <TableHead className="text-right">Spend %</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.device}>
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ background: deviceColor(r.device) }} />
                  {r.device}
                </div>
              </TableCell>
              <TableCell className="text-right tabular-nums">₹{r.spend.toFixed(2)}</TableCell>
              <TableCell className="text-right tabular-nums">{r.clicks.toLocaleString()}</TableCell>
              <TableCell className="text-right tabular-nums">{r.impressions.toLocaleString()}</TableCell>
              <TableCell className="text-right tabular-nums">{(r.ctr * 100).toFixed(2)}%</TableCell>
              <TableCell className="text-right tabular-nums">{r.conversions.toLocaleString()}</TableCell>
              <TableCell className="text-right tabular-nums">{r.cpa > 0 ? `₹${r.cpa.toFixed(2)}` : "N/A"}</TableCell>
              <TableCell className="text-right tabular-nums">
                {r.avgCpc > 0 ? `₹${r.avgCpc.toFixed(2)}` : "—"}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {total.spend > 0 ? `${((r.spend / total.spend) * 100).toFixed(1)}%` : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function DevicePerformanceCardContent() {
  const [dateRange, setDateRange] = useState<DateRange>(() => last30Days());
  const [chartMetric, setChartMetric] = useState<ChartMetric>("spend");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<DevicePerformanceReport | null>(null);

  const fetch = useCallback(async (dr: DateRange, opts: { forceRefresh?: boolean } = {}) => {
    setLoading(true);
    setError(null);
    try {
      const res = await getDevicePerformance({
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
  }, [fetch, dateRange.start, dateRange.end]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Device performance</CardTitle>
        <CardDescription>
          Spend, conversions, and CPA by device. Use CPA and spend % to decide where to apply bid adjustments.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <DateRangePicker value={dateRange} onChange={setDateRange} />

          <Select value={chartMetric} onValueChange={(v) => setChartMetric(v as ChartMetric)}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {CHART_METRIC_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          {report && !loading && (
            <div className="flex flex-wrap gap-2">
              {report.rows.map((r) => (
                <Badge key={r.device} variant="outline" className="text-xs">
                  {r.device}: {((r.spend / report.rows.reduce((s, x) => s + x.spend, 0)) * 100).toFixed(1)}% spend
                </Badge>
              ))}
            </div>
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

        {report && report.rows.length > 0 && (
          <>
            <DeviceChart rows={report.rows} metric={chartMetric} />
            <DeviceTable rows={report.rows} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function DevicePerformanceCard() {
  return (
    <Suspense
      fallback={
        <Card>
          <CardHeader>
            <CardTitle>Device performance</CardTitle>
            <CardDescription>Loading…</CardDescription>
          </CardHeader>
        </Card>
      }
    >
      <DevicePerformanceCardContent />
    </Suspense>
  );
}
