"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";

import { ChevronDown, ChevronUp, RefreshCw } from "lucide-react";

import { getQualityScore } from "@/app/actions/google-ads";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDateRange } from "@/hooks/use-date-range";
import { useScope } from "@/hooks/use-scope";
import { cn } from "@/lib/utils";
import type {
  DateRange,
  QualityScoreBottleneck,
  QualityScoreComponent,
  QualityScoreReport,
  QualityScoreRow,
} from "@/types/google-ads";

const TABLE_HEAD_STICKY =
  "sticky top-0 z-10 bg-muted/90 text-foreground shadow-[0_1px_0_hsl(var(--border))] backdrop-blur-sm";

type SortKey = keyof QualityScoreRow;
type SortDir = "asc" | "desc";

function componentClass(c: QualityScoreComponent): string {
  switch (c) {
    case "ABOVE_AVERAGE":
      return "text-green-600 dark:text-green-400";
    case "AVERAGE":
      return "text-amber-600 dark:text-amber-400";
    case "BELOW_AVERAGE":
      return "text-destructive";
    default:
      return "text-muted-foreground";
  }
}

function componentLabel(c: QualityScoreComponent): string {
  switch (c) {
    case "ABOVE_AVERAGE":
      return "Above avg";
    case "AVERAGE":
      return "Average";
    case "BELOW_AVERAGE":
      return "Below avg";
    default:
      return "—";
  }
}

function QsScore({ score }: { score: number | null }) {
  if (score === null) return <TableCell className="text-center text-muted-foreground text-xs">—</TableCell>;
  const color =
    score >= 8
      ? "text-green-600 dark:text-green-400"
      : score >= 6
        ? "text-amber-600 dark:text-amber-400"
        : "text-destructive";
  return (
    <TableCell className="text-center">
      <span className={cn("font-semibold text-sm tabular-nums", color)}>{score}</span>
      <span className="text-muted-foreground text-xs">/10</span>
    </TableCell>
  );
}

function ComponentCell({ value }: { value: QualityScoreComponent }) {
  return <TableCell className={cn("text-xs", componentClass(value))}>{componentLabel(value)}</TableCell>;
}

const BOTTLENECK_CONFIG: Record<QualityScoreBottleneck, { label: string; className: string; description: string }> = {
  bid: {
    label: "Bid low",
    className: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    description: "Max CPC bid < 90% of first-page estimate. Raise your bid to compete for page 1.",
  },
  qs: {
    label: "QS low",
    className: "bg-destructive/10 text-destructive",
    description: "Quality Score ≤ 5. Fix ad relevance or landing page before raising bids.",
  },
  both: {
    label: "Bid + QS",
    className: "bg-destructive/10 text-destructive",
    description: "Both bid and Quality Score are limiting rank. Fix QS first, then adjust bids.",
  },
  competitive: {
    label: "Competitive",
    className: "bg-green-500/10 text-green-700 dark:text-green-400",
    description: "Bid is competitive and QS is acceptable. Rank loss may be due to heavy competition.",
  },
  unknown: {
    label: "—",
    className: "text-muted-foreground",
    description: "Not enough data to classify.",
  },
};

function BottleneckCell({ value }: { value: QualityScoreBottleneck }) {
  const cfg = BOTTLENECK_CONFIG[value];
  return (
    <TableCell title={cfg.description}>
      <span className={cn("rounded px-1.5 py-0.5 font-medium text-[11px]", cfg.className)}>{cfg.label}</span>
    </TableCell>
  );
}

function CpcCell({ maxBid, avgCpc, firstPage }: { maxBid: number | null; avgCpc: number; firstPage: number | null }) {
  const bidLow = maxBid !== null && firstPage !== null && maxBid > 0 && maxBid < firstPage * 0.9;
  const smartBidding = maxBid === null;

  const title = smartBidding
    ? "Smart bidding — system controls bids. Max bid comparison not applicable."
    : firstPage
      ? `Max bid: ₹${maxBid?.toFixed(2)} · Page 1 needs: ₹${firstPage.toFixed(2)} · Avg CPC paid: ₹${avgCpc.toFixed(2)}`
      : `Max bid: ₹${maxBid?.toFixed(2)} · Avg CPC paid: ₹${avgCpc.toFixed(2)}`;

  return (
    <TableCell className="text-right text-xs tabular-nums" title={title}>
      {smartBidding ? (
        <span className="text-[10px] text-muted-foreground">Smart bidding</span>
      ) : (
        <>
          <span className={cn(bidLow ? "font-medium text-amber-600 dark:text-amber-400" : "")}>
            ₹{maxBid?.toFixed(2)}
          </span>
          {firstPage !== null && (
            <span className="ml-1 text-[10px] text-muted-foreground">/ ₹{firstPage.toFixed(2)}</span>
          )}
        </>
      )}
    </TableCell>
  );
}

