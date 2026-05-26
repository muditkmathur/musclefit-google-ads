"use client";

import { Fragment, Suspense, useCallback, useEffect, useMemo, useState } from "react";

import { ChevronDown, ChevronRight, RefreshCw } from "lucide-react";

import { getAdPerformance } from "@/app/actions/google-ads";
import { DateRangePicker } from "@/components/date-range-picker";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { last30Days } from "@/lib/date-presets";
import { cn } from "@/lib/utils";
import type {
  AdAssetPerformanceRow,
  AdPerformanceReport,
  AdPerformanceRow,
  AdStrengthLabel,
  AssetPerformanceLabel,
  DateRange,
} from "@/types/google-ads";

const TABLE_HEAD_STICKY =
  "sticky top-0 z-10 bg-muted/90 text-foreground shadow-[0_1px_0_hsl(var(--border))] backdrop-blur-sm";

function strengthClass(strength: AdStrengthLabel): string {
  switch (strength) {
    case "Excellent":
    case "Good":
      return "text-green-600 dark:text-green-400";
    case "Average":
    case "Pending":
    case "Learning" as never:
      return "text-amber-600 dark:text-amber-400";
    case "Poor":
    case "No ads":
      return "text-destructive";
    default:
      return "text-muted-foreground";
  }
}

function assetClass(label: AssetPerformanceLabel): string {
  switch (label) {
    case "BEST":
      return "text-green-600 dark:text-green-400";
    case "GOOD":
      return "text-foreground";
    case "LOW":
      return "text-destructive";
    case "LEARNING":
    case "PENDING":
      return "text-amber-600 dark:text-amber-400";
    default:
      return "text-muted-foreground";
  }
}

type SortKey = "spend" | "clicks" | "conversions" | "ctr" | "cpa" | "adStrength";
type SortDir = "asc" | "desc";

const STRENGTH_RANK: Record<AdStrengthLabel, number> = {
  Excellent: 4,
  Good: 3,
  Average: 2,
  Pending: 1,
  "No ads": 0,
  Poor: 0,
  Unknown: -1,
};

function compare(a: AdPerformanceRow, b: AdPerformanceRow, key: SortKey): number {
  if (key === "adStrength") return STRENGTH_RANK[a.adStrength] - STRENGTH_RANK[b.adStrength];
  return (a[key] as number) - (b[key] as number);
}

function SortableTh({
  label,
  col,
  sortKey,
  sortDir,
  onToggle,
  className,
}: {
  label: string;
  col: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onToggle: (col: SortKey) => void;
  className?: string;
}) {
  return (
    <TableHead
      className={cn(TABLE_HEAD_STICKY, "cursor-pointer select-none whitespace-nowrap text-right", className)}
      onClick={() => onToggle(col)}
    >
      {label} {sortKey === col ? (sortDir === "asc" ? "↑" : "↓") : ""}
    </TableHead>
  );
}

