"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";

import { ExternalLink, RefreshCw } from "lucide-react";

import { getLandingPageReport } from "@/app/actions/google-ads";
import { DateRangePicker } from "@/components/date-range-picker";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { last30Days } from "@/lib/date-presets";
import { cn } from "@/lib/utils";
import type { DateRange, LandingPageReport, LandingPageRow } from "@/types/google-ads";

const TABLE_HEAD_STICKY =
  "sticky top-0 z-10 bg-muted/90 text-foreground shadow-[0_1px_0_hsl(var(--border))] backdrop-blur-sm";

type SortKey = "url" | "spend" | "clicks" | "ctr" | "conversions" | "cpa" | "convRate";
type SortDir = "asc" | "desc";

function compare(a: LandingPageRow, b: LandingPageRow, key: SortKey): number {
  if (key === "url") return a.url.localeCompare(b.url);
  return (a[key] as number) - (b[key] as number);
}

function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.length > 1 ? u.pathname : "";
    return `${u.host}${path}`;
  } catch {
    return url;
  }
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

function LandingPagesTable({ report }: { report: LandingPageReport }) {
  const [sortKey, setSortKey] = useState<SortKey>("spend");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [campaignFilter, setCampaignFilter] = useState<string | null>(null);
  const [wasteOnly, setWasteOnly] = useState(false);

  const campaigns = useMemo(() => {
    const set = new Set<string>();
    for (const r of report.rows) for (const c of r.campaigns) set.add(c);
    return [...set].sort();
  }, [report.rows]);

  const sorted = useMemo(() => {
    let rows = report.rows;
    if (campaignFilter) rows = rows.filter((r) => r.campaigns.includes(campaignFilter));
    if (wasteOnly) rows = rows.filter((r) => r.isWaste);
    return [...rows].sort((a, b) => {
      const cmp = compare(a, b, sortKey);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [report.rows, sortKey, sortDir, campaignFilter, wasteOnly]);

  const toggle = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const totalSpend = sorted.reduce((s, r) => s + r.spend, 0);
  const wasteSpend = sorted.filter((r) => r.isWaste).reduce((s, r) => s + r.spend, 0);

  return (
    <div className="space-y-3">
      {campaigns.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-xs">Filter:</span>
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

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{sorted.length} URLs</Badge>
        <Badge variant="outline">Spend: ₹{totalSpend.toFixed(2)}</Badge>
        {wasteSpend > 0 && (
          <Badge variant="outline" className="text-destructive">
            Waste: ₹{wasteSpend.toFixed(2)}
          </Badge>
        )}
        <Button
          type="button"
          variant={wasteOnly ? "default" : "outline"}
          size="sm"
          className="ml-auto h-7 rounded-full px-3 text-xs"
          onClick={() => setWasteOnly((v) => !v)}
        >
          {wasteOnly ? "Show all" : "Show waste only"}
        </Button>
      </div>

      <div className="max-h-[560px] overflow-auto rounded-lg border">
        <Table noScrollContainer>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className={cn(TABLE_HEAD_STICKY, "cursor-pointer select-none")} onClick={() => toggle("url")}>
                URL {sortKey === "url" ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </TableHead>
              <TableHead className={TABLE_HEAD_STICKY}>Used in</TableHead>
              <SortableTh label="Spend" col="spend" sortKey={sortKey} sortDir={sortDir} onToggle={toggle} />
              <SortableTh label="Clicks" col="clicks" sortKey={sortKey} sortDir={sortDir} onToggle={toggle} />
              <SortableTh label="CTR" col="ctr" sortKey={sortKey} sortDir={sortDir} onToggle={toggle} />
              <SortableTh label="Conv." col="conversions" sortKey={sortKey} sortDir={sortDir} onToggle={toggle} />
              <SortableTh label="Conv. rate" col="convRate" sortKey={sortKey} sortDir={sortDir} onToggle={toggle} />
              <SortableTh label="CPA" col="cpa" sortKey={sortKey} sortDir={sortDir} onToggle={toggle} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((r) => (
              <TableRow key={r.url} className={r.isWaste ? "bg-destructive/5" : undefined}>
                <TableCell className="max-w-[320px] text-xs">
                  <div className="flex items-center gap-2">
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex max-w-[260px] items-center gap-1 truncate text-foreground hover:underline"
                      title={r.url}
                    >
                      <span className="truncate">{shortUrl(r.url)}</span>
                      <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                    </a>
                    {r.isWaste && (
                      <Badge variant="outline" className="border-destructive/40 text-[10px] text-destructive">
                        waste
                      </Badge>
                    )}
                  </div>
                  {r.campaigns.length > 0 && (
                    <div className="mt-0.5 truncate text-[10px] text-muted-foreground" title={r.campaigns.join(", ")}>
                      {r.campaigns.join(" · ")}
                    </div>
                  )}
                </TableCell>
                <TableCell className="max-w-[220px] text-xs">
                  {r.usedByAdGroups.length === 0 ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <div className="truncate" title={r.usedByAdGroups.join("\n")}>
                      {r.usedByAdGroups.length === 1 ? r.usedByAdGroups[0] : `${r.usedByAdGroups.length} ad groups`}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums">₹{r.spend.toFixed(2)}</TableCell>
                <TableCell className="text-right text-xs tabular-nums">{r.clicks.toLocaleString()}</TableCell>
                <TableCell className="text-right text-xs tabular-nums">{(r.ctr * 100).toFixed(2)}%</TableCell>
                <TableCell className="text-right text-xs tabular-nums">
                  {r.conversions.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums">{(r.convRate * 100).toFixed(2)}%</TableCell>
                <TableCell className="text-right text-xs tabular-nums">
                  {r.cpa > 0 ? `₹${r.cpa.toFixed(2)}` : "N/A"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function LandingPagesCardContent() {
  const [dateRange, setDateRange] = useState<DateRange>(() => last30Days());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<LandingPageReport | null>(null);

  const fetch = useCallback(async (dr: DateRange, opts: { forceRefresh?: boolean } = {}) => {
    setLoading(true);
    setError(null);
    try {
      const res = await getLandingPageReport({
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
        <CardTitle>Landing page performance</CardTitle>
        <CardDescription>
          One row per unexpanded final URL. Waste = spend ≥ ₹500 with 0 conversions. The &ldquo;Used in&rdquo; column
          lists the ad groups whose ads link to each URL — helps tie a weak LP back to a specific ad group&apos;s ads.
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

        {report && report.rows.length === 0 && (
          <div className="rounded-md border border-dashed p-6 text-center text-muted-foreground text-sm">
            No landing page data for this range.
          </div>
        )}

        {report && report.rows.length > 0 && <LandingPagesTable report={report} />}
      </CardContent>
    </Card>
  );
}

export function LandingPagesCard() {
  return (
    <Suspense
      fallback={
        <Card>
          <CardHeader>
            <CardTitle>Landing page performance</CardTitle>
            <CardDescription>Loading…</CardDescription>
          </CardHeader>
        </Card>
      }
    >
      <LandingPagesCardContent />
    </Suspense>
  );
}