const HELP_ITEMS = [
  {
    term: "Quality Score (1–10)",
    definition:
      "Google's composite rating of how relevant your keyword, ad, and landing page are to someone searching that term. Higher score = Google shows your ad more often and charges you less per click. It's calculated from the three components below. A score of 7+ is healthy; 5 or below is actively costing you.",
  },
  {
    term: "Expected CTR",
    definition:
      "Google's prediction of how likely your ad is to get clicked when shown for this keyword, compared to other ads at the same position. Below Average means your headline or description doesn't match what searchers expect. Fix: rewrite ad copy to directly address the keyword's intent, or tighten your match type so the keyword only triggers on relevant searches.",
  },
  {
    term: "Ad Relevance",
    definition:
      "How closely your ad copy matches the intent of the search query. Below Average typically means the keyword is too broad — it covers search intents your ad doesn't address. Fix: create a tighter ad group with more specific keywords, or write a dedicated ad for this keyword's intent.",
  },
  {
    term: "Landing Page Experience",
    definition:
      "How useful and relevant Google considers your landing page to be for people who click your ad. Below Average means the page content doesn't clearly match what the keyword implies — either the service isn't prominently described, the page loads slowly on mobile, or it's hard to take action. Fix: ensure the page prominently features the exact service the keyword describes and has a clear call to action.",
  },
  {
    term: "Bottleneck",
    definition:
      "Why your ads are losing Impression Share to rank. Bid low: avg CPC is less than 60% of what Google estimates is needed for page 1 — raising your max bid will directly help. QS low: Quality Score ≤ 5 — Google is penalising you in the auction; raising bids here is expensive because you're paying a QS tax on every click, so fix relevance first. Bid + QS: both are limiting you — fix QS first, then adjust bids. Competitive: bid and QS are both acceptable, rank loss is competition-driven.",
  },
  {
    term: "Max bid / Page 1 est.",
    definition:
      "Your max CPC bid (what you tell Google you're willing to pay) vs. Google's first-page CPC estimate (what you'd need to bid to reliably appear on page 1). These are correctly comparable — both are bid-level numbers. Shown in amber when your max bid is below 90% of the estimate, meaning you're not competitive for page 1 positions. Hover a cell to also see your avg CPC paid, which is always lower than max bid due to the second-price auction. For smart-bidding campaigns (Target CPA, Maximize Conversions) the system controls bids automatically, so max bid comparison is not applicable.",
  },
] as const;

