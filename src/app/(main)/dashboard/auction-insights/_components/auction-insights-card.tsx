"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";

import { RefreshCw } from "lucide-react";

import { getAuctionInsights } from "@/app/actions/google-ads";
import { DateRangePicker } from "@/components/date-range-picker";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { last30Days } from "@/lib/date-presets";
import { cn } from "@/lib/utils";
import type { AuctionInsightCompetitorRow, AuctionInsightReport, DateRange } from "@/types/google-ads";

const TABLE_HEAD_STICKY =
  "sticky top-0 z-10 bg-muted/90 text-foreground shadow-[0_1px_0_hsl(var(--border))] backdrop-blur-sm";

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function competitorsByCampaign(rows: AuctionInsightCompetitorRow[]): Map<string, AuctionInsightCompetitorRow[]> {
  const map = new Map<string, AuctionInsightCompetitorRow[]>();
  for (const r of rows) {
    const list = map.get(r.campaign) ?? [];
    list.push(r);
    map.set(r.campaign, list);
  }
  for (const [, list] of map) list.sort((a, b) => b.overlapRate - a.overlapRate);
  return map;
}

function CampaignSection({ campaign, rows }: { campaign: string; rows: AuctionInsightCompetitorRow[] }) {
  const totalImpressions = rows.reduce((s, r) => s + r.impressions, 0);
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="truncate font-medium text-sm" title={campaign}>
          {campaign}
        </h3>
        <Badge variant="outline" className="text-xs">
          {rows.length} competitors
        </Badge>
        <Badge variant="outline" className="text-xs">
          {totalImpressions.toLocaleString()} impressions
        </Badge>
      </div>

      <div className="overflow-auto rounded-md border">
        <Table noScrollContainer>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className={TABLE_HEAD_STICKY}>Domain</TableHead>
              <TableHead className={cn(TABLE_HEAD_STICKY, "text-right")}>Impr. share</TableHead>
              <TableHead className={cn(TABLE_HEAD_STICKY, "text-right")}>Overlap</TableHead>
              <TableHead className={cn(TABLE_HEAD_STICKY, "text-right")}>Position above</TableHead>
              <TableHead className={cn(TABLE_HEAD_STICKY, "text-right")}>Outranking</TableHead>
              <TableHead className={cn(TABLE_HEAD_STICKY, "text-right")}>Keywords</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={`${r.campaign}:${r.domain}`}>
                <TableCell className="max-w-[260px] truncate font-medium text-xs" title={r.domain}>
                  {r.domain}
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums">{pct(r.impressionShare)}</TableCell>
                <TableCell className="text-right text-xs tabular-nums">{pct(r.overlapRate)}</TableCell>
                <TableCell className="text-right text-xs tabular-nums">{pct(r.positionAboveRate)}</TableCell>
                <TableCell className="text-right text-xs tabular-nums">{pct(r.outrankingShare)}</TableCell>
                <TableCell className="text-right text-xs tabular-nums">{r.keywordCount}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function AuctionInsightsCardContent() {
  const [dateRange, setDateRange] = useState<DateRange>(() => last30Days());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<AuctionInsightReport | null>(null);

  const fetch = useCallback(async (dr: DateRange, opts: { forceRefresh?: boolean } = {}) => {
    setLoading(true);
    setError(null);
    try {
      const res = await getAuctionInsights({ start: dr.start, end: dr.end, forceRefresh: Boolean(opts.forceRefresh) });
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

  const byCampaign = useMemo(() => (report ? competitorsByCampaign(report.competitors) : new Map()), [report]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Competitor overlap</CardTitle>
        <CardDescription>
          Overlap rate = share of auctions where you and the competitor both showed. Position above rate = share of
          shared auctions where the competitor outranked you. Outranking share = share where you outranked them.
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

        {report?.warning && (
          <Alert>
            <AlertTitle>Auction insights unavailable via API</AlertTitle>
            <AlertDescription>{report.warning}</AlertDescription>
          </Alert>
        )}

        {report && !report.warning && report.competitors.length === 0 && (
          <div className="rounded-md border border-dashed p-6 text-center text-muted-foreground text-sm">
            No auction insight data for this range. Auction insights are sparse on low-volume Search keywords.
          </div>
        )}

        {report && report.competitors.length > 0 && (
          <div className="space-y-3">
            {[...byCampaign.entries()].map(([campaign, rows]) => (
              <CampaignSection key={campaign} campaign={campaign} rows={rows} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function AuctionInsightsCard() {
  return (
    <Suspense
      fallback={
        <Card>
          <CardHeader>
            <CardTitle>Competitor overlap</CardTitle>
            <CardDescription>Loading…</CardDescription>
          </CardHeader>
        </Card>
      }
    >
      <AuctionInsightsCardContent />
    </Suspense>
  );
}
