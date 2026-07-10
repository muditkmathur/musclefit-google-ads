"use client";

import { useCallback, useEffect, useState } from "react";

import { getOverviewThread, runOverviewAnalysisAction } from "@/app/actions/google-ads";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useDateRange } from "@/hooks/use-date-range";
import type { DateRange, OverviewThread } from "@/types/google-ads";

import { CampaignInsightCard } from "./campaign-insight-card";
import { OverviewChatPanel } from "./overview-chat-panel";

export function OverviewContent() {
  const [dateRange] = useDateRange();
  const [thread, setThread] = useState<OverviewThread | null>(null);
  const [loadingCached, setLoadingCached] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCached = useCallback(async (dr: DateRange) => {
    setLoadingCached(true);
    setError(null);
    try {
      const res = await getOverviewThread({ start: dr.start, end: dr.end });
      if (!res.ok) throw new Error(res.error);
      setThread(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoadingCached(false);
    }
  }, []);

  useEffect(() => {
    void loadCached(dateRange);
  }, [loadCached, dateRange]);

  async function handleAnalyze(forceRefresh: boolean) {
    setAnalyzing(true);
    setError(null);
    try {
      const res = await runOverviewAnalysisAction({ start: dateRange.start, end: dateRange.end, forceRefresh });
      if (!res.ok) throw new Error(res.error);
      setThread(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={() => void handleAnalyze(Boolean(thread))} disabled={analyzing || loadingCached}>
          {analyzing ? <Spinner className="mr-2 size-4" /> : null}
          {thread ? "Re-analyze" : "Analyze"}
        </Button>
        {thread && (
          <span className="text-muted-foreground text-xs">
            Generated {new Date(thread.analysis.generatedAt).toLocaleString()}
          </span>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loadingCached && !thread && <Spinner className="size-6" />}

      {!loadingCached && !thread && !error && (
        <p className="text-muted-foreground text-sm">
          No analysis yet for this date range. Click Analyze to generate campaign insights.
        </p>
      )}

      {thread && (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {thread.analysis.insights.map((insight) => (
              <CampaignInsightCard key={insight.campaignId} insight={insight} />
            ))}
          </div>

          <OverviewChatPanel dateRange={dateRange} initialMessages={thread.messages} />
        </>
      )}
    </div>
  );
}
