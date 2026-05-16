"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";

import { RefreshCw } from "lucide-react";

import { getAdGroupReport } from "@/app/actions/google-ads";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { AdGroupReport, AdGroupRow, CampaignRangeKey } from "@/types/google-ads";

const RANGE_OPTIONS: ReadonlyArray<{ value: CampaignRangeKey; label: string }> = [
  { value: "last-7-days", label: "Last 7 days" },
  { value: "last-4-weeks", label: "Last 4 weeks" },
  { value: "last-3-months", label: "Last 3 months" },
  { value: "year-to-date", label: "Year to date" },
];

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
      className={cn(TABLE_HEAD_STICKY, "cursor-pointer select-none text-right whitespace-nowrap", className)}
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

function IsCell({ value }: { value: number | null }) {
  if (value === null) return <TableCell className="text-right text-muted-foreground text-xs">N/A</TableCell>;
  const pct = value * 100;
  const color =
    pct >= 70
      ? "text-green-600 dark:text-green-400"
      : pct >= 40
        ? "text-amber-600 dark:text-amber-400"
        : "text-destructive";
  return <TableCell className={cn("text-right tabular-nums text-xs", color)}>{pct.toFixed(0)}%</TableCell>;
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
                <TableCell className="text-right tabular-nums text-xs">{row.spend}</TableCell>
                <TableCell className="text-right tabular-nums text-xs">{row.clicks.toLocaleString()}</TableCell>
                <TableCell className="text-right tabular-nums text-xs">{row.conversions.toLocaleString()}</TableCell>
                <TableCell className="text-right tabular-nums text-xs">{row.cpa}</TableCell>
                <TableCell className="text-right tabular-nums text-xs">{row.ctr}</TableCell>
                <IsCell value={row.impressionShare} />
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function AdGroupsCardContent() {
  const [range, setRange] = useState<CampaignRangeKey>("last-4-weeks");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<AdGroupReport | null>(null);

  const fetch = useCallback(async (r: CampaignRangeKey, opts: { forceRefresh?: boolean } = {}) => {
    setLoading(true);
    setError(null);
    try {
      const res = await getAdGroupReport({ range: r, forceRefresh: Boolean(opts.forceRefresh) });
      if (!res.ok) throw new Error(res.error);
      setReport(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetch(range);
  }, [fetch, range]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ad groups</CardTitle>
        <CardDescription>
          Per-ad-group performance with Impression Share (search campaigns only). IS colored: green ≥ 70% · amber 40–70%
          · red &lt; 40%.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={range} onValueChange={(v) => setRange(v as CampaignRangeKey)}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {RANGE_OPTIONS.map((o) => (
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
            onClick={() => void fetch(range, { forceRefresh: true })}
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