function AssetList({ assets }: { assets: AdAssetPerformanceRow[] }) {
  const headlines = assets.filter((a) => a.fieldType === "HEADLINE");
  const descriptions = assets.filter((a) => a.fieldType === "DESCRIPTION");

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <div className="mb-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">Headlines</div>
        <ul className="space-y-1">
          {headlines.length === 0 && <li className="text-muted-foreground text-xs">—</li>}
          {headlines.map((a, i) => (
            <li key={`h:${i}:${a.text}`} className="flex items-start justify-between gap-2 text-xs">
              <span className="truncate" title={a.text}>
                {a.text}
              </span>
              <span className={cn("shrink-0 tabular-nums", assetClass(a.performanceLabel))}>{a.performanceLabel}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <div className="mb-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">Descriptions</div>
        <ul className="space-y-1">
          {descriptions.length === 0 && <li className="text-muted-foreground text-xs">—</li>}
          {descriptions.map((a, i) => (
            <li key={`d:${i}:${a.text}`} className="flex items-start justify-between gap-2 text-xs">
              <span className="truncate" title={a.text}>
                {a.text}
              </span>
              <span className={cn("shrink-0 tabular-nums", assetClass(a.performanceLabel))}>{a.performanceLabel}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function AdsTable({ report }: { report: AdPerformanceReport }) {
  const [sortKey, setSortKey] = useState<SortKey>("spend");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [campaignFilter, setCampaignFilter] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const campaigns = useMemo(() => {
    const set = new Set(report.ads.map((a) => a.campaign).filter(Boolean));
    return [...set].sort();
  }, [report.ads]);

  const sorted = useMemo(() => {
    let rows = report.ads;
    if (campaignFilter) rows = rows.filter((r) => r.campaign === campaignFilter);
    return [...rows].sort((a, b) => {
      const cmp = compare(a, b, sortKey);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [report.ads, sortKey, sortDir, campaignFilter]);

  const toggle = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const flipExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const lowAssetCount = report.ads.reduce((s, a) => s + a.assets.filter((x) => x.performanceLabel === "LOW").length, 0);
  const weakAdCount = report.ads.filter((a) => a.adStrength === "Poor" || a.adStrength === "Average").length;

  return (
    <div className="space-y-3">
      {campaigns.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-xs">Campaign:</span>
          <Button
            type="button"
            variant={!campaignFilter ? "default" : "outline"}
            size="sm"
            className="h-7 rounded-full px-3 text-xs"
            onClick={() => setCampaignFilter(null)}
          >
            All
          </Button>
          {campaigns.map((c) => (
            <Button
              key={c}
              type="button"
              variant={campaignFilter === c ? "default" : "outline"}
              size="sm"
              className="h-7 rounded-full px-3 text-xs"
              onClick={() => setCampaignFilter(c)}
            >
              {c}
            </Button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">{sorted.length} ads</Badge>
        {weakAdCount > 0 && (
          <Badge variant="outline" className="text-amber-600 dark:text-amber-400">
            {weakAdCount} weak ad strength
          </Badge>
        )}
        {lowAssetCount > 0 && (
          <Badge variant="outline" className="text-destructive">
            {lowAssetCount} LOW assets
          </Badge>
        )}
      </div>

      <div className="max-h-[640px] overflow-auto rounded-lg border">
        <Table noScrollContainer>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className={cn(TABLE_HEAD_STICKY, "w-8")}>&nbsp;</TableHead>
              <TableHead className={TABLE_HEAD_STICKY}>Campaign · Ad group</TableHead>
              <TableHead className={cn(TABLE_HEAD_STICKY, "whitespace-nowrap")}>Type</TableHead>
              <SortableTh
                label="Strength"
                col="adStrength"
                sortKey={sortKey}
                sortDir={sortDir}
                onToggle={toggle}
                className="text-left"
              />
              <SortableTh label="Spend" col="spend" sortKey={sortKey} sortDir={sortDir} onToggle={toggle} />
              <SortableTh label="Clicks" col="clicks" sortKey={sortKey} sortDir={sortDir} onToggle={toggle} />
              <SortableTh label="CTR" col="ctr" sortKey={sortKey} sortDir={sortDir} onToggle={toggle} />
              <SortableTh label="Conv." col="conversions" sortKey={sortKey} sortDir={sortDir} onToggle={toggle} />
              <SortableTh label="CPA" col="cpa" sortKey={sortKey} sortDir={sortDir} onToggle={toggle} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((ad) => {
              const id = `${ad.campaign}\u0000${ad.adGroup}\u0000${ad.adId}`;
              const isOpen = expanded.has(id);
              const canExpand = ad.assets.length > 0;
              return (
                <Fragment key={id}>
                  <TableRow>
                    <TableCell className="w-8">
                      {canExpand ? (
                        <button
                          type="button"
                          onClick={() => flipExpanded(id)}
                          className="rounded p-1 hover:bg-muted"
                          aria-label={isOpen ? "Collapse" : "Expand"}
                        >
                          {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        </button>
                      ) : null}
                    </TableCell>
                    <TableCell className="max-w-[280px] text-xs">
                      <div className="truncate font-medium" title={ad.adGroup}>
                        {ad.adGroup}
                      </div>
                      <div className="truncate text-[10px] text-muted-foreground" title={ad.campaign}>
                        {ad.campaign}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">{ad.adType}</TableCell>
                    <TableCell className={cn("text-xs", strengthClass(ad.adStrength))}>{ad.adStrength}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">₹{ad.spend.toFixed(2)}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{ad.clicks.toLocaleString()}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{(ad.ctr * 100).toFixed(2)}%</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {ad.conversions.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {ad.cpa > 0 ? `₹${ad.cpa.toFixed(2)}` : "N/A"}
                    </TableCell>
                  </TableRow>
                  {isOpen && canExpand && (
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableCell />
                      <TableCell colSpan={8} className="py-3">
                        <AssetList assets={ad.assets} />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function AdPerformanceCardContent() {
  const [dateRange, setDateRange] = useState<DateRange>(() => last30Days());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<AdPerformanceReport | null>(null);

  const fetch = useCallback(async (dr: DateRange, opts: { forceRefresh?: boolean } = {}) => {
    setLoading(true);
    setError(null);
    try {
      const res = await getAdPerformance({ start: dr.start, end: dr.end, forceRefresh: Boolean(opts.forceRefresh) });
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
        <CardTitle>Ads &amp; RSA assets</CardTitle>
        <CardDescription>
          Expand a row to see RSA headlines and descriptions with Google&apos;s performance label. LOW labels and Poor /
          Average ad strength are the fastest wins for &ldquo;Ad relevance&rdquo; quality.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <DateRangePicker value={dateRange} onChange={setDateRange} />

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

        {report && report.ads.length === 0 && (
          <div className="rounded-md border border-dashed p-6 text-center text-muted-foreground text-sm">
            No ads found for this range.
          </div>
        )}

        {report && report.ads.length > 0 && <AdsTable report={report} />}
      </CardContent>
    </Card>
  );
}

export function AdPerformanceCard() {
  return (
    <Suspense
      fallback={
        <Card>
          <CardHeader>
            <CardTitle>Ads &amp; RSA assets</CardTitle>
            <CardDescription>Loading…</CardDescription>
          </CardHeader>
        </Card>
      }
    >
      <AdPerformanceCardContent />
    </Suspense>
  );
}
