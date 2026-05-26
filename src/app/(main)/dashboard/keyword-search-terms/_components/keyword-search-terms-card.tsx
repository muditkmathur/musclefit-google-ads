"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";

import { RefreshCw } from "lucide-react";

import { getKeywordSearchTermMap } from "@/app/actions/google-ads";
import { DateRangePicker } from "@/components/date-range-picker";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { last30Days } from "@/lib/date-presets";
import { cn } from "@/lib/utils";
import type { DateRange, KeywordSearchTermMapReport, KeywordSearchTermMapRow } from "@/types/google-ads";

const TABLE_HEAD_STICKY =
  "sticky top-0 z-10 bg-muted/90 text-foreground shadow-[0_1px_0_hsl(var(--border))] backdrop-blur-sm";

type SortKey = "searchTerm" | "keyword" | "spend" | "clicks" | "conversions" | "cpa" | "convRate";
type SortDir = "asc" | "desc";
type FlagFilter = "all" | "mismatch" | "broad" | "waste";

function compare(a: KeywordSearchTermMapRow, b: KeywordSearchTermMapRow, key: SortKey): number {
  if (key === "searchTerm") return a.searchTerm.localeCompare(b.searchTerm);
  if (key === "keyword") return a.keyword.localeCompare(b.keyword);
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

function MatchTypeBadge({ matchType, isBroad }: { matchType: string; isBroad: boolean }) {
  if (!matchType) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge
      variant="outline"
      className={cn(
        "h-5 px-1.5 text-[10px]",
        isBroad ? "border-amber-500/50 text-amber-600 dark:text-amber-400" : "text-muted-foreground",
      )}
    >
      {matchType}
    </Badge>
  );
}

