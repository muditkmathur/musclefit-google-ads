"use client";

import { useState } from "react";

import { getSearchTermsReport } from "@/app/actions/google-ads";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { SearchTermsReport } from "@/types/google-ads";

export function SearchTermsCard() {
  const [months, setMonths] = useState<number>(3);
  const [campaign, setCampaign] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<SearchTermsReport | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const result = await getSearchTermsReport({
        months,
        campaign: campaign.trim() || null,
      });
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
        <CardTitle>Search terms</CardTitle>
        <CardDescription>Top search queries triggering ads in the selected window.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="space-y-1.5 sm:w-32">
            <Label htmlFor="st-months">Months</Label>
            <Input
              id="st-months"
              type="number"
              min={1}
              max={24}
              value={months}
              onChange={(e) => setMonths(Number(e.target.value) || 3)}
            />
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <Label htmlFor="st-campaign">Campaign filter</Label>
            <Input
              id="st-campaign"
              placeholder="e.g. WhatsApp"
              value={campaign}
              onChange={(e) => setCampaign(e.target.value)}
            />
          </div>
          <Button type="button" onClick={run} disabled={loading} className="sm:ml-auto">
            {loading ? (
              <>
                <Spinner className="mr-2" />
                Loading…
              </>
            ) : (
              "Fetch terms"
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
            <div className="mb-3 flex flex-wrap gap-2">
              <Badge variant="secondary">{report.totalTerms} terms</Badge>
              <Badge variant="outline">Clicks: {report.summary.totalClicks.toLocaleString()}</Badge>
              <Badge variant="outline">Impr.: {report.summary.totalImpressions.toLocaleString()}</Badge>
              <Badge variant="outline">CTR: {(report.summary.overallCtr * 100).toFixed(2)}%</Badge>
              <Badge variant="outline">Spend: ₹{report.summary.totalCost.toFixed(2)}</Badge>
            </div>
            <p className="mb-2 text-muted-foreground text-sm">
              {report.dateRange.start} → {report.dateRange.end}
              {report.campaignFilter ? ` · filter: "${report.campaignFilter}"` : ""}
            </p>
            <div className="max-h-[480px] overflow-auto rounded-lg border">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_hsl(var(--border))]">
                  <TableRow>
                    <TableHead>Search term</TableHead>
                    <TableHead>Campaign</TableHead>
                    <TableHead>Ad group</TableHead>
                    <TableHead className="text-right">Clicks</TableHead>
                    <TableHead className="text-right">Impr.</TableHead>
                    <TableHead className="text-right">CTR</TableHead>
                    <TableHead className="text-right">Spend</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.rows.slice(0, 200).map((r) => (
                    <TableRow
                      key={`${r.searchTerm}|${r.campaign}|${r.adGroup}|${r.clicks}|${r.impressions}|${r.costMicros}`}
                    >
                      <TableCell>{r.searchTerm}</TableCell>
                      <TableCell>{r.campaign}</TableCell>
                      <TableCell>{r.adGroup}</TableCell>
                      <TableCell className="text-right">{r.clicks.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{r.impressions.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{(r.ctr * 100).toFixed(2)}%</TableCell>
                      <TableCell className="text-right">₹{r.cost.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {report.rows.length > 200 && (
              <p className="mt-2 text-muted-foreground text-xs">Showing first 200 of {report.rows.length} rows.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
