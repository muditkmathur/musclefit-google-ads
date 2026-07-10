import { z } from "zod";

import { getAnthropicClient, OVERVIEW_MODEL } from "@/lib/anthropic/client";
import { buildCacheKey } from "@/lib/cache/query-cache";
import { getRedis } from "@/lib/cache/redis";
import { runAdPerformance } from "@/lib/google-ads/ad-performance";
import { runAuctionInsights } from "@/lib/google-ads/auction-insights";
import { runChangeHistory } from "@/lib/google-ads/change-history";
import { runKeywordSearchTermMap } from "@/lib/google-ads/keyword-search-term-map";
import { runLandingPageReport } from "@/lib/google-ads/landing-page-report";
import { runQualityScore } from "@/lib/google-ads/quality-score";
import { runCampaignReport } from "@/lib/google-ads/report";
import type {
  AdStrengthLabel,
  CampaignInsight,
  DateRange,
  OverviewCampaignContext,
  OverviewChatMessage,
  OverviewContext,
  OverviewThread,
  QualityScoreBottleneck,
} from "@/types/google-ads";

const WASTE_TOP_N = 5;
const COMPETITOR_TOP_N = 3;

function topByField<T>(rows: T[], field: (row: T) => number, n: number): T[] {
  return [...rows].sort((a, b) => field(b) - field(a)).slice(0, n);
}

export async function buildOverviewContext(dateRange: DateRange): Promise<OverviewContext> {
  const [campaignReport, qualityScore, landingPages, searchTerms, adPerformance, auctionInsights, changeHistory] =
    await Promise.all([
      runCampaignReport({ dateRange, includeDaily: false, includeDemographics: false, includePrevious: false }),
      runQualityScore({ dateRange }),
      runLandingPageReport({ dateRange }),
      runKeywordSearchTermMap({ dateRange, top: 500 }),
      runAdPerformance({ dateRange }),
      runAuctionInsights({ dateRange }),
      runChangeHistory({ days: 30 }),
    ]);

  const campaigns: OverviewCampaignContext[] = campaignReport.campaigns.map((row) => {
    const campaignName = row.campaign;

    const qsRows = qualityScore.rows.filter((r) => r.campaign === campaignName);
    const qsValues = qsRows.map((r) => r.qualityScore).filter((v): v is number => v !== null);
    const avgQualityScore = qsValues.length > 0 ? qsValues.reduce((a, b) => a + b, 0) / qsValues.length : null;
    const qualityScoreBottlenecks: Partial<Record<QualityScoreBottleneck, number>> = {};
    for (const r of qsRows) {
      qualityScoreBottlenecks[r.bottleneck] = (qualityScoreBottlenecks[r.bottleneck] ?? 0) + 1;
    }

    const wasteLandingPages = topByField(
      landingPages.rows.filter((r) => r.isWaste && r.campaigns.includes(campaignName)),
      (r) => r.spend,
      WASTE_TOP_N,
    ).map((r) => ({ url: r.url, spend: r.spend }));

    const wasteSearchTerms = topByField(
      searchTerms.rows.filter((r) => r.isWaste && r.campaign === campaignName),
      (r) => r.spend,
      WASTE_TOP_N,
    ).map((r) => ({ searchTerm: r.searchTerm, spend: r.spend }));

    const adStrengthCounts: Partial<Record<AdStrengthLabel, number>> = {};
    for (const ad of adPerformance.ads.filter((a) => a.campaign === campaignName)) {
      adStrengthCounts[ad.adStrength] = (adStrengthCounts[ad.adStrength] ?? 0) + 1;
    }

    const topCompetitorDomains = topByField(
      auctionInsights.competitors.filter((c) => c.campaign === campaignName),
      (c) => c.impressionShare,
      COMPETITOR_TOP_N,
    ).map((c) => ({ domain: c.domain, impressionShare: c.impressionShare }));

    const changeEventCount = changeHistory.events.filter((e) => e.campaignName === campaignName).length;

    return {
      campaignId: campaignName,
      campaignName,
      status: row.status,
      spend: row.spendRaw,
      conversions: row.conversions,
      cpa: row.cpaRaw,
      ctr: Number.parseFloat(row.ctr) || 0,
      impressionShare: row.impressionShare,
      lostIsBudget: row.lostIsBudget,
      lostIsRank: row.lostIsRank,
      avgQualityScore,
      qualityScoreBottlenecks,
      topWasteLandingPages: wasteLandingPages,
      topWasteSearchTerms: wasteSearchTerms,
      adStrengthCounts,
      topCompetitorDomains,
      changeEventCount,
    };
  });

  return { dateRange, campaigns };
}

