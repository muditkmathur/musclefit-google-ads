"use client";

import { useState } from "react";

import { getCampaignReport } from "@/app/actions/google-ads";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { CampaignReport } from "@/types/google-ads";

import { CampaignDailyReportSection } from "./campaign-daily-report";

export function CampaignReportCard() {
  const [days, setDays] = useState<number>(30);
  const [includeDaily, setIncludeDaily] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<CampaignReport | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const result = await getCampaignReport({ days, includeDaily });
      if (!result.ok) throw new Error(result.error);
      setReport(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Campaign report</CardTitle>
        <CardDescription>Active campaign performance over the selected window.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="space-y-1.5 sm:w-32">
            <Label htmlFor="cr-days">Days</Label>
            <Input
              id="cr-days"
              type="number"
              min={1}
              max={365}
              value={days}
              onChange={(e) => setDays(Number(e.target.value) || 30)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch id="cr-daily" checked={includeDaily} onCheckedChange={setIncludeDaily} />
            <Label htmlFor="cr-daily" className="font-normal text-sm">
              Include daily DoD
            </Label>
          </div>
          <Button type="button" onClick={run} disabled={loading} className="sm:ml-auto">
            {loading ? (
              <>
                <Spinner className="mr-2" />
                Running…
              </>
            ) : (
              "Run report"
            )}
          </Button>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {report && (
          <div>
            <p className="mb-2 text-muted-foreground text-sm">
              {report.period} ({report.date_range.start} → {report.date_range.end}) · {report.campaigns.length}{" "}
              campaigns
            </p>
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campaign</TableHead>
                    <TableHead className="text-right">Impr.</TableHead>
                    <TableHead className="text-right">Clicks</TableHead>
                    <TableHead className="text-right">CTR</TableHead>
                    <TableHead className="text-right">Avg. CPC</TableHead>
                    <TableHead className="text-right">Spend</TableHead>
                    <TableHead className="text-right">Conv.</TableHead>
                    <TableHead className="text-right">CPA</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.campaigns.map((c) => (
                    <TableRow key={c.campaign}>
                      <TableCell className="font-medium">{c.campaign}</TableCell>
                      <TableCell className="text-right">{c.impressions.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{c.clicks.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{c.ctr}</TableCell>
                      <TableCell className="text-right">{c.avg_cpc}</TableCell>
                      <TableCell className="text-right">{c.spend}</TableCell>
                      <TableCell className="text-right">{c.conversions}</TableCell>
                      <TableCell className="text-right">{c.cpa}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className={cn("bg-muted/50 font-medium")}>
                    <TableCell>{report.totals.campaign}</TableCell>
                    <TableCell className="text-right">{report.totals.impressions.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{report.totals.clicks.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{report.totals.ctr}</TableCell>
                    <TableCell className="text-right">{report.totals.avg_cpc}</TableCell>
                    <TableCell className="text-right">{report.totals.spend}</TableCell>
                    <TableCell className="text-right">{report.totals.conversions}</TableCell>
                    <TableCell className="text-right">{report.totals.cpa}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            {report.daily && (
              <div className="mt-6">
                <CampaignDailyReportSection daily={report.daily} />
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
