"use client";

import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { CampaignTotalsRaw } from "@/types/google-ads";

type ImprovementDirection = "higher" | "lower";

type MetricKey = keyof Pick<CampaignTotalsRaw, "impressions" | "clicks" | "ctr" | "spend" | "conversions" | "cpa">;

interface MetricSpec {
  key: MetricKey;
  label: string;
  improvement: ImprovementDirection;
  format: (value: number) => string;
  isNull?: (value: number) => boolean;
}

const METRICS: readonly MetricSpec[] = [
  {
    key: "impressions",
    label: "Impressions",
    improvement: "higher",
    format: (v) => formatCompactNumber(v),
  },
  {
    key: "clicks",
    label: "Clicks",
    improvement: "higher",
    format: (v) => formatCompactNumber(v),
  },
  {
    key: "ctr",
    label: "CTR",
    improvement: "higher",
    format: (v) => `${(v * 100).toFixed(2)}%`,
  },
  {
    key: "spend",
    label: "Spend",
    improvement: "lower",
    format: (v) => `₹${formatCompactNumber(v)}`,
  },
  {
    key: "conversions",
    label: "Conversions",
    improvement: "higher",
    format: (v) => formatCompactNumber(v),
  },
  {
    key: "cpa",
    label: "CPA",
    improvement: "lower",
    format: (v) => (v > 0 ? `₹${formatCompactNumber(v)}` : "N/A"),
    isNull: (v) => v === 0,
  },
];

function formatCompactNumber(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  if (Number.isInteger(n)) return n.toLocaleString();
  return n.toFixed(2);
}

function pctChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous === 0) {
    if (current === 0) return 0;
    return null;
  }
  return ((current - previous) / Math.abs(previous)) * 100;
}

interface CampaignKpiStripProps {
  totals: CampaignTotalsRaw | null;
  previousTotals: CampaignTotalsRaw | null;
  rangeLabel: string;
  loading?: boolean;
}

export function CampaignKpiStrip({ totals, previousTotals, rangeLabel, loading }: CampaignKpiStripProps) {
  return (
    <div className="overflow-hidden rounded-xl bg-card shadow-xs ring-1 ring-foreground/10">
      <div className="grid divide-y *:data-[slot=card]:rounded-none *:data-[slot=card]:ring-0 md:grid-cols-2 md:divide-x md:divide-y-0 xl:grid-cols-6">
        {METRICS.map((metric) => (
          <KpiCard
            key={metric.key}
            metric={metric}
            current={totals ? totals[metric.key] : null}
            previous={previousTotals ? previousTotals[metric.key] : null}
            rangeLabel={rangeLabel}
            loading={loading}
          />
        ))}
      </div>
    </div>
  );
}

interface KpiCardProps {
  metric: MetricSpec;
  current: number | null;
  previous: number | null;
  rangeLabel: string;
  loading?: boolean;
}

function KpiCard({ metric, current, previous, rangeLabel, loading }: KpiCardProps) {
  const showSkeleton = Boolean(loading) || current == null;
  const effectiveCurrent = metric.isNull?.(current ?? 0) ? null : current;
  const change = effectiveCurrent != null && previous != null ? pctChange(effectiveCurrent, previous) : null;

  const isFlat = change === null || change === 0;
  const isImprovement = !isFlat && (metric.improvement === "higher" ? (change ?? 0) > 0 : (change ?? 0) < 0);

  const badgeClass = isFlat
    ? "bg-muted text-muted-foreground"
    : isImprovement
      ? "bg-green-500/10 text-green-700 dark:bg-green-500/15 dark:text-green-300"
      : "bg-destructive/10 text-destructive";

  const ChangeIcon = (change ?? 0) >= 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-normal text-sm">{metric.label}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          {showSkeleton ? (
            <Skeleton className="h-7 w-24" />
          ) : (
            <div className="text-2xl leading-none tracking-tight tabular-nums">{metric.format(current ?? 0)}</div>
          )}
          {showSkeleton ? (
            <Skeleton className="h-5 w-12 rounded-full" />
          ) : change == null ? (
            <Badge className="bg-muted text-muted-foreground">—</Badge>
          ) : (
            <Badge className={cn(badgeClass)}>
              <ChangeIcon />
              {`${Math.abs(change).toFixed(1)}%`}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          {showSkeleton ? (
            <Skeleton className="h-3 w-32" />
          ) : (
            <>
              <span>
                from <span className="text-foreground tabular-nums">{metric.format(previous ?? 0)}</span>
              </span>
              <span>•</span>
              <span>{rangeLabel.toLowerCase()}</span>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
