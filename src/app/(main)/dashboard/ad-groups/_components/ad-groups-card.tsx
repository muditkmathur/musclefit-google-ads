"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";

import { RefreshCw } from "lucide-react";

import { getAdGroupReport } from "@/app/actions/google-ads";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDateRange } from "@/hooks/use-date-range";
import { useScope } from "@/hooks/use-scope";
import { cn } from "@/lib/utils";
import type { AdGroupReport, AdGroupRow, DateRange } from "@/types/google-ads";

const TABLE_HEAD_STICKY =
  "sticky top-0 z-10 bg-muted/90 text-foreground shadow-[0_1px_0_hsl(var(--border))] backdrop-blur-sm";

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

type SortKey = keyof AdGroupRow;
type SortDir = "asc" | "desc";

function compareValues(a: AdGroupRow[SortKey], b: AdGroupRow[SortKey]): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  return String(a).localeCompare(String(b));
}

function IsBar({
  is,
  lostBudget,
  lostRank,
}: {
  is: number | null;
  lostBudget: number | null;
  lostRank: number | null;
}) {
  if (is === null) {
    return <TableCell className="text-muted-foreground text-xs">N/A</TableCell>;
  }

  const won = is;
  const budget = lostBudget ?? 0;
  const rank = lostRank ?? 0;
  const wonPct = (won * 100).toFixed(0);
  const budgetPct = (budget * 100).toFixed(0);
  const rankPct = (rank * 100).toFixed(0);
  const tooltip = `Won: ${wonPct}% · Lost to budget: ${budgetPct}% · Lost to rank: ${rankPct}%`;

  const isColor =
    won >= 0.7
      ? "bg-green-500 dark:bg-green-600"
      : won >= 0.4
        ? "bg-amber-400 dark:bg-amber-500"
        : "bg-red-500 dark:bg-red-600";

  return (
    <TableCell title={tooltip}>
      <div className="flex min-w-[100px] flex-col gap-1">
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
          <div className={cn("h-full", isColor)} style={{ width: `${won * 100}%` }} />
          <div className="h-full bg-amber-300 dark:bg-amber-500/70" style={{ width: `${budget * 100}%` }} />
          <div className="h-full bg-destructive/70" style={{ width: `${rank * 100}%` }} />
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground tabular-nums">
          <span className="font-medium text-foreground">{wonPct}%</span>
          {budget > 0.01 && <span className="text-amber-600 dark:text-amber-400">{budgetPct}% bgt</span>}
          {rank > 0.01 && <span className="text-destructive">{rankPct}% rnk</span>}
        </div>
      </div>
    </TableCell>
  );
}

function PctCell({ value }: { value: number | null }) {
  if (value === null) return <TableCell className="text-right text-muted-foreground text-xs">—</TableCell>;
  return <TableCell className="text-right text-xs tabular-nums">{(value * 100).toFixed(0)}%</TableCell>;
}

