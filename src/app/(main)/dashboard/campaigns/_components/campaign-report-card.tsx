"use client";

import { Suspense, useCallback, useEffect, useState } from "react";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { RefreshCw } from "lucide-react";

import { getCampaignReport } from "@/app/actions/google-ads";
import { DateRangePicker } from "@/components/date-range-picker";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useScope } from "@/hooks/use-scope";
import { last30Days } from "@/lib/date-presets";
import { cn } from "@/lib/utils";
import type { CampaignGranularity, CampaignReport, CampaignSummaryRow, DateRange } from "@/types/google-ads";

import { CampaignDailyReportSection } from "./campaign-daily-report";
import { CampaignKpiStrip } from "./campaign-kpi-strip";

function formatBudgetAmount(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return v.toFixed(0);
}

/**
 * IS stacked bar: green = impressions won, amber = lost to budget, red = lost to rank.
 * Shows at a glance where you're losing and why.
 */
function IsBar({
  is,
  lostBudget,
  lostRank,
}: {
  is: number | null;
  lostBudget: number | null;
  lostRank: number | null;
}) {
  const won = is ?? 0;
  const budget = lostBudget ?? 0;
  const rank = lostRank ?? 0;

  const wonPct = (won * 100).toFixed(0);
  const budgetPct = (budget * 100).toFixed(0);
  const rankPct = (rank * 100).toFixed(0);

  const tooltip =
    is === null
      ? "No Impression Share data (non-search campaign)"
      : `Won: ${wonPct}% · Lost to budget: ${budgetPct}% · Lost to rank (QS/bid): ${rankPct}%`;

  if (is === null) {
    return (
      <TableCell className="text-muted-foreground text-xs" colSpan={1}>
        N/A
      </TableCell>
    );
  }

  const isColor =
    won >= 0.7
      ? "bg-green-500 dark:bg-green-600"
      : won >= 0.4
        ? "bg-amber-400 dark:bg-amber-500"
        : "bg-red-500 dark:bg-red-600";

  return (
    <TableCell title={tooltip}>
      <div className="flex min-w-[120px] flex-col gap-1">
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
          <div className={cn("h-full", isColor)} style={{ width: `${won * 100}%` }} />
          <div className="h-full bg-amber-300 dark:bg-amber-500/70" style={{ width: `${budget * 100}%` }} />
          <div className="h-full bg-destructive/70" style={{ width: `${rank * 100}%` }} />
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground tabular-nums">
          <span className="font-medium text-foreground">{wonPct}% won</span>
          {budget > 0.01 && <span className="text-amber-600 dark:text-amber-400">{budgetPct}% budget</span>}
          {rank > 0.01 && <span className="text-destructive">{rankPct}% rank</span>}
        </div>
      </div>
    </TableCell>
  );
}

function BudgetBar({
  dailyBudget,
  periodBudget,
  spendRaw,
}: {
  dailyBudget: number;
  periodBudget: number;
  spendRaw: number;
}) {
  if (dailyBudget === 0) {
    return <TableCell className="text-muted-foreground text-xs">—</TableCell>;
  }

  const utilization = periodBudget > 0 ? spendRaw / periodBudget : 0;
  const clampedUtil = Math.min(utilization, 1);
  const days = Math.round(periodBudget / dailyBudget);
  const tooltip = `₹${spendRaw.toFixed(2)} spent of ₹${periodBudget.toFixed(2)} period budget (₹${dailyBudget.toFixed(2)}/day × ${days} days)`;

  const barColor =
    utilization < 0.7
      ? "bg-green-500 dark:bg-green-600"
      : utilization < 1.0
        ? "bg-amber-400 dark:bg-amber-500"
        : "bg-destructive";

  return (
    <TableCell title={tooltip}>
      <div className="flex min-w-[140px] flex-col gap-1">
        <div className="text-xs tabular-nums">{`₹${formatBudgetAmount(dailyBudget)}/day`}</div>
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
          <div className={cn("h-full", barColor)} style={{ width: `${clampedUtil * 100}%` }} />
        </div>
        <div className="text-[10px] text-muted-foreground tabular-nums">{`${(utilization * 100).toFixed(0)}% of period budget`}</div>
      </div>
    </TableCell>
  );
}

type CampaignSortKey = keyof CampaignSummaryRow;
type CampaignSortDir = "asc" | "desc";