const CampaignInsightSchema = z.object({
  campaignId: z.string(),
  campaignName: z.string(),
  health: z.enum(["on-track", "needs-attention", "at-risk"]),
  summary: z.string(),
  nextSteps: z.array(z.string()),
});

const CampaignInsightsResponseSchema = z.object({
  insights: z.array(CampaignInsightSchema),
});

const SYSTEM_PROMPT = `You are a Google Ads performance analyst. You will receive a JSON array of \
per-campaign metrics (spend, conversions, CPA, CTR, impression share, quality score bottlenecks, \
wasted spend on landing pages/search terms, ad strength, competitor overlap, and recent account \
change counts) for a fixed date range.

For each campaign, respond with a "health" label ("on-track", "needs-attention", or "at-risk"), a \
1-2 sentence "summary" of what's driving that label, and a prioritized "nextSteps" array (2-4 concrete, \
specific actions referencing the actual numbers given — e.g. name the wasted search term or landing page \
URL, not a generic suggestion).

Respond with ONLY a JSON object of the shape: {"insights": [{"campaignId": string, "campaignName": string, \
"health": "on-track"|"needs-attention"|"at-risk", "summary": string, "nextSteps": string[]}]}. No prose \
outside the JSON.`;

function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("Claude response did not contain a JSON object");
  }
  return JSON.parse(text.slice(start, end + 1));
}

export async function generateCampaignInsights(context: OverviewContext): Promise<CampaignInsight[]> {
  const client = getAnthropicClient();

  const response = await client.messages.create({
    model: OVERVIEW_MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: JSON.stringify(context.campaigns) }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude response contained no text block");
  }

  const parsed = CampaignInsightsResponseSchema.parse(extractJson(textBlock.text));
  return parsed.insights;
}

const OVERVIEW_TTL_SECONDS = 60 * 60;

function overviewRedisKey(dateRange: DateRange): string {
  return buildCacheKey("overview", dateRange as unknown as Record<string, unknown>);
}

export async function loadOverviewThread(dateRange: DateRange): Promise<OverviewThread | null> {
  const client = getRedis();
  if (!client) return null;
  try {
    const raw = await client.get(overviewRedisKey(dateRange));
    return raw ? (JSON.parse(raw) as OverviewThread) : null;
  } catch (err) {
    console.warn("[overview] Redis GET failed; treating as no cached thread.", err);
    return null;
  }
}

async function saveOverviewThread(dateRange: DateRange, thread: OverviewThread): Promise<void> {
  const client = getRedis();
  if (!client) return;
  try {
    await client.set(overviewRedisKey(dateRange), JSON.stringify(thread), "EX", OVERVIEW_TTL_SECONDS);
  } catch (err) {
    console.warn("[overview] Redis SET failed; thread not persisted.", err);
  }
}

export async function runOverviewAnalysis(
  dateRange: DateRange,
  opts: { forceRefresh?: boolean } = {},
): Promise<OverviewThread> {
  if (!opts.forceRefresh) {
    const existing = await loadOverviewThread(dateRange);
    if (existing) return existing;
  }

  const context = await buildOverviewContext(dateRange);
  const insights = await generateCampaignInsights(context);

  const thread: OverviewThread = {
    analysis: { generatedAt: new Date().toISOString(), dateRange, insights },
    messages: [],
  };

  await saveOverviewThread(dateRange, thread);
  return thread;
}

export async function askOverviewFollowup(dateRange: DateRange, question: string): Promise<OverviewChatMessage[]> {
  const thread = await loadOverviewThread(dateRange);
  if (!thread) {
    throw new Error("No analysis found for this date range — run Analyze first.");
  }

  const client = getAnthropicClient();

  const history = thread.messages.map((m) => ({ role: m.role, content: m.content }));

  const response = await client.messages.create({
    model: OVERVIEW_MODEL,
    max_tokens: 2048,
    system: `You are a Google Ads performance analyst. The user previously received this per-campaign \
analysis (JSON): ${JSON.stringify(thread.analysis.insights)}. Answer their follow-up questions grounded \
strictly in this data. If asked about something not covered by the data, say so plainly rather than \
guessing.`,
    messages: [...history, { role: "user" as const, content: question }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  const answer = textBlock && textBlock.type === "text" ? textBlock.text : "";

  const now = new Date().toISOString();
  const updatedMessages: OverviewChatMessage[] = [
    ...thread.messages,
    { role: "user", content: question, createdAt: now },
    { role: "assistant", content: answer, createdAt: now },
  ];

  await saveOverviewThread(dateRange, { ...thread, messages: updatedMessages });
  return updatedMessages;
}