function KeywordSearchTermsTable({ report }: { report: KeywordSearchTermMapReport }) {
  const [sortKey, setSortKey] = useState<SortKey>("spend");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [campaignFilter, setCampaignFilter] = useState<string | null>(null);
  const [flagFilter, setFlagFilter] = useState<FlagFilter>("all");

  const campaigns = useMemo(() => {
    const set = new Set(report.rows.map((r) => r.campaign).filter(Boolean));
    return [...set].sort();
  }, [report.rows]);

  const sorted = useMemo(() => {
    let rows = report.rows;
    if (campaignFilter) rows = rows.filter((r) => r.campaign === campaignFilter);
    if (flagFilter === "mismatch") rows = rows.filter((r) => r.intentMismatch);
    if (flagFilter === "broad") rows = rows.filter((r) => r.isBroadTrigger);
    if (flagFilter === "waste") rows = rows.filter((r) => r.isWaste);
    return [...rows].sort((a, b) => {
      const cmp = compare(a, b, sortKey);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [report.rows, sortKey, sortDir, campaignFilter, flagFilter]);

  const toggle = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const mismatchCount = report.rows.filter((r) => r.intentMismatch).length;
  const broadCount = report.rows.filter((r) => r.isBroadTrigger).length;
  const wasteCount = report.rows.filter((r) => r.isWaste).length;

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

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{sorted.length} rows</Badge>
        <Badge variant="outline">Top {report.topLimit}</Badge>
        {mismatchCount > 0 && (
          <button
            type="button"
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10px]",
              flagFilter === "mismatch" ? "border-foreground bg-foreground/10" : "border-border",
            )}
            onClick={() => setFlagFilter((f) => (f === "mismatch" ? "all" : "mismatch"))}
          >
            {mismatchCount} intent mismatch
          </button>
        )}
        {broadCount > 0 && (
          <button
            type="button"
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10px]",
              flagFilter === "broad" ? "border-foreground bg-foreground/10" : "border-border",
            )}
            onClick={() => setFlagFilter((f) => (f === "broad" ? "all" : "broad"))}
          >
            {broadCount} broad-triggered
          </button>
        )}
        {wasteCount > 0 && (
          <button
            type="button"
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10px] text-destructive",
              flagFilter === "waste" ? "border-destructive bg-destructive/10" : "border-destructive/40",
            )}
            onClick={() => setFlagFilter((f) => (f === "waste" ? "all" : "waste"))}
          >
            {wasteCount} waste
          </button>
        )}
      </div>

      <div className="max-h-[640px] overflow-auto rounded-lg border">
        <Table noScrollContainer>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead
                className={cn(TABLE_HEAD_STICKY, "cursor-pointer select-none")}
                onClick={() => toggle("searchTerm")}
              >
                Search term {sortKey === "searchTerm" ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </TableHead>
              <TableHead
                className={cn(TABLE_HEAD_STICKY, "cursor-pointer select-none")}
                onClick={() => toggle("keyword")}
              >
                Keyword {sortKey === "keyword" ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </TableHead>
              <TableHead className={cn(TABLE_HEAD_STICKY, "whitespace-nowrap")}>Match</TableHead>
              <SortableTh label="Spend" col="spend" sortKey={sortKey} sortDir={sortDir} onToggle={toggle} />
              <SortableTh label="Clicks" col="clicks" sortKey={sortKey} sortDir={sortDir} onToggle={toggle} />
              <SortableTh label="Conv." col="conversions" sortKey={sortKey} sortDir={sortDir} onToggle={toggle} />
              <SortableTh label="CPA" col="cpa" sortKey={sortKey} sortDir={sortDir} onToggle={toggle} />
              <SortableTh label="Conv. rate" col="convRate" sortKey={sortKey} sortDir={sortDir} onToggle={toggle} />
              <TableHead className={cn(TABLE_HEAD_STICKY, "whitespace-nowrap")}>Flags</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((r, i) => (
              <TableRow
                key={`${i}:${r.searchTerm}:${r.keyword}`}
                className={r.isWaste ? "bg-destructive/5" : undefined}
              >
                <TableCell className="max-w-[260px] truncate text-xs" title={r.searchTerm}>
                  {r.searchTerm || <span className="text-muted-foreground">—</span>}
                  <div className="truncate text-[10px] text-muted-foreground" title={r.campaign}>
                    {r.campaign} {r.adGroup ? ` › ${r.adGroup}` : ""}
                  </div>
                </TableCell>
                <TableCell className="max-w-[220px] truncate font-medium text-xs" title={r.keyword}>
                  {r.keyword || <span className="text-muted-foreground italic">no keyword</span>}
                </TableCell>
                <TableCell>
                  <MatchTypeBadge matchType={r.matchType} isBroad={r.isBroadTrigger} />
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums">₹{r.spend.toFixed(2)}</TableCell>
                <TableCell className="text-right text-xs tabular-nums">{r.clicks.toLocaleString()}</TableCell>
                <TableCell className="text-right text-xs tabular-nums">
                  {r.conversions.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums">
                  {r.cpa > 0 ? `₹${r.cpa.toFixed(2)}` : "N/A"}
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums">{(r.convRate * 100).toFixed(2)}%</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {r.intentMismatch && (
                      <Badge variant="outline" className="h-4 px-1 text-[10px]">
                        mismatch
                      </Badge>
                    )}
                    {r.isWaste && (
                      <Badge variant="outline" className="h-4 border-destructive/40 px-1 text-[10px] text-destructive">
                        waste
                      </Badge>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function KeywordSearchTermsCardContent() {
  const [dateRange, setDateRange] = useState<DateRange>(() => last30Days());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<KeywordSearchTermMapReport | null>(null);

  const fetch = useCallback(async (dr: DateRange, opts: { forceRefresh?: boolean } = {}) => {
    setLoading(true);
    setError(null);
    try {
      const res = await getKeywordSearchTermMap({
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
        <CardTitle>Search terms by triggering keyword</CardTitle>
        <CardDescription>
          Rows are sorted by spend and capped at the top 300. Intent mismatch = the search term shares no significant
          token with the keyword. Dynamic Search Ad traffic is excluded because Google does not attach a triggering
          keyword to it.
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
            No keyword-attributed search terms for this range.
          </div>
        )}

        {report && report.rows.length > 0 && <KeywordSearchTermsTable report={report} />}
      </CardContent>
    </Card>
  );
}

export function KeywordSearchTermsCard() {
  return (
    <Suspense
      fallback={
        <Card>
          <CardHeader>
            <CardTitle>Search terms by triggering keyword</CardTitle>
            <CardDescription>Loading…</CardDescription>
          </CardHeader>
        </Card>
      }
    >
      <KeywordSearchTermsCardContent />
    </Suspense>
  );
}
