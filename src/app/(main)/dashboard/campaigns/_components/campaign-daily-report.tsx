"use client";

import { useEffect, useMemo, useState } from "react";

import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { CampaignDailyEntry, CampaignDailyReport, CampaignGranularity } from "@/types/google-ads";

type MetricKey = "spend" | "impressions" | "clicks" | "conversions" | "ctr" | "avg_cpc";
type UnitGroup = "count" | "currency" | "percent";
type ChartType = "bar" | "line";

const ALL_CAMPAIGNS_VALUE = "__all_campaigns__";

interface MetricSpec {
  key: MetricKey;
  label: string;
  unit: UnitGroup;
  color: string;
  format: (value: number) => string;
  /** How to combine values across days within a bucket. */
  aggregation: "sum" | "avg";
}

const METRICS: readonly MetricSpec[] = [
  {
    key: "spend",
    label: "Spend",
    unit: "currency",
    color: "#f59e0b",
    format: (v) => `₹${v.toFixed(2)}`,
    aggregation: "sum",
  },
  {
    key: "impressions",
    label: "Impressions",
    unit: "count",
    color: "#3b82f6",
    format: (v) => v.toLocaleString(),
    aggregation: "sum",
  },
  {
    key: "clicks",
    label: "Clicks",
    unit: "count",
    color: "#10b981",
    format: (v) => v.toLocaleString(),
    aggregation: "sum",
  },
  {
    key: "conversions",
    label: "Conversions",
    unit: "count",
    color: "#8b5cf6",
    format: (v) => v.toLocaleString(),
    aggregation: "sum",
  },
  {
    key: "ctr",
    label: "CTR",
    unit: "percent",
    color: "#ec4899",
    format: (v) => `${v.toFixed(2)}%`,
    aggregation: "avg",
  },
  {
    key: "avg_cpc",
    label: "Avg. CPC",
    unit: "currency",
    color: "#06b6d4",
    format: (v) => `₹${v.toFixed(2)}`,
    aggregation: "avg",
  },
];

const METRIC_BY_KEY: Record<MetricKey, MetricSpec> = METRICS.reduce(
  (acc, m) => {
    acc[m.key] = m;
    return acc;
  },
  {} as Record<MetricKey, MetricSpec>,
);

const UNIT_AXIS_ORIENTATION: Record<UnitGroup, "left" | "right"> = {
  count: "left",
  currency: "right",
  percent: "right",
};

const UNIT_AXIS_WIDTH: Record<UnitGroup, number> = {
  count: 48,
  currency: 56,
  percent: 40,
};

const UNIT_TICK_FORMAT: Record<UnitGroup, (n: number) => string> = {
  count: (n) => formatCompactCount(n),
  currency: (n) => `₹${formatCompactCount(n)}`,
  percent: (n) => `${n.toFixed(0)}%`,
};

interface AxisDescriptor {
  id: string;
  unit: UnitGroup;
  orientation: "left" | "right";
  width: number;
  visible: boolean;
  color: string;
}

interface AxisAssignment {
  /** Map from MetricKey -> axis id used by Bar/Line yAxisId. */
  metricToAxis: Record<string, string>;
  /** Axes to render, in mount order. Hidden axes are still required to scale their series. */
  descriptors: AxisDescriptor[];
}

/**
 * Per-metric axis assignment: every selected metric gets its own Y-axis (and therefore its own scale)
 * so series of very different magnitudes never squash each other. All axes are rendered visibly so the
 * reader can see the scale for each metric — multiple axes on the same orientation stack side-by-side.
 */
function computeAxisAssignments(metrics: readonly MetricSpec[]): AxisAssignment {
  const metricToAxis: Record<string, string> = {};
  const descriptors: AxisDescriptor[] = [];

  for (const metric of metrics) {
    const id = `axis__${metric.key}`;
    metricToAxis[metric.key] = id;
    descriptors.push({
      id,
      unit: metric.unit,
      orientation: UNIT_AXIS_ORIENTATION[metric.unit],
      width: UNIT_AXIS_WIDTH[metric.unit],
      visible: true,
      color: metric.color,
    });
  }

  return { metricToAxis, descriptors };
}