function QualityScoreHelp() {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border bg-muted/30">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-left font-medium text-sm"
        onClick={() => setOpen((o) => !o)}
      >
        <span>What do these columns mean?</span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="border-t px-4 pt-3 pb-4">
          <dl className="space-y-4">
            {HELP_ITEMS.map(({ term, definition }) => (
              <div key={term}>
                <dt className="mb-0.5 font-semibold text-foreground text-xs">{term}</dt>
                <dd className="text-muted-foreground text-xs leading-relaxed">{definition}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}

function compareQsRows(a: QualityScoreRow, b: QualityScoreRow, key: SortKey): number {
  const av = a[key];
  const bv = b[key];
  if (av === null || av === undefined) return 1;
  if (bv === null || bv === undefined) return -1;
  if (typeof av === "number" && typeof bv === "number") return av - bv;
  return String(av).localeCompare(String(bv));
}

function QsTh({
  label,
  col,
  align = "left",
  title,
  sortKey,
  sortDir,
  onToggle,
}: {
  label: string;
  col: SortKey;
  align?: "left" | "center" | "right";
  title?: string;
  sortKey: SortKey;
  sortDir: SortDir;
  onToggle: (key: SortKey) => void;
}) {
  return (
    <TableHead
      className={cn(
        TABLE_HEAD_STICKY,
        "cursor-pointer select-none whitespace-nowrap",
        align === "right" && "text-right",
        align === "center" && "text-center",
      )}
      onClick={() => onToggle(col)}
      title={title}
    >
      {label} {sortKey === col ? (sortDir === "asc" ? "↑" : "↓") : ""}
    </TableHead>
  );
}

function QualityScoreTable({ report }: { report: QualityScoreReport }) {
  const [sortKey, setSortKey] = useState<SortKey>("spend");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [campaignFilter, setCampaignFilter] = useState("ALL");

  const campaigns = useMemo(() => {
    const set = new Set(report.rows.map((r) => r.campaign).filter(Boolean));
    return ["ALL", ...Array.from(set).sort()];
  }, [report.rows]);

  const sorted = useMemo(() => {
    const rows = campaignFilter !== "ALL" ? report.rows.filter((r) => r.campaign === campaignFilter) : report.rows;
    return [...rows].sort((a, b) => {
      const cmp = compareQsRows(a, b, sortKey);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [report.rows, campaignFilter, sortKey, sortDir]);

  const toggle = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "keyword" || key === "campaign" || key === "adGroup" ? "asc" : "desc");
    }
  };

  const noData = sorted.every((r) => r.qualityScore === null);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {campaigns.length > 2 && (
          <Select value={campaignFilter} onValueChange={setCampaignFilter}>
            <SelectTrigger className="h-8 w-56 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="ALL" className="text-xs">
                  All campaigns
                </SelectItem>
                {campaigns.slice(1).map((c) => (
                  <SelectItem key={c} value={c} className="text-xs">
                    {c}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        )}

        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{sorted.length} keywords</Badge>
          {noData && (
            <Badge variant="outline" className="text-amber-600 dark:text-amber-400">
              QS unavailable — keyword needs more impressions
            </Badge>
          )}
        </div>

        <div className="ml-auto flex items-center gap-3 text-muted-foreground text-xs">
          <span className="text-green-600 dark:text-green-400">● 8–10 Good</span>
          <span className="text-amber-600 dark:text-amber-400">● 6–7 OK</span>
          <span className="text-destructive">● 1–5 Poor</span>
        </div>
      </div>

      <div className="max-h-[600px] overflow-auto rounded-lg border">
        <Table noScrollContainer>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <QsTh label="Keyword" col="keyword" sortKey={sortKey} sortDir={sortDir} onToggle={toggle} />
              <QsTh label="Match" col="matchType" sortKey={sortKey} sortDir={sortDir} onToggle={toggle} />
              <QsTh label="Campaign" col="campaign" sortKey={sortKey} sortDir={sortDir} onToggle={toggle} />
              <QsTh
                label="QS"
                col="qualityScore"
                align="center"
                title="Quality Score (1–10). Google's rating of your ad relevance. Drives your auction rank and CPC."
                sortKey={sortKey}
                sortDir={sortDir}
                onToggle={toggle}
              />
              <QsTh
                label="Exp. CTR"
                col="expectedCtr"
                title="Expected click-through rate — how likely your ad is to get clicked when shown."
                sortKey={sortKey}
                sortDir={sortDir}
                onToggle={toggle}
              />
              <QsTh
                label="Ad relevance"
                col="adRelevance"
                title="How closely your ad copy matches the intent of the search query."
                sortKey={sortKey}
                sortDir={sortDir}
                onToggle={toggle}
              />
              <QsTh
                label="Landing page"
                col="landingPageExperience"
                title="How relevant and useful your landing page is to people who clicked your ad."
                sortKey={sortKey}
                sortDir={sortDir}
                onToggle={toggle}
              />
              <QsTh
                label="Bottleneck"
                col="bottleneck"
                title="Why rank IS is being lost: bid too low, QS too low, or both. Hover for details."
                sortKey={sortKey}
                sortDir={sortDir}
                onToggle={toggle}
              />
              <QsTh
                label="Max bid / Page 1 est."
                col="maxCpcBid"
                align="right"
                title="Your max CPC bid vs. Google's first-page CPC estimate. Amber = your bid is less than 90% of what's needed for page 1. Hover a cell for your avg CPC paid."
                sortKey={sortKey}
                sortDir={sortDir}
                onToggle={toggle}
              />
              <QsTh label="Spend" col="spend" align="right" sortKey={sortKey} sortDir={sortDir} onToggle={toggle} />
              <QsTh label="Clicks" col="clicks" align="right" sortKey={sortKey} sortDir={sortDir} onToggle={toggle} />
              <QsTh
                label="Conv."
                col="conversions"
                align="right"
                sortKey={sortKey}
                sortDir={sortDir}
                onToggle={toggle}
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((row) => (
              <TableRow key={`${row.campaign}:${row.adGroup}:${row.keyword}:${row.matchType}`}>
                <TableCell className="max-w-[200px] font-medium text-xs" title={row.keyword}>
                  {row.keyword}
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">{row.matchType}</TableCell>
                <TableCell className="max-w-[160px] truncate text-muted-foreground text-xs" title={row.campaign}>
                  {row.campaign}
                </TableCell>
                <QsScore score={row.qualityScore} />
                <ComponentCell value={row.expectedCtr} />
                <ComponentCell value={row.adRelevance} />
                <ComponentCell value={row.landingPageExperience} />
                <BottleneckCell value={row.bottleneck} />
                <CpcCell maxBid={row.maxCpcBid} avgCpc={row.avgCpc} firstPage={row.firstPageCpc} />
                <TableCell className="text-right text-xs tabular-nums">₹{row.spend.toFixed(2)}</TableCell>
                <TableCell className="text-right text-xs tabular-nums">{row.clicks.toLocaleString()}</TableCell>
                <TableCell className="text-right text-xs tabular-nums">{row.conversions.toLocaleString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function QualityScoreCardContent() {
  const scope = useScope();
  const [dateRange] = useDateRange();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<QualityScoreReport | null>(null);

  const fetch = useCallback(
    async (dr: DateRange, opts: { forceRefresh?: boolean } = {}) => {
      setLoading(true);
      setError(null);
      try {
        const res = await getQualityScore({
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
        <CardTitle>Quality Score</CardTitle>
        <CardDescription>
          Per-keyword Quality Score (1–10) and its three components. Low scores increase your CPCs and reduce Impression
          Share — fix these before raising bids.
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

        <QualityScoreHelp />

        {report && <QualityScoreTable report={report} />}
      </CardContent>
    </Card>
  );
}

export function QualityScoreCard() {
  return (
    <Suspense
      fallback={
        <Card>
          <CardHeader>
            <CardTitle>Quality Score</CardTitle>
            <CardDescription>Loading…</CardDescription>
          </CardHeader>
        </Card>
      }
    >
      <QualityScoreCardContent />
    </Suspense>
  );
}