function AdGroupsTable({ report }: { report: AdGroupReport }) {
  const [sortKey, setSortKey] = useState<SortKey>("spendRaw");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [campaignFilter, setCampaignFilter] = useState<string | null>(null);

  const campaigns = useMemo(() => {
    const set = new Set(report.rows.map((r) => r.campaign));
    return [...set].sort();
  }, [report.rows]);

  const sorted = useMemo(() => {
    const rows = campaignFilter ? report.rows.filter((r) => r.campaign === campaignFilter) : report.rows;
    return [...rows].sort((a, b) => {
      const cmp = compareValues(a[sortKey], b[sortKey]);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [report.rows, campaignFilter, sortKey, sortDir]);

  const toggle = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

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

      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">{sorted.length} ad groups</Badge>
        <Badge variant="outline">Spend: ₹{sorted.reduce((s, r) => s + r.spendRaw, 0).toFixed(2)}</Badge>
        <Badge variant="outline">Conv.: {sorted.reduce((s, r) => s + r.conversions, 0).toLocaleString()}</Badge>
      </div>

      <div className="max-h-[560px] overflow-auto rounded-lg border">
        <Table noScrollContainer>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead
                className={cn(TABLE_HEAD_STICKY, "cursor-pointer select-none")}
                onClick={() => toggle("campaign")}
              >
                Campaign {sortKey === "campaign" ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </TableHead>
              <TableHead
                className={cn(TABLE_HEAD_STICKY, "cursor-pointer select-none")}
                onClick={() => toggle("adGroup")}
              >
                Ad group {sortKey === "adGroup" ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </TableHead>
              <SortableTh label="Spend" col="spendRaw" sortKey={sortKey} sortDir={sortDir} onToggle={toggle} />
              <SortableTh label="Clicks" col="clicks" sortKey={sortKey} sortDir={sortDir} onToggle={toggle} />
              <SortableTh label="Conv." col="conversions" sortKey={sortKey} sortDir={sortDir} onToggle={toggle} />
              <SortableTh label="CPA" col="cpaRaw" sortKey={sortKey} sortDir={sortDir} onToggle={toggle} />
              <SortableTh label="CTR" col="ctr" sortKey={sortKey} sortDir={sortDir} onToggle={toggle} />
              <SortableTh
                label="Impr. Share"
                col="impressionShare"
                sortKey={sortKey}
                sortDir={sortDir}
                onToggle={toggle}
              />
              <SortableTh label="Top IS" col="topIs" sortKey={sortKey} sortDir={sortDir} onToggle={toggle} />
              <SortableTh
                label="Abs. Top IS"
                col="absoluteTopIs"
                sortKey={sortKey}
                sortDir={sortDir}
                onToggle={toggle}
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((row, i) => (
              <TableRow key={`${i}:${row.campaign}:${row.adGroup}`}>
                <TableCell className="max-w-[150px] truncate text-xs" title={row.campaign}>
                  {row.campaign}
                </TableCell>
                <TableCell className="max-w-[180px] truncate font-medium text-xs" title={row.adGroup}>
                  {row.adGroup}
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums">{row.spend}</TableCell>
                <TableCell className="text-right text-xs tabular-nums">{row.clicks.toLocaleString()}</TableCell>
                <TableCell className="text-right text-xs tabular-nums">{row.conversions.toLocaleString()}</TableCell>
                <TableCell className="text-right text-xs tabular-nums">{row.cpa}</TableCell>
                <TableCell className="text-right text-xs tabular-nums">{row.ctr}</TableCell>
                <IsBar is={row.impressionShare} lostBudget={row.lostIsBudget} lostRank={row.lostIsRank} />
                <PctCell value={row.topIs} />
                <PctCell value={row.absoluteTopIs} />
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function AdGroupsCardContent() {
  const scope = useScope();
  const [dateRange] = useDateRange();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<AdGroupReport | null>(null);

  const fetch = useCallback(
    async (dr: DateRange, opts: { forceRefresh?: boolean } = {}) => {
      setLoading(true);
      setError(null);
      try {
        const res = await getAdGroupReport({
          start: dr.start,
          end: dr.end,
          campaign: scope.campaign,
          forceRefresh: Boolean(opts.forceRefresh),
        });
        if (!res.ok) throw new Error(res.error);
        setReport(res.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    },
    [scope.campaign],
  );

  useEffect(() => {
    void fetch({ start: dateRange.start, end: dateRange.end });
  }, [fetch, dateRange.start, dateRange.end]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ad groups</CardTitle>
        <CardDescription>
          Per-ad-group performance with full Impression Share breakdown. IS bar: green = won · amber = lost to budget ·
          red = lost to rank. Top IS = % of auctions at top of page. Abs. Top IS = % at absolute top (position 1).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {report && !loading && (
            <span className="text-muted-foreground text-xs">
              {report.dateRange.start} → {report.dateRange.end}
            </span>
          )}

          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => void fetch({ start: dateRange.start, end: dateRange.end }, { forceRefresh: true })}
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

        {report && <AdGroupsTable report={report} />}
      </CardContent>
    </Card>
  );
}

export function AdGroupsCard() {
  return (
    <Suspense
      fallback={
        <Card>
          <CardHeader>
            <CardTitle>Ad groups</CardTitle>
            <CardDescription>Loading…</CardDescription>
          </CardHeader>
        </Card>
      }
    >
      <AdGroupsCardContent />
    </Suspense>
  );
}