function CampaignSortableTh({
  label,
  col,
  sortKey,
  sortDir,
  onToggle,
}: {
  label: string;
  col: CampaignSortKey;
  sortKey: CampaignSortKey;
  sortDir: CampaignSortDir;
  onToggle: (col: CampaignSortKey) => void;
}) {
  return (
    <TableHead className="cursor-pointer select-none whitespace-nowrap text-right" onClick={() => onToggle(col)}>
      {label} {sortKey === col ? (sortDir === "asc" ? "↑" : "↓") : ""}
    </TableHead>
  );
}

function CampaignsSummaryTable({ campaigns }: { campaigns: CampaignSummaryRow[] }) {
  const [sortKey, setSortKey] = useState<CampaignSortKey>("spendRaw");
  const [sortDir, setSortDir] = useState<CampaignSortDir>("desc");

  const sorted = [...campaigns].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    const cmp =
      typeof av === "number" && typeof bv === "number" ? av - bv : String(av ?? "").localeCompare(String(bv ?? ""));
    return sortDir === "asc" ? cmp : -cmp;
  });

  const toggle = (key: keyof CampaignSummaryRow) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  return (
    <div className="overflow-auto rounded-lg border">
      <Table noScrollContainer>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="cursor-pointer select-none" onClick={() => toggle("campaign")}>
              Campaign {sortKey === "campaign" ? (sortDir === "asc" ? "↑" : "↓") : ""}
            </TableHead>
            <CampaignSortableTh label="Spend" col="spendRaw" sortKey={sortKey} sortDir={sortDir} onToggle={toggle} />
            <CampaignSortableTh label="Clicks" col="clicks" sortKey={sortKey} sortDir={sortDir} onToggle={toggle} />
            <CampaignSortableTh label="Conv." col="conversions" sortKey={sortKey} sortDir={sortDir} onToggle={toggle} />
            <CampaignSortableTh label="CPA" col="cpaRaw" sortKey={sortKey} sortDir={sortDir} onToggle={toggle} />
            <TableHead
              className="cursor-pointer select-none whitespace-nowrap"
              onClick={() => toggle("impressionShare")}
              title="Impression Share: how often your ad showed vs. how often it was eligible. Bar shows: green = won, amber = lost to budget, red = lost to Quality Score / bid rank."
            >
              Impression Share{sortKey === "impressionShare" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
            </TableHead>
            <TableHead className="whitespace-nowrap">Budget</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((row) => (
            <TableRow key={row.campaign}>
              <TableCell className="max-w-[200px] truncate font-medium" title={row.campaign}>
                {row.campaign}
              </TableCell>
              <TableCell className="text-right tabular-nums">{row.spend}</TableCell>
              <TableCell className="text-right tabular-nums">{row.clicks.toLocaleString()}</TableCell>
              <TableCell className="text-right tabular-nums">{row.conversions.toLocaleString()}</TableCell>
              <TableCell className="text-right tabular-nums">{row.cpa}</TableCell>
              <IsBar is={row.impressionShare} lostBudget={row.lostIsBudget} lostRank={row.lostIsRank} />
              <BudgetBar dailyBudget={row.dailyBudget} periodBudget={row.periodBudget} spendRaw={row.spendRaw} />
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

const GRANULARITY_OPTIONS: ReadonlyArray<{ value: CampaignGranularity; label: string }> = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

type OauthNotice = { variant: "default" | "destructive"; title: string; description: string } | null;

function CampaignReportCardContent() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const scope = useScope();

  const [dateRange, setDateRange] = useState<DateRange>(() => last30Days());
  const [granularity, setGranularity] = useState<CampaignGranularity>("day");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<CampaignReport | null>(null);
  const [oauthNotice, setOauthNotice] = useState<OauthNotice>(null);

  const fetchReport = useCallback(
    async (
      selectedDateRange: DateRange,
      selectedGranularity: CampaignGranularity,
      options: { forceRefresh?: boolean } = {},
    ) => {
      setLoading(true);
      setError(null);
      try {
        const result = await getCampaignReport({
          start: selectedDateRange.start,
          end: selectedDateRange.end,
          granularity: selectedGranularity,
          campaign: scope.campaign,
          forceRefresh: Boolean(options.forceRefresh),
        });
        if (!result.ok) throw new Error(result.error);
        setReport(result.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    },
    [scope.campaign],
  );

  useEffect(() => {
    void fetchReport({ start: dateRange.start, end: dateRange.end }, granularity);
  }, [fetchReport, dateRange.start, dateRange.end, granularity]);

  useEffect(() => {
    const status = searchParams.get("google_ads_oauth");
    if (!status) return;

    const reason = searchParams.get("google_ads_oauth_reason");

    const describeReason = () => (reason ? (reason.length > 220 ? `${reason.slice(0, 220)}…` : reason) : "");

    switch (status) {
      case "success":
        setOauthNotice({
          variant: "default",
          title: "Google Ads connected",
          description: "Your refresh token was saved. The report below will load with your authorized account.",
        });
        void fetchReport({ start: dateRange.start, end: dateRange.end }, granularity);
        break;
      case "denied":
        setOauthNotice({
          variant: "destructive",
          title: "Google sign-in was cancelled",
          description: describeReason() || "Authorization did not complete.",
        });
        break;
      case "invalid":
        setOauthNotice({
          variant: "destructive",
          title: "OAuth session expired",
          description: "Try connecting again from this page.",
        });
        break;
      case "no_refresh":
        setOauthNotice({
          variant: "destructive",
          title: "No refresh token from Google",
          description:
            "In Google Account → Security, remove this app’s access, then connect again. Or use a test user on the OAuth consent screen while the app is in testing.",
        });
        break;
      case "error":
        setOauthNotice({
          variant: "destructive",
          title: "Could not finish Google Ads sign-in",
          description: describeReason() || "Token exchange failed.",
        });
        break;
      default:
        setOauthNotice(null);
    }

    router.replace(pathname, { scroll: false });
  }, [searchParams, pathname, router, dateRange, granularity, fetchReport]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Campaign report</CardTitle>
        <CardDescription>Active campaign performance over the selected window.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="flex items-center gap-2">
            <DateRangePicker value={dateRange} onChange={setDateRange} />

            <Select value={granularity} onValueChange={(v) => setGranularity(v as CampaignGranularity)}>
              <SelectTrigger className="w-28" aria-label="Granularity">
                <SelectValue placeholder="Granularity" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {GRANULARITY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>

            <Button variant="secondary" asChild className="whitespace-nowrap">
              <Link href="/api/google-ads/oauth/authorize">Connect Google Ads</Link>
            </Button>
          </div>

          {report && !loading && (
            <p className="text-muted-foreground text-sm sm:ml-2">
              {report.date_range.start} → {report.date_range.end} · {report.campaigns.length} campaigns
            </p>
          )}

          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() =>
              void fetchReport({ start: dateRange.start, end: dateRange.end }, granularity, { forceRefresh: true })
            }
            disabled={loading}
            className="sm:ml-auto"
            aria-label="Refresh report"
          >
            {loading ? <Spinner /> : <RefreshCw />}
          </Button>
        </div>

        {oauthNotice && (
          <Alert variant={oauthNotice.variant === "destructive" ? "destructive" : "default"}>
            <AlertTitle>{oauthNotice.title}</AlertTitle>
            <AlertDescription>{oauthNotice.description}</AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <CampaignKpiStrip
          totals={report?.totals_raw ?? null}
          previousTotals={report?.previous_totals_raw ?? null}
          rangeLabel={`${dateRange.start} – ${dateRange.end}`}
          loading={loading && !report}
        />

        {report?.campaigns && report.campaigns.length > 0 && (
          <div>
            <p className="mb-2 text-muted-foreground text-xs">
              <strong>Impression Share</strong> = how often your ad showed vs. how often it was eligible to show. Bar:{" "}
              <span className="text-green-600 dark:text-green-400">green = won</span> ·{" "}
              <span className="text-amber-600 dark:text-amber-400">amber = lost because daily budget ran out</span> ·{" "}
              <span className="text-destructive">red = lost because Quality Score or bid was too low</span>. Hover any
              bar for exact numbers.
            </p>
            <CampaignsSummaryTable campaigns={report.campaigns} />
          </div>
        )}

        {report?.daily && (
          <CampaignDailyReportSection
            daily={report.daily}
            demographics={report.demographics}
            granularity={granularity}
          />
        )}
      </CardContent>
    </Card>
  );
}

export function CampaignReportCard() {
  return (
    <Suspense
      fallback={
        <Card>
          <CardHeader>
            <CardTitle>Campaign report</CardTitle>
            <CardDescription>Loading…</CardDescription>
          </CardHeader>
        </Card>
      }
    >
      <CampaignReportCardContent />
    </Suspense>
  );
}