function formatCompactCount(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

function startOfIsoWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function bucketKey(date: string, granularity: CampaignGranularity): string {
  const d = new Date(`${date}T00:00:00`);
  if (granularity === "day") return date;
  if (granularity === "week") {
    const w = startOfIsoWeek(d);
    return `${w.getFullYear()}-${String(w.getMonth() + 1).padStart(2, "0")}-${String(w.getDate()).padStart(2, "0")}`;
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatBucketLabel(key: string, granularity: CampaignGranularity): string {
  if (granularity === "day") {
    const [, m, d] = key.split("-");
    return `${d}-${m}`;
  }
  if (granularity === "week") {
    const [, m, d] = key.split("-");
    return `Wk ${d}-${m}`;
  }
  const [y, m] = key.split("-");
  const date = new Date(Number(y), Number(m) - 1, 1);
  return date.toLocaleString(undefined, { month: "short", year: "numeric" });
}

interface BucketDatum {
  bucket: string;
  label: string;
  /** Per-metric aggregated values keyed by MetricKey. */
  values: Partial<Record<MetricKey, number>>;
  /** Number of underlying daily rows aggregated. Used for averaging ratio metrics. */
  count: number;
}

type ChartRow = {
  bucket: string;
  label: string;
} & Partial<Record<MetricKey, number>>;

function aggregateAllMetrics(days: CampaignDailyEntry[], granularity: CampaignGranularity): BucketDatum[] {
  const map = new Map<string, BucketDatum>();
  for (const day of days) {
    const key = bucketKey(day.date, granularity);
    const existing = map.get(key) ?? {
      bucket: key,
      label: formatBucketLabel(key, granularity),
      values: {},
      count: 0,
    };
    for (const metric of METRICS) {
      const raw = readMetric(day, metric.key);
      existing.values[metric.key] = (existing.values[metric.key] ?? 0) + raw;
    }
    existing.count += 1;
    map.set(key, existing);
  }
  const list = Array.from(map.values()).sort((a, b) => a.bucket.localeCompare(b.bucket));
  for (const bucket of list) {
    for (const metric of METRICS) {
      if (metric.aggregation === "avg" && bucket.count > 0) {
        bucket.values[metric.key] = (bucket.values[metric.key] ?? 0) / bucket.count;
      }
    }
  }
  return list;
}

function readMetric(entry: CampaignDailyEntry, key: MetricKey): number {
  switch (key) {
    case "impressions":
      return entry.impressions;
    case "clicks":
      return entry.clicks;
    case "conversions":
      return entry.conversions;
    case "spend":
      return entry.spend;
    case "ctr":
      return entry.ctr ?? 0;
    case "avg_cpc":
      return entry.avg_cpc;
  }
}

interface CampaignDailyReportSectionProps {
  daily: CampaignDailyReport;
  granularity: CampaignGranularity;
}

export function CampaignDailyReportSection({ daily, granularity }: CampaignDailyReportSectionProps) {
  const [selected, setSelected] = useState<string>(ALL_CAMPAIGNS_VALUE);
  const [metricKeys, setMetricKeys] = useState<MetricKey[]>(["spend", "impressions", "conversions"]);
  const [chartType, setChartType] = useState<ChartType>("line");

  useEffect(() => {
    if (selected === ALL_CAMPAIGNS_VALUE) return;
    const exists = daily.campaigns.some((c) => c.campaign === selected);
    if (!exists) {
      setSelected(ALL_CAMPAIGNS_VALUE);
    }
  }, [daily, selected]);

  const isAllCampaigns = selected === ALL_CAMPAIGNS_VALUE;
  const selectedCampaign = isAllCampaigns ? null : (daily.campaigns.find((c) => c.campaign === selected) ?? null);

  const sourceDays = useMemo(() => {
    if (isAllCampaigns) return daily.campaigns.flatMap((c) => c.days);
    return selectedCampaign?.days ?? [];
  }, [isAllCampaigns, daily, selectedCampaign]);

  const buckets = useMemo(() => aggregateAllMetrics(sourceDays, granularity), [sourceDays, granularity]);

  const selectedMetrics = metricKeys.map((key) => METRIC_BY_KEY[key]);

  const chartData: ChartRow[] = useMemo(
    () =>
      buckets.map((b) => {
        const row: ChartRow = { bucket: b.bucket, label: b.label };
        for (const metric of selectedMetrics) {
          row[metric.key] = b.values[metric.key] ?? 0;
        }
        return row;
      }),
    [buckets, selectedMetrics],
  );

  const summaryStats = useMemo(() => {
    return selectedMetrics.map((metric) => {
      const values = buckets.map((b) => b.values[metric.key] ?? 0);
      const total =
        metric.aggregation === "sum"
          ? values.reduce((s, v) => s + v, 0)
          : values.length > 0
            ? values.reduce((s, v) => s + v, 0) / values.length
            : 0;
      return { metric, value: total };
    });
  }, [buckets, selectedMetrics]);

  const axisAssignment = useMemo(() => computeAxisAssignments(selectedMetrics), [selectedMetrics]);

  const chartConfig = useMemo<ChartConfig>(() => {
    const config: ChartConfig = {};
    for (const metric of METRICS) {
      config[metric.key] = { color: metric.color, label: metric.label };
    }
    return config;
  }, []);

  const scopeLabel = isAllCampaigns ? `All campaigns (${daily.campaigns.length})` : (selectedCampaign?.campaign ?? "—");

  const showChart = isAllCampaigns ? buckets.length > 0 : Boolean(selectedCampaign);

  const tooltipFormatter = (value: unknown, name: unknown) => {
    const metric = METRIC_BY_KEY[name as MetricKey];
    if (!metric) {
      return (
        <div className="flex w-full items-center justify-between gap-3">
          <span className="text-muted-foreground">{String(name)}</span>
          <span className="font-mono font-medium tabular-nums">{String(value ?? "")}</span>
        </div>
      );
    }
    return (
      <div className="flex w-full items-center justify-between gap-3">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span aria-hidden className="size-2 rounded-[2px]" style={{ backgroundColor: metric.color }} />
          {metric.label}
        </span>
        <span className="font-mono font-medium tabular-nums">{metric.format(Number(value ?? 0))}</span>
      </div>
    );
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div>
          <h3 className="font-semibold text-base">Daily breakdown</h3>
          <p className="text-muted-foreground text-sm">
            {daily.period} ({daily.date_range.start} → {daily.date_range.end}) · {daily.campaigns.length} campaigns
          </p>
        </div>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          spacing={1}
          value={chartType}
          onValueChange={(v) => {
            if (v === "bar" || v === "line") setChartType(v);
          }}
          aria-label="Chart type"
        >
          <ToggleGroupItem value="bar" className="text-xs">
            Bar
          </ToggleGroupItem>
          <ToggleGroupItem value="line" className="text-xs">
            Line
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <ToggleGroup
        type="multiple"
        variant="outline"
        size="sm"
        spacing={1}
        value={metricKeys}
        onValueChange={(v) => {
          if (v.length === 0) return;
          setMetricKeys(v as MetricKey[]);
        }}
        className="flex-wrap"
        aria-label="Select metrics to display"
      >
        {METRICS.map((m) => (
          <ToggleGroupItem key={m.key} value={m.key} className="text-xs">
            <span
              aria-hidden
              className="mr-1.5 inline-block size-2 shrink-0 rounded-[2px]"
              style={{ backgroundColor: m.color }}
            />
            {m.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {daily.campaigns.length > 0 && (
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          spacing={1}
          value={selected}
          onValueChange={(value) => {
            if (value) setSelected(value);
          }}
          className="flex-wrap"
          aria-label="Filter daily breakdown by campaign"
        >
          <ToggleGroupItem value={ALL_CAMPAIGNS_VALUE} className="text-xs">
            All campaigns
          </ToggleGroupItem>
          {daily.campaigns.map((c) => (
            <ToggleGroupItem key={c.campaign} value={c.campaign} className="text-xs">
              {c.campaign}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}

      {showChart && (
        <div className="rounded-lg border bg-card p-4">
          <div className="flex flex-wrap items-end justify-between gap-3 pb-3">
            <div>
              <h4 className="font-medium text-sm">{scopeLabel}</h4>
              <p className="text-muted-foreground text-xs">
                {selectedMetrics.map((m) => m.label).join(" · ")} · {granularity}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {summaryStats.map(({ metric, value }) => (
                <div key={metric.key} className="flex items-center gap-2">
                  <span aria-hidden className="size-2 rounded-[2px]" style={{ backgroundColor: metric.color }} />
                  <div className="flex flex-col leading-tight">
                    <span className="text-muted-foreground text-[10px] uppercase tracking-wide">
                      {metric.label} · {metric.aggregation === "sum" ? "total" : "avg"}
                    </span>
                    <span className="font-medium text-sm tabular-nums">{metric.format(value)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <ChartContainer config={chartConfig} className="h-64 w-full">
            {chartType === "bar" ? (
              <BarChart data={chartData} margin={{ bottom: 0, left: 0, right: 0, top: 8 }} barCategoryGap={6}>
                <CartesianGrid horizontal vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  fontSize={11}
                  interval="preserveStartEnd"
                />
                {axisAssignment.descriptors.map((descriptor) => (
                  <YAxis
                    key={descriptor.id}
                    yAxisId={descriptor.id}
                    orientation={descriptor.orientation}
                    tickLine={false}
                    axisLine={false}
                    tickMargin={4}
                    fontSize={10}
                    width={descriptor.visible ? descriptor.width : 0}
                    hide={!descriptor.visible}
                    tickFormatter={UNIT_TICK_FORMAT[descriptor.unit]}
                    tick={{ fill: descriptor.color }}
                  />
                ))}
                <ChartTooltip
                  cursor={{ fill: "var(--muted)", fillOpacity: 0.4 }}
                  content={<ChartTooltipContent indicator="dot" labelKey="label" formatter={tooltipFormatter} />}
                />
                <ChartLegend content={<ChartLegendContent />} />
                {selectedMetrics.map((metric) => (
                  <Bar
                    key={metric.key}
                    yAxisId={axisAssignment.metricToAxis[metric.key] ?? metric.unit}
                    dataKey={metric.key}
                    name={metric.key}
                    fill={metric.color}
                    fillOpacity={0.9}
                    radius={[2, 2, 0, 0]}
                  />
                ))}
              </BarChart>
            ) : (
              <LineChart data={chartData} margin={{ bottom: 0, left: 0, right: 0, top: 8 }}>
                <CartesianGrid horizontal vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  fontSize={11}
                  interval="preserveStartEnd"
                />
                {axisAssignment.descriptors.map((descriptor) => (
                  <YAxis
                    key={descriptor.id}
                    yAxisId={descriptor.id}
                    orientation={descriptor.orientation}
                    tickLine={false}
                    axisLine={false}
                    tickMargin={4}
                    fontSize={10}
                    width={descriptor.visible ? descriptor.width : 0}
                    hide={!descriptor.visible}
                    tickFormatter={UNIT_TICK_FORMAT[descriptor.unit]}
                    tick={{ fill: descriptor.color }}
                  />
                ))}
                <ChartTooltip
                  cursor={{ stroke: "var(--border)" }}
                  content={<ChartTooltipContent indicator="dot" labelKey="label" formatter={tooltipFormatter} />}
                />
                <ChartLegend content={<ChartLegendContent />} />
                {selectedMetrics.map((metric) => (
                  <Line
                    key={metric.key}
                    yAxisId={axisAssignment.metricToAxis[metric.key] ?? metric.unit}
                    type="monotone"
                    dataKey={metric.key}
                    name={metric.key}
                    stroke={metric.color}
                    strokeWidth={2}
                    dot={{ r: 3, strokeWidth: 0, fill: metric.color }}
                    activeDot={{ r: 5, strokeWidth: 0 }}
                  />
                ))}
              </LineChart>
            )}
          </ChartContainer>
        </div>
      )}
    </section>
  );
}
