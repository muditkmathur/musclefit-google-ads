"use client";

import { Suspense, useCallback, useEffect, useState } from "react";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { RefreshCw } from "lucide-react";

import { getCampaignReport } from "@/app/actions/google-ads";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import type { CampaignGranularity, CampaignRangeKey, CampaignReport } from "@/types/google-ads";

import { CampaignDailyReportSection } from "./campaign-daily-report";
import { CampaignKpiStrip } from "./campaign-kpi-strip";

const RANGE_OPTIONS: ReadonlyArray<{ value: CampaignRangeKey; label: string }> = [
  { value: "last-7-days", label: "Last 7 days" },
  { value: "last-4-weeks", label: "Last 4 weeks" },
  { value: "last-3-months", label: "Last 3 months" },
  { value: "year-to-date", label: "Year to date" },
];

const GRANULARITY_OPTIONS: ReadonlyArray<{ value: CampaignGranularity; label: string }> = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

function rangeLabel(range: CampaignRangeKey): string {
  return RANGE_OPTIONS.find((o) => o.value === range)?.label ?? "Selected period";
}

type OauthNotice = { variant: "default" | "destructive"; title: string; description: string } | null;

function CampaignReportCardContent() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const [range, setRange] = useState<CampaignRangeKey>("last-4-weeks");
  const [granularity, setGranularity] = useState<CampaignGranularity>("day");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<CampaignReport | null>(null);
  const [oauthNotice, setOauthNotice] = useState<OauthNotice>(null);

  const fetchReport = useCallback(async (selectedRange: CampaignRangeKey, selectedGranularity: CampaignGranularity) => {
    setLoading(true);
    setError(null);
    try {
      const result = await getCampaignReport({
        range: selectedRange,
        granularity: selectedGranularity,
      });
      if (!result.ok) throw new Error(result.error);
      setReport(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchReport(range, granularity);
  }, [fetchReport, range, granularity]);

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
        void fetchReport(range, granularity);
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
  }, [searchParams, pathname, router, range, granularity, fetchReport]);

  const currentLabel = rangeLabel(range);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Campaign report</CardTitle>
        <CardDescription>Active campaign performance over the selected window.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="flex items-center gap-2">
            <Select value={range} onValueChange={(v) => setRange(v as CampaignRangeKey)}>
              <SelectTrigger className="w-36" aria-label="Date range">
                <SelectValue placeholder="Range" />
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
            onClick={() => void fetchReport(range, granularity)}
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
          rangeLabel={currentLabel}
          loading={loading && !report}
        />

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
