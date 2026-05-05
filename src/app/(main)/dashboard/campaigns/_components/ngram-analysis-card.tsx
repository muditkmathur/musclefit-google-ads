"use client";

import { useState } from "react";

import { getNgramAnalysis } from "@/app/actions/google-ads";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { NgramAnalysisResult } from "@/types/google-ads";

const WEIGHTS = ["count", "clicks", "impressions", "cost"] as const;

export function NgramAnalysisCard() {
  const [months, setMonths] = useState<number>(3);
  const [campaign, setCampaign] = useState("");
  const [weight, setWeight] = useState<(typeof WEIGHTS)[number]>("count");
  const [top, setTop] = useState<number>(50);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<NgramAnalysisResult | null>(null);
  const [tab, setTab] = useState<string>("1");

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await getNgramAnalysis({
        months,
        campaign: campaign.trim() || null,
        options: { weight, top },
      });
      if (!res.ok) throw new Error(res.error);
      setResult(res.data);
      const firstN = res.data.params.n[0];
      if (firstN) setTab(String(firstN));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>N-gram analysis</CardTitle>
        <CardDescription>Live n-gram analysis from search-term data.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="space-y-1.5 sm:w-28">
            <Label htmlFor="ng-months">Months</Label>
            <Input
              id="ng-months"
              type="number"
              min={1}
              max={24}
              value={months}
              onChange={(e) => setMonths(Number(e.target.value) || 3)}
            />
          </div>
          <div className="min-w-[160px] flex-1 space-y-1.5">
            <Label htmlFor="ng-campaign">Campaign filter</Label>
            <Input
              id="ng-campaign"
              placeholder="e.g. WhatsApp"
              value={campaign}
              onChange={(e) => setCampaign(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:w-40">
            <Label>Weight</Label>
            <Select value={weight} onValueChange={(v) => setWeight(v as (typeof WEIGHTS)[number])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WEIGHTS.map((w) => (
                  <SelectItem key={w} value={w}>
                    {w}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:w-32">
            <Label htmlFor="ng-top">Top per N</Label>
            <Input
              id="ng-top"
              type="number"
              min={5}
              max={500}
              value={top}
              onChange={(e) => setTop(Number(e.target.value) || 50)}
            />
          </div>
          <Button type="button" onClick={run} disabled={loading} className="sm:ml-auto">
            {loading ? (
              <>
                <Spinner className="mr-2" />
                Analyzing…
              </>
            ) : (
              "Analyze"
            )}
          </Button>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {result && (
          <div>
            <p className="mb-2 text-muted-foreground text-sm">
              {result.totals.rows} rows analyzed (of {result.totals.rowsBeforeCampaignFilter}) · weight=
              {result.weight}
              {result.campaign ? ` · filter: "${result.campaign}"` : ""}
            </p>
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="h-auto w-full flex-wrap justify-start overflow-x-auto">
                {result.params.n.map((n) => (
                  <TabsTrigger key={n} value={String(n)} className="text-xs">
                    {n}-gram
                  </TabsTrigger>
                ))}
              </TabsList>
              {result.params.n.map((n) => (
                <TabsContent key={n} value={String(n)} className="mt-3">
                  <div className="max-h-[480px] overflow-auto rounded-lg border">
                    <Table>
                      <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_hsl(var(--border))]">
                        <TableRow>
                          <TableHead>N-gram</TableHead>
                          <TableHead className="text-right">Count</TableHead>
                          <TableHead className="text-right">Score</TableHead>
                          <TableHead className="text-right">Clicks</TableHead>
                          <TableHead className="text-right">Impr.</TableHead>
                          <TableHead className="text-right">Cost</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(result.ngrams[String(n)] ?? []).map((row) => (
                          <TableRow key={row.ngram}>
                            <TableCell className="font-medium">{row.ngram}</TableCell>
                            <TableCell className="text-right">{row.count}</TableCell>
                            <TableCell className="text-right">
                              {Number.isFinite(row.score) ? row.score.toFixed(2) : "0.00"}
                            </TableCell>
                            <TableCell className="text-right">{row.clicks.toLocaleString()}</TableCell>
                            <TableCell className="text-right">{row.impressions.toLocaleString()}</TableCell>
                            <TableCell className="text-right">₹{row.cost.toFixed(2)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
