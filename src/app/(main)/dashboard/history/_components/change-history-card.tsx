"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";

import { RefreshCw } from "lucide-react";

import { getChangeHistory } from "@/app/actions/google-ads";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { ChangeEvent, ChangeHistoryReport } from "@/types/google-ads";

const DAYS_OPTIONS = [
  { value: "7", label: "Last 7 days" },
  { value: "14", label: "Last 14 days" },
  { value: "30", label: "Last 30 days" },
] as const;

const RESOURCE_TYPE_OPTIONS = [
  { value: "ALL", label: "All types" },
  { value: "CAMPAIGN", label: "Campaign" },
  { value: "CAMPAIGN_BUDGET", label: "Budget" },
  { value: "AD_GROUP", label: "Ad group" },
  { value: "AD_GROUP_CRITERION", label: "Keyword" },
  { value: "AD_GROUP_AD", label: "Ad" },
];

const OPERATION_OPTIONS = [
  { value: "ALL", label: "All operations" },
  { value: "CREATE", label: "Created" },
  { value: "UPDATE", label: "Updated" },
  { value: "REMOVE", label: "Removed" },
];

const OPERATION_VARIANTS: Record<ChangeEvent["operation"], string> = {
  CREATE: "bg-green-500/10 text-green-700 dark:text-green-400",
  UPDATE: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  REMOVE: "bg-destructive/10 text-destructive",
  UNKNOWN: "bg-muted text-muted-foreground",
};

function formatDateTime(iso: string): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function OperationBadge({ op }: { op: ChangeEvent["operation"] }) {
  return (
    <Badge className={cn("font-mono text-[11px]", OPERATION_VARIANTS[op])} variant="outline">
      {op}
    </Badge>
  );
}

function ChangeHistoryTable({ report }: { report: ChangeHistoryReport }) {
  const [resourceFilter, setResourceFilter] = useState("ALL");
  const [operationFilter, setOperationFilter] = useState("ALL");
  const [campaignFilter, setCampaignFilter] = useState("ALL");

  const campaigns = useMemo(() => {
    const set = new Set(report.events.map((e) => e.campaignName).filter(Boolean));
    return ["ALL", ...Array.from(set).sort()];
  }, [report.events]);

  const filtered = useMemo(
    () =>
      report.events.filter((e) => {
        if (resourceFilter !== "ALL" && e.resourceType !== resourceFilter && e.resourceTypeLabel !== resourceFilter) {
          return false;
        }
        if (operationFilter !== "ALL" && e.operation !== operationFilter) return false;
        if (campaignFilter !== "ALL" && e.campaignName !== campaignFilter) return false;
        return true;
      }),
    [report.events, resourceFilter, operationFilter, campaignFilter],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={resourceFilter} onValueChange={setResourceFilter}>
          <SelectTrigger className="h-8 w-40 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {RESOURCE_TYPE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value} className="text-xs">
                  {o.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>

        <Select value={operationFilter} onValueChange={setOperationFilter}>
          <SelectTrigger className="h-8 w-36 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {OPERATION_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value} className="text-xs">
                  {o.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>

        {campaigns.length > 2 && (
          <Select value={campaignFilter} onValueChange={setCampaignFilter}>
            <SelectTrigger className="h-8 w-48 text-xs">
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

        <span className="ml-auto text-muted-foreground text-xs">{filtered.length} events</span>
      </div>

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground text-sm">No changes match the current filters.</p>
      ) : (
        <div className="max-h-[600px] overflow-auto rounded-lg border">
          <Table noScrollContainer>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="sticky top-0 z-10 w-36 bg-muted/90 text-foreground shadow-[0_1px_0_hsl(var(--border))] backdrop-blur-sm">
                  When
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-muted/90 text-foreground shadow-[0_1px_0_hsl(var(--border))] backdrop-blur-sm">
                  Op
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-muted/90 text-foreground shadow-[0_1px_0_hsl(var(--border))] backdrop-blur-sm">
                  Type
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-muted/90 text-foreground shadow-[0_1px_0_hsl(var(--border))] backdrop-blur-sm">
                  Campaign
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-muted/90 text-foreground shadow-[0_1px_0_hsl(var(--border))] backdrop-blur-sm">
                  Ad group
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-muted/90 text-foreground shadow-[0_1px_0_hsl(var(--border))] backdrop-blur-sm">
                  What changed
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-muted/90 text-foreground shadow-[0_1px_0_hsl(var(--border))] backdrop-blur-sm">
                  Via
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-muted/90 text-foreground shadow-[0_1px_0_hsl(var(--border))] backdrop-blur-sm">
                  By
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((event, i) => (
                <TableRow key={`${i}:${event.changeDateTime}:${event.resourceType}`}>
                  <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                    {formatDateTime(event.changeDateTime)}
                  </TableCell>
                  <TableCell>
                    <OperationBadge op={event.operation} />
                  </TableCell>
                  <TableCell className="text-xs">{event.resourceTypeLabel}</TableCell>
                  <TableCell className="max-w-[160px] truncate text-xs" title={event.campaignName || undefined}>
                    {event.campaignName || "—"}
                  </TableCell>
                  <TableCell
                    className="max-w-[140px] truncate text-xs text-muted-foreground"
                    title={event.adGroupName || undefined}
                  >
                    {event.adGroupName || "—"}
                  </TableCell>
                  <TableCell className="max-w-[260px] text-xs" title={event.summary}>
                    <span className="line-clamp-2">{event.summary}</span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {event.clientTypeLabel || "—"}
                  </TableCell>
                  <TableCell
                    className="max-w-[140px] truncate text-xs text-muted-foreground"
                    title={event.userEmail || undefined}
                  >
                    {event.userEmail || "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function ChangeHistoryCardContent() {
  const [days, setDays] = useState("30");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ChangeHistoryReport | null>(null);

  const fetch = useCallback(async (d: string, opts: { forceRefresh?: boolean } = {}) => {
    setLoading(true);
    setError(null);
    try {
      const res = await getChangeHistory({ days: Number(d), forceRefresh: Boolean(opts.forceRefresh) });
      if (!res.ok) throw new Error(res.error);
      setReport(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetch(days);
  }, [fetch, days]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change history</CardTitle>
        <CardDescription>
          Every campaign, budget, keyword, and ad change made in Google Ads. Retained for up to 30 days.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {DAYS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          {report && !loading && (
            <span className="text-muted-foreground text-xs">
              {report.dateRange.start} → {report.dateRange.end} · {report.events.length} total events
            </span>
          )}

          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => void fetch(days, { forceRefresh: true })}
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

        {report && <ChangeHistoryTable report={report} />}
      </CardContent>
    </Card>
  );
}

export function ChangeHistoryCard() {
  return (
    <Suspense
      fallback={
        <Card>
          <CardHeader>
            <CardTitle>Change history</CardTitle>
            <CardDescription>Loading…</CardDescription>
          </CardHeader>
        </Card>
      }
    >
      <ChangeHistoryCardContent />
    </Suspense>
  );
}
