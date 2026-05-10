"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";

import { RefreshCw, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

import { getKeywordAnalysisBundle } from "@/app/actions/google-ads";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { KeywordAnalysisBundle, NgramAnalysisResult, SearchTermsReport } from "@/types/google-ads";

const WEIGHTS = ["count", "clicks", "impressions", "cost"] as const;

type SortDir = "asc" | "desc";

function compareStrings(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
}

function compareNumbers(a: number, b: number): number {
  const aa = Number.isFinite(a) ? a : 0;
  const bb = Number.isFinite(b) ? b : 0;
  return aa - bb;
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="ml-1 h-3.5 w-3.5 text-muted-foreground/70" />;
  return dir === "asc" ? (
    <ArrowUp className="ml-1 h-3.5 w-3.5 text-muted-foreground" />
  ) : (
    <ArrowDown className="ml-1 h-3.5 w-3.5 text-muted-foreground" />
  );
}

function SortableHead({
  label,
  active,
  dir,
  align = "left",
  onClick,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  align?: "left" | "right";
  onClick: () => void;
}) {
  return (
    <TableHead className={align === "right" ? "text-right" : undefined}>
      <button
        type="button"
        onClick={onClick}
        className={align === "right" ? "inline-flex items-center justify-end" : "inline-flex items-center"}
      >
        <span>{label}</span>
        <SortIcon active={active} dir={dir} />
      </button>
    </TableHead>
  );
}

function SearchTermsTable({
  report,
  selectedCampaigns,
  onToggleCampaign,
  onClearCampaigns,
}: {
  report: SearchTermsReport;
  selectedCampaigns: string[];
  onToggleCampaign: (campaign: string) => void;
  onClearCampaigns: () => void;
}) {
  const [onlyConversions, setOnlyConversions] = useState<boolean>(false);

  const campaignOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of report.rows) {
      const name = r.campaign?.trim();
      if (name) set.add(name);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [report.rows]);

  const filteredReport = useMemo(() => {
    const campaignRows = selectedCampaigns.length
      ? report.rows.filter((r) => selectedCampaigns.includes(r.campaign))
      : report.rows;

    const rows = onlyConversions ? campaignRows.filter((r) => r.conversions > 0) : campaignRows;

    const totalClicks = rows.reduce((s, r) => s + r.clicks, 0);
    const totalImpressions = rows.reduce((s, r) => s + r.impressions, 0);
    const totalCost = rows.reduce((s, r) => s + r.cost, 0);
    const totalConversions = rows.reduce((s, r) => s + r.conversions, 0);
    const totalConversionValue = rows.reduce((s, r) => s + r.conversionValue, 0);

    return {
      ...report,
      totalTerms: rows.length,
      rows,
      summary: {
        totalClicks,
        totalImpressions,
        overallCtr: totalImpressions ? totalClicks / totalImpressions : 0,
        totalCost,
        totalConversions,
        totalConversionValue,
      },
    } satisfies SearchTermsReport;
  }, [onlyConversions, report, selectedCampaigns]);

  type SearchTermsSortKey =
    | "searchTerm"
    | "campaign"
    | "clicks"
    | "impressions"
    | "ctr"
    | "cost"
    | "conversions";
  const [sortKey, setSortKey] = useState<SearchTermsSortKey>("clicks");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sortedRows = useMemo(() => {
    const rows = [...filteredReport.rows];
    const dir = sortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      switch (sortKey) {
        case "searchTerm":
          return dir * compareStrings(a.searchTerm, b.searchTerm);
        case "campaign":
          return dir * compareStrings(a.campaign, b.campaign);
        case "clicks":
          return dir * compareNumbers(a.clicks, b.clicks);
        case "impressions":
          return dir * compareNumbers(a.impressions, b.impressions);
        case "ctr":
          return dir * compareNumbers(a.ctr, b.ctr);
        case "cost":
          return dir * compareNumbers(a.cost, b.cost);
        case "conversions":
          return dir * compareNumbers(a.conversions, b.conversions);
      }
    });
    return rows;
  }, [filteredReport.rows, sortDir, sortKey]);

  const toggleSort = (key: SearchTermsSortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "searchTerm" || key === "campaign" ? "asc" : "desc");
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <Badge variant="secondary">{filteredReport.totalTerms} terms</Badge>
        <Badge variant="outline">Clicks: {filteredReport.summary.totalClicks.toLocaleString()}</Badge>
        <Badge variant="outline">Impr.: {filteredReport.summary.totalImpressions.toLocaleString()}</Badge>
        <Badge variant="outline">CTR: {(filteredReport.summary.overallCtr * 100).toFixed(2)}%</Badge>
        <Badge variant="outline">Spend: ₹{filteredReport.summary.totalCost.toFixed(2)}</Badge>
        <Badge variant="outline">Conv.: {(filteredReport.summary.totalConversions ?? 0).toLocaleString()}</Badge>
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Switch
          size="sm"
          checked={onlyConversions}
          onCheckedChange={(checked) => setOnlyConversions(Boolean(checked))}
          aria-label="Only show rows with conversions"
        />
        <span className="text-muted-foreground text-xs">Only show conversions &gt; 0</span>
      </div>
      <p className="mb-2 text-muted-foreground text-sm">
        {filteredReport.dateRange.start} → {filteredReport.dateRange.end}
        {filteredReport.campaignFilter ? ` · filter: "${filteredReport.campaignFilter}"` : ""}
        {selectedCampaigns.length ? ` · campaigns: ${selectedCampaigns.length}` : ""}
        {onlyConversions ? " · conversions > 0" : ""}
      </p>

      {campaignOptions.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-xs">Campaigns</span>
          {campaignOptions.slice(0, 30).map((c) => {
            const selected = selectedCampaigns.includes(c);
            return (
              <Button
                key={c}
                type="button"
                variant={selected ? "default" : "outline"}
                size="sm"
                onClick={() => onToggleCampaign(c)}
                className="h-7 rounded-full px-3 text-xs"
              >
                {c}
              </Button>
            );
          })}
          {campaignOptions.length > 30 && (
            <span className="text-muted-foreground text-xs">+{campaignOptions.length - 30} more</span>
          )}
          {selectedCampaigns.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClearCampaigns}
              className="h-7 rounded-full px-2 text-xs"
            >
              Clear
            </Button>
          )}
        </div>
      )}
      <div className="max-h-[480px] overflow-auto rounded-lg border">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_hsl(var(--border))]">
            <TableRow>
              <SortableHead
                label="Search term"
                active={sortKey === "searchTerm"}
                dir={sortDir}
                onClick={() => toggleSort("searchTerm")}
              />
              <SortableHead
                label="Campaign"
                active={sortKey === "campaign"}
                dir={sortDir}
                onClick={() => toggleSort("campaign")}
              />
              <SortableHead
                label="Clicks"
                align="right"
                active={sortKey === "clicks"}
                dir={sortDir}
                onClick={() => toggleSort("clicks")}
              />
              <SortableHead
                label="Impr."
                align="right"
                active={sortKey === "impressions"}
                dir={sortDir}
                onClick={() => toggleSort("impressions")}
              />
              <SortableHead
                label="CTR"
                align="right"
                active={sortKey === "ctr"}
                dir={sortDir}
                onClick={() => toggleSort("ctr")}
              />
              <SortableHead
                label="Spend"
                align="right"
                active={sortKey === "cost"}
                dir={sortDir}
                onClick={() => toggleSort("cost")}
              />
              <SortableHead
                label="Conv."
                align="right"
                active={sortKey === "conversions"}
                dir={sortDir}
                onClick={() => toggleSort("conversions")}
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedRows.slice(0, 200).map((r) => (
              <TableRow
                key={`${r.searchTerm}|${r.campaign}|${r.adGroup}|${r.clicks}|${r.impressions}|${r.costMicros}`}
              >
                <TableCell>{r.searchTerm}</TableCell>
                <TableCell>{r.campaign}</TableCell>
                <TableCell className="text-right">{r.clicks.toLocaleString()}</TableCell>
                <TableCell className="text-right">{r.impressions.toLocaleString()}</TableCell>
                <TableCell className="text-right">{(r.ctr * 100).toFixed(2)}%</TableCell>
                <TableCell className="text-right">₹{r.cost.toFixed(2)}</TableCell>
                <TableCell className="text-right">{r.conversions.toLocaleString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {filteredReport.rows.length > 200 && (
        <p className="mt-2 text-muted-foreground text-xs">
          Showing first 200 of {filteredReport.rows.length} rows.
        </p>
      )}
    </div>
  );
}

function NgramResultView({ result }: { result: NgramAnalysisResult }) {
  const [tab, setTab] = useState<string>(String(result.params.n[0] ?? 1));
  type NgramSortKey = "ngram" | "count" | "score" | "clicks" | "impressions" | "cost";
  const [sortKey, setSortKey] = useState<NgramSortKey>("score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    const firstN = result.params.n[0];
    if (firstN) setTab(String(firstN));
  }, [result.params.n]);

  const toggleSort = (key: NgramSortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "ngram" ? "asc" : "desc");
  };

  return (
    <div>
      <p className="mb-2 text-muted-foreground text-sm">
        {result.totals.rows} rows analyzed (of {result.totals.rowsBeforeCampaignFilter}) · weight={result.weight}
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
                    <SortableHead
                      label="N-gram"
                      active={sortKey === "ngram"}
                      dir={sortDir}
                      onClick={() => toggleSort("ngram")}
                    />
                    <SortableHead
                      label="Count"
                      align="right"
                      active={sortKey === "count"}
                      dir={sortDir}
                      onClick={() => toggleSort("count")}
                    />
                    <SortableHead
                      label="Score"
                      align="right"
                      active={sortKey === "score"}
                      dir={sortDir}
                      onClick={() => toggleSort("score")}
                    />
                    <SortableHead
                      label="Clicks"
                      align="right"
                      active={sortKey === "clicks"}
                      dir={sortDir}
                      onClick={() => toggleSort("clicks")}
                    />
                    <SortableHead
                      label="Impr."
                      align="right"
                      active={sortKey === "impressions"}
                      dir={sortDir}
                      onClick={() => toggleSort("impressions")}
                    />
                    <SortableHead
                      label="Cost"
                      align="right"
                      active={sortKey === "cost"}
                      dir={sortDir}
                      onClick={() => toggleSort("cost")}
                    />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(() => {
                    const rows = [...(result.ngrams[String(n)] ?? [])];
                    const dir = sortDir === "asc" ? 1 : -1;
                    rows.sort((a, b) => {
                      switch (sortKey) {
                        case "ngram":
                          return dir * compareStrings(a.ngram, b.ngram);
                        case "count":
                          return dir * compareNumbers(a.count, b.count);
                        case "score":
                          return dir * compareNumbers(a.score, b.score);
                        case "clicks":
                          return dir * compareNumbers(a.clicks, b.clicks);
                        case "impressions":
                          return dir * compareNumbers(a.impressions, b.impressions);
                        case "cost":
                          return dir * compareNumbers(a.cost, b.cost);
                      }
                    });
                    return rows;
                  })().map((row) => (
                    <TableRow key={`${n}:${row.ngram}`}>
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
  );
}

function KeywordAnalysisCardContent() {
  const [months, setMonths] = useState<number>(3);
  const [weight, setWeight] = useState<(typeof WEIGHTS)[number]>("count");
  const [top, setTop] = useState<number>(50);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<KeywordAnalysisBundle | null>(null);
  const [selectedCampaigns, setSelectedCampaigns] = useState<string[]>([]);

  const run = useCallback(
    async (options: { forceRefresh?: boolean } = {}) => {
      setLoading(true);
      setError(null);
      try {
        const res = await getKeywordAnalysisBundle({
          months,
          campaign: null,
          options: { weight, top },
          forceRefresh: Boolean(options.forceRefresh),
        });
        if (!res.ok) throw new Error(res.error);
        setData(res.data);
        setSelectedCampaigns([]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    },
    [months, weight, top],
  );

  useEffect(() => {
    void run();
  }, [run]);

  function toggleCampaignChip(name: string) {
    setSelectedCampaigns((prev) => (prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]));
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-2">
          <Label htmlFor="ka-months" className="text-xs">
            Months
          </Label>
          <Input
            id="ka-months"
            type="number"
            min={1}
            max={24}
            value={months}
            onChange={(e) => setMonths(Number(e.target.value) || 3)}
            className="h-9 w-24"
          />
        </div>

        {data && !loading && (
          <span className="pb-1 text-muted-foreground text-xs">
            {data.searchTerms.dateRange.start} → {data.searchTerms.dateRange.end}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <Button type="button" size="sm" onClick={() => void run()} disabled={loading}>
            {loading ? (
              <>
                <Spinner className="mr-2" />
                Loading…
              </>
            ) : (
              "Run"
            )}
          </Button>

          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => void run({ forceRefresh: true })}
            disabled={loading}
            aria-label="Refresh keyword analysis"
          >
            {loading ? <Spinner /> : <RefreshCw />}
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {data && (
        <>
          <section id="search-terms" className="scroll-mt-24">
            <Card>
              <CardHeader>
                <CardTitle>Search terms</CardTitle>
                <CardDescription>Top search queries triggering ads in the selected window.</CardDescription>
              </CardHeader>
              <CardContent>
                <SearchTermsTable
                  report={data.searchTerms}
                  selectedCampaigns={selectedCampaigns}
                  onToggleCampaign={toggleCampaignChip}
                  onClearCampaigns={() => setSelectedCampaigns([])}
                />
              </CardContent>
            </Card>
          </section>

          <section id="ngram-analysis" className="scroll-mt-24">
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                  <div className="min-w-0 flex-1">
                    <CardTitle>N-gram analysis</CardTitle>
                    <CardDescription>Configure scoring and view top n-grams from the fetched search-term data.</CardDescription>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
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
                      <Label htmlFor="ka-top">Top per N</Label>
                      <Input
                        id="ka-top"
                        type="number"
                        min={5}
                        max={500}
                        value={top}
                        onChange={(e) => setTop(Number(e.target.value) || 50)}
                      />
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <NgramResultView result={data.ngrams} />
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}

export function KeywordAnalysisCard() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center gap-2 rounded-lg border border-dashed bg-muted/30 px-4 py-3 text-muted-foreground text-sm">
          <Spinner className="mr-1" />
          Loading query…
        </div>
      }
    >
      <KeywordAnalysisCardContent />
    </Suspense>
  );
}

