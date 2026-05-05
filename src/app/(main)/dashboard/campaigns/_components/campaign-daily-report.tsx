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
import type {
  CampaignDailyEntry,
  CampaignDailyReport,
  CampaignDemographicDailyEntry,
  CampaignDemographicSlice,
  CampaignDemographicsReport,
  CampaignGranularity,
  DemographicDimension,
} from "@/types/google-ads";

type MetricKey = "spend" | "impressions" | "clicks" | "conversions" | "ctr" | "avg_cpc";
type UnitGroup = "count" | "currency" | "percent";
type ChartType = "bar" | "line";
type View = "daily" | "demographics";

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
  /** Map from series key -> axis id used by Bar/Line yAxisId. */
  metricToAxis: Record<string, string>;
  /** Axes to render, in mount order. Hidden axes are still required to scale their series. */
  descriptors: AxisDescriptor[];
}

/**
 * Per-series axis assignment: every visible series gets its own Y-axis (and therefore its own scale)
 * so series of very different magnitudes never squash each other. All axes are rendered visibly so the
 * reader can see the scale for each — multiple axes on the same orientation stack side-by-side.
 */
function computeAxisAssignmentsForMetrics(metrics: readonly MetricSpec[]): AxisAssignment {
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

/**
 * Demographics chart shows multiple buckets at the same metric. Buckets share a single
 * y-axis since they all measure the same thing.
 */
function computeAxisAssignmentForSingleUnit(unit: UnitGroup, seriesKeys: string[]): AxisAssignment {
  const id = `axis__${unit}`;
  const metricToAxis: Record<string, string> = {};
  for (const key of seriesKeys) metricToAxis[key] = id;
  const descriptors: AxisDescriptor[] = [
    {
      id,
      unit,
      orientation: UNIT_AXIS_ORIENTATION[unit],
      width: UNIT_AXIS_WIDTH[unit],
      visible: true,
      color: "var(--muted-foreground)",
    },
  ];
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
  demographics?: CampaignDemographicsReport;
  granularity: CampaignGranularity;
}

export function CampaignDailyReportSection({ daily, demographics, granularity }: CampaignDailyReportSectionProps) {
  const hasDemographics = Boolean(demographics && demographics.campaigns.length > 0);
  const [view, setView] = useState<View>("daily");

  useEffect(() => {
    if (!hasDemographics && view === "demographics") {
      setView("daily");
    }
  }, [hasDemographics, view]);

  const headerTitle = view === "demographics" ? "Demographics" : "Daily breakdown";
  const headerMeta =
    view === "demographics" && demographics
      ? `${demographics.period} (${demographics.date_range.start} → ${demographics.date_range.end}) · ${demographics.campaigns.length} campaigns`
      : `${daily.period} (${daily.date_range.start} → ${daily.date_range.end}) · ${daily.campaigns.length} campaigns`;

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div>
          <h3 className="font-semibold text-base">{headerTitle}</h3>
          <p className="text-muted-foreground text-sm">{headerMeta}</p>
        </div>
        {hasDemographics && (
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            spacing={1}
            value={view}
            onValueChange={(v) => {
              if (v === "daily" || v === "demographics") setView(v);
            }}
            aria-label="Breakdown view"
          >
            <ToggleGroupItem value="daily" className="text-xs">
              Daily
            </ToggleGroupItem>
            <ToggleGroupItem value="demographics" className="text-xs">
              Demographics
            </ToggleGroupItem>
          </ToggleGroup>
        )}
      </div>

      {view === "daily" || !demographics ? (
        <DailyView daily={daily} granularity={granularity} />
      ) : (
        <DemographicsView demographics={demographics} granularity={granularity} />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Daily view
// ---------------------------------------------------------------------------

interface DailyViewProps {
  daily: CampaignDailyReport;
  granularity: CampaignGranularity;
}

function DailyView({ daily, granularity }: DailyViewProps) {
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

  const axisAssignment = useMemo(() => computeAxisAssignmentsForMetrics(selectedMetrics), [selectedMetrics]);

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
          <span className="font-medium font-mono tabular-nums">{String(value ?? "")}</span>
        </div>
      );
    }
    return (
      <div className="flex w-full items-center justify-between gap-3">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span aria-hidden className="size-2 rounded-[2px]" style={{ backgroundColor: metric.color }} />
          {metric.label}
        </span>
        <span className="font-medium font-mono tabular-nums">{metric.format(Number(value ?? 0))}</span>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
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
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Demographics view
// ---------------------------------------------------------------------------

const DEMOGRAPHIC_DIMENSIONS: ReadonlyArray<{ key: DemographicDimension; label: string }> = [
  { key: "age_range", label: "Age range" },
  { key: "gender", label: "Gender" },
];

/**
 * Fallback palette used only for demographic buckets that are not explicitly mapped
 * below (e.g. unexpected enum values surfaced by the API in the future). Buckets
 * receive a stable color for the same (dimension, label) regardless of which
 * campaign is selected, so the legend reads consistently across views.
 */
const BUCKET_PALETTE = [
  "#2563eb",
  "#f97316",
  "#16a34a",
  "#9333ea",
  "#db2777",
  "#0d9488",
  "#dc2626",
  "#a16207",
  "#0ea5e9",
];

/**
 * Canonical color per demographic bucket label, keyed by the labels produced in
 * the report layer. Keeping these stable means the same age-range or gender
 * bucket always renders with the same color across campaigns and selections.
 */
const AGE_RANGE_COLORS: Record<string, string> = {
  "18-24": "#2563eb",
  "25-34": "#0ea5e9",
  "35-44": "#16a34a",
  "45-54": "#f59e0b",
  "55-64": "#f97316",
  "65+": "#dc2626",
  Undetermined: "#94a3b8",
  Unknown: "#64748b",
  Unspecified: "#475569",
};

const GENDER_COLORS: Record<string, string> = {
  Male: "#2563eb",
  Female: "#db2777",
  Undetermined: "#94a3b8",
  Unknown: "#64748b",
  Unspecified: "#475569",
};

function colorForBucket(dimension: DemographicDimension, label: string, fallbackIdx: number): string {
  const lookup = dimension === "age_range" ? AGE_RANGE_COLORS : GENDER_COLORS;
  return lookup[label] ?? BUCKET_PALETTE[fallbackIdx % BUCKET_PALETTE.length];
}

interface DemographicsViewProps {
  demographics: CampaignDemographicsReport;
  granularity: CampaignGranularity;
}

interface BucketBucketDatum {
  bucket: string;
  label: string;
  /** Per-bucket aggregated values keyed by demographic bucket key. */
  values: Record<string, number>;
  /** Per-bucket counts used for averaging ratio metrics. */
  counts: Record<string, number>;
}

type DemographicsChartRow = { bucket: string; label: string } & Record<string, number | string>;

function aggregateDemographicSlice(
  days: CampaignDemographicDailyEntry[],
  metric: MetricSpec,
  granularity: CampaignGranularity,
): BucketBucketDatum[] {
  const map = new Map<string, BucketBucketDatum>();
  for (const entry of days) {
    const key = bucketKey(entry.date, granularity);
    const existing =
      map.get(key) ??
      ({
        bucket: key,
        label: formatBucketLabel(key, granularity),
        values: {},
        counts: {},
      } satisfies BucketBucketDatum);
    const raw = readDemographicMetric(entry, metric.key);
    existing.values[entry.bucket] = (existing.values[entry.bucket] ?? 0) + raw;
    existing.counts[entry.bucket] = (existing.counts[entry.bucket] ?? 0) + 1;
    map.set(key, existing);
  }
  const list = Array.from(map.values()).sort((a, b) => a.bucket.localeCompare(b.bucket));
  if (metric.aggregation === "avg") {
    for (const datum of list) {
      for (const bucket of Object.keys(datum.values)) {
        const count = datum.counts[bucket] ?? 0;
        if (count > 0) datum.values[bucket] = datum.values[bucket] / count;
      }
    }
  }
  return list;
}

function readDemographicMetric(entry: CampaignDemographicDailyEntry, key: MetricKey): number {
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

function mergeSlicesAcrossCampaigns(
  campaigns: CampaignDemographicsReport["campaigns"],
  dimension: DemographicDimension,
): CampaignDemographicSlice | null {
  const allDays: CampaignDemographicDailyEntry[] = [];
  const bucketLabelByKey = new Map<string, string>();
  for (const c of campaigns) {
    const slice = c.slices.find((s) => s.dimension === dimension);
    if (!slice) continue;
    for (const b of slice.buckets) bucketLabelByKey.set(b.key, b.label);
    allDays.push(...slice.days);
  }
  if (allDays.length === 0) return null;
  const buckets = Array.from(bucketLabelByKey.entries()).map(([key, label]) => ({ key, label }));
  return { dimension, buckets, days: allDays };
}

function DemographicsView({ demographics, granularity }: DemographicsViewProps) {
  const initialDimension: DemographicDimension = demographics.campaigns.find((c) =>
    c.slices.some((s) => s.dimension === "age_range"),
  )
    ? "age_range"
    : "gender";

  const [dimension, setDimension] = useState<DemographicDimension>(initialDimension);
  const [metricKey, setMetricKey] = useState<MetricKey>("spend");
  const [chartType, setChartType] = useState<ChartType>("line");
  const [selected, setSelected] = useState<string>(ALL_CAMPAIGNS_VALUE);

  useEffect(() => {
    if (selected === ALL_CAMPAIGNS_VALUE) return;
    const exists = demographics.campaigns.some((c) => c.campaign === selected);
    if (!exists) setSelected(ALL_CAMPAIGNS_VALUE);
  }, [demographics, selected]);

  const isAllCampaigns = selected === ALL_CAMPAIGNS_VALUE;
  const metric = METRIC_BY_KEY[metricKey];

  const slice = useMemo<CampaignDemographicSlice | null>(() => {
    if (isAllCampaigns) return mergeSlicesAcrossCampaigns(demographics.campaigns, dimension);
    const campaign = demographics.campaigns.find((c) => c.campaign === selected);
    if (!campaign) return null;
    return campaign.slices.find((s) => s.dimension === dimension) ?? null;
  }, [demographics, dimension, isAllCampaigns, selected]);

  const buckets = useMemo(() => slice?.buckets ?? [], [slice]);

  const bucketColor = useMemo(() => {
    const map: Record<string, string> = {};
    buckets.forEach((b, idx) => {
      map[b.key] = colorForBucket(dimension, b.label, idx);
    });
    return map;
  }, [buckets, dimension]);

  const datums = useMemo(() => {
    if (!slice) return [];
    return aggregateDemographicSlice(slice.days, metric, granularity);
  }, [slice, metric, granularity]);

  const chartData: DemographicsChartRow[] = useMemo(
    () =>
      datums.map((d) => {
        const row: DemographicsChartRow = { bucket: d.bucket, label: d.label };
        for (const b of buckets) {
          row[b.key] = d.values[b.key] ?? 0;
        }
        return row;
      }),
    [datums, buckets],
  );

  const summaryStats = useMemo(() => {
    return buckets.map((b) => {
      const values = datums.map((d) => d.values[b.key] ?? 0);
      const total =
        metric.aggregation === "sum"
          ? values.reduce((s, v) => s + v, 0)
          : values.length > 0
            ? values.reduce((s, v) => s + v, 0) / values.length
            : 0;
      return { bucket: b, value: total };
    });
  }, [buckets, datums, metric.aggregation]);

  const axisAssignment = useMemo(
    () =>
      computeAxisAssignmentForSingleUnit(
        metric.unit,
        buckets.map((b) => b.key),
      ),
    [metric.unit, buckets],
  );

  const chartConfig = useMemo<ChartConfig>(() => {
    const config: ChartConfig = {};
    for (const b of buckets) {
      config[b.key] = { color: bucketColor[b.key], label: b.label };
    }
    return config;
  }, [buckets, bucketColor]);

  const scopeLabel = isAllCampaigns ? `All campaigns (${demographics.campaigns.length})` : selected;
  const showChart = buckets.length > 0 && datums.length > 0;

  const tooltipFormatter = (value: unknown, name: unknown) => {
    const bucketKeyName = String(name);
    const found = buckets.find((b) => b.key === bucketKeyName);
    return (
      <div className="flex w-full items-center justify-between gap-3">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span
            aria-hidden
            className="size-2 rounded-[2px]"
            style={{ backgroundColor: bucketColor[bucketKeyName] ?? "var(--muted-foreground)" }}
          />
          {found?.label ?? bucketKeyName}
        </span>
        <span className="font-medium font-mono tabular-nums">{metric.format(Number(value ?? 0))}</span>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          spacing={1}
          value={dimension}
          onValueChange={(v) => {
            if (v === "gender" || v === "age_range") setDimension(v);
          }}
          aria-label="Demographic dimension"
        >
          {DEMOGRAPHIC_DIMENSIONS.map((d) => (
            <ToggleGroupItem key={d.key} value={d.key} className="text-xs">
              {d.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

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
        type="single"
        variant="outline"
        size="sm"
        spacing={1}
        value={metricKey}
        onValueChange={(v) => {
          if (v) setMetricKey(v as MetricKey);
        }}
        className="flex-wrap"
        aria-label="Select metric"
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

      {demographics.campaigns.length > 0 && (
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
          aria-label="Filter demographics by campaign"
        >
          <ToggleGroupItem value={ALL_CAMPAIGNS_VALUE} className="text-xs">
            All campaigns
          </ToggleGroupItem>
          {demographics.campaigns.map((c) => (
            <ToggleGroupItem key={c.campaign} value={c.campaign} className="text-xs">
              {c.campaign}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}

      {showChart ? (
        <div className="rounded-lg border bg-card p-4">
          <div className="flex flex-wrap items-end justify-between gap-3 pb-3">
            <div>
              <h4 className="font-medium text-sm">{scopeLabel}</h4>
              <p className="text-muted-foreground text-xs">
                {metric.label} · {dimension === "age_range" ? "Age range" : "Gender"} · {granularity}
              </p>
            </div>
            <div className="flex max-w-full flex-wrap items-center gap-3">
              {summaryStats.map(({ bucket, value }) => (
                <div key={bucket.key} className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="size-2 rounded-[2px]"
                    style={{ backgroundColor: bucketColor[bucket.key] }}
                  />
                  <div className="flex flex-col leading-tight">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                      {bucket.label} · {metric.aggregation === "sum" ? "total" : "avg"}
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
                  />
                ))}
                <ChartTooltip
                  cursor={{ fill: "var(--muted)", fillOpacity: 0.4 }}
                  content={<ChartTooltipContent indicator="dot" labelKey="label" formatter={tooltipFormatter} />}
                />
                <ChartLegend content={<ChartLegendContent />} />
                {buckets.map((b) => (
                  <Bar
                    key={b.key}
                    yAxisId={axisAssignment.metricToAxis[b.key]}
                    dataKey={b.key}
                    name={b.key}
                    fill={bucketColor[b.key]}
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
                  />
                ))}
                <ChartTooltip
                  cursor={{ stroke: "var(--border)" }}
                  content={<ChartTooltipContent indicator="dot" labelKey="label" formatter={tooltipFormatter} />}
                />
                <ChartLegend content={<ChartLegendContent />} />
                {buckets.map((b) => (
                  <Line
                    key={b.key}
                    yAxisId={axisAssignment.metricToAxis[b.key]}
                    type="monotone"
                    dataKey={b.key}
                    name={b.key}
                    stroke={bucketColor[b.key]}
                    strokeWidth={2}
                    dot={{ r: 3, strokeWidth: 0, fill: bucketColor[b.key] }}
                    activeDot={{ r: 5, strokeWidth: 0 }}
                  />
                ))}
              </LineChart>
            )}
          </ChartContainer>
        </div>
      ) : (
        <div className="flex h-32 items-center justify-center rounded-lg border border-border border-dashed text-muted-foreground text-sm">
          No demographic data for this selection.
        </div>
      )}
    </div>
  );
}
