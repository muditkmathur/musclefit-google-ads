import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { getAnthropicClient, OVERVIEW_MODEL } from "@/lib/anthropic/client";
import { buildCacheKey } from "@/lib/cache/query-cache";
import { getRedis } from "@/lib/cache/redis";
import { runAdGroupReport } from "@/lib/google-ads/ad-group-report";
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

const CAMPAIGN_FILTER_PROPERTY = {
  campaign: {
    type: "string",
    description: "Optional: filter to a specific campaign by name (partial match). Omit for all campaigns.",
  },
} as const;

const FOLLOWUP_TOOLS: Anthropic.Tool[] = [
  {
    name: "get_campaign_report",
    description:
      "Campaign performance summary: impressions, clicks, spend, conversions, CTR, CPC, and impression share per campaign, for the analysis's date range.",
    input_schema: { type: "object", properties: CAMPAIGN_FILTER_PROPERTY },
  },
  {
    name: "get_ad_group_report",
    description:
      "Ad-group-level performance: impressions, clicks, spend, conversions, CPA, impression share, and lost impression share (budget/rank) per ad group, for the analysis's date range.",
    input_schema: { type: "object", properties: CAMPAIGN_FILTER_PROPERTY },
  },
  {
    name: "get_quality_score",
    description:
      "Per-keyword Quality Score (1-10) and its three components (expected CTR, ad relevance, landing page experience), plus the bottleneck classification (bid/QS/both/competitive) for each keyword, for the analysis's date range.",
    input_schema: { type: "object", properties: CAMPAIGN_FILTER_PROPERTY },
  },
  {
    name: "get_landing_page_report",
    description:
      "Landing page performance aggregated by URL: impressions, clicks, spend, conversions, CPA, conversion rate, and a waste flag (spend >= 500 with zero conversions), for the analysis's date range.",
    input_schema: { type: "object", properties: CAMPAIGN_FILTER_PROPERTY },
  },
  {
    name: "get_keyword_search_term_map",
    description:
      "Search terms mapped to the keyword that triggered them, with intent-mismatch, broad-trigger, and waste flags, for the analysis's date range.",
    input_schema: {
      type: "object",
      properties: {
        ...CAMPAIGN_FILTER_PROPERTY,
        adGroup: {
          type: "string",
          description: "Optional: filter to a specific ad group by name (partial match).",
        },
      },
    },
  },
  {
    name: "get_ad_performance",
    description:
      "Ad-level performance with RSA ad strength and per-asset (headline/description) performance labels, for the analysis's date range.",
    input_schema: {
      type: "object",
      properties: {
        ...CAMPAIGN_FILTER_PROPERTY,
        adGroup: {
          type: "string",
          description: "Optional: filter to a specific ad group by name (partial match).",
        },
      },
    },
  },
  {
    name: "get_auction_insights",
    description:
      "Competitor auction insights: domains you compete with, impression share, overlap rate, position-above rate, and outranking share, for the analysis's date range. Use to explain Lost IS (rank).",
    input_schema: { type: "object", properties: CAMPAIGN_FILTER_PROPERTY },
  },
  {
    name: "get_change_history",
    description:
      "Individual account change events (campaign/ad-group/keyword/budget/status edits) with their date, changed fields, old/new values, and who made the change. Use this to correlate specific account changes with performance shifts (e.g. a CPA spike or impression share drop) by comparing change dates to metric trends.",
    input_schema: {
      type: "object",
      properties: {
        ...CAMPAIGN_FILTER_PROPERTY,
        days: {
          type: "number",
          description: "How many days back to look for changes, from today. Defaults to 30, capped at 30.",
        },
      },
    },
  },
];

async function callFollowupTool(name: string, input: unknown, dateRange: DateRange): Promise<unknown> {
  const params = (input ?? {}) as { campaign?: string; adGroup?: string; days?: number };
  const campaign = params.campaign?.trim() || null;
  const adGroup = params.adGroup?.trim() || null;

  switch (name) {
    case "get_campaign_report":
      return runCampaignReport({
        dateRange,
        campaign,
        includeDaily: false,
        includeDemographics: false,
        includePrevious: false,
      });
    case "get_ad_group_report":
      return runAdGroupReport({ dateRange, campaign });
    case "get_quality_score":
      return runQualityScore({ dateRange, campaign });
    case "get_landing_page_report":
      return runLandingPageReport({ dateRange, campaign });
    case "get_keyword_search_term_map":
      return runKeywordSearchTermMap({ dateRange, campaign, adGroup, top: 300 });
    case "get_ad_performance":
      return runAdPerformance({ dateRange, campaign, adGroup });
    case "get_auction_insights":
      return runAuctionInsights({ dateRange, campaign });
    case "get_change_history": {
      const daysRaw = typeof params.days === "number" && Number.isFinite(params.days) ? params.days : 30;
      const days = Math.min(Math.max(Math.floor(daysRaw), 1), 30);
      return runChangeHistory({ days, campaign });
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

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
  if (context.campaigns.length === 0) {
    return [];
  }

  const client = getAnthropicClient();

  const response = await client.messages.create({
    model: OVERVIEW_MODEL,
    max_tokens: 4096,
    thinking: { type: "disabled" },
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
    context,
    messages: [],
  };

  await saveOverviewThread(dateRange, thread);
  return thread;
}

function buildFollowupSystemPrompt(thread: OverviewThread): string {
  const contextBlock = thread.context
    ? `\n\nDetailed per-campaign data behind that summary (JSON): ${JSON.stringify(thread.context.campaigns)}`
    : "\n\n(No detailed per-campaign data is available for this analysis — it was generated before this data started being retained. Answer using only the summary above.)";

  return `You are a Google Ads performance analyst. The user previously received this per-campaign \
analysis summary (JSON): ${JSON.stringify(thread.analysis.insights)}${contextBlock}

Answer their follow-up questions grounded strictly in this data — prefer the detailed per-campaign data \
when it's available and the question needs a specific number or fact, and fall back to the summary for \
higher-level questions. If asked about something not covered by either, say so plainly rather than \
guessing.`;
}

const MAX_TOOL_ROUNDS = 6;

export async function askOverviewFollowup(dateRange: DateRange, question: string): Promise<OverviewChatMessage[]> {
  const thread = await loadOverviewThread(dateRange);
  if (!thread) {
    if (!getRedis()) {
      throw new Error(
        "Follow-up chat requires Redis to be configured (REDIS_HOST) to store the analysis between requests. Currently unavailable.",
      );
    }
    throw new Error("No analysis found for this date range — run Analyze first.");
  }

  const client = getAnthropicClient();
  const system = buildFollowupSystemPrompt(thread);

  const history: Anthropic.MessageParam[] = thread.messages.map((m) => ({ role: m.role, content: m.content }));
  const conversation: Anthropic.MessageParam[] = [...history, { role: "user", content: question }];

  let answer = "";

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const isLastRound = round === MAX_TOOL_ROUNDS - 1;

    const response = await client.messages.create({
      model: OVERVIEW_MODEL,
      max_tokens: 2048,
      thinking: { type: "disabled" },
      system,
      messages: conversation,
      ...(isLastRound ? {} : { tools: FOLLOWUP_TOOLS }),
    });

    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );

    if (response.stop_reason !== "tool_use" || toolUseBlocks.length === 0) {
      const textBlock = response.content.find((block) => block.type === "text");
      answer = textBlock && textBlock.type === "text" ? textBlock.text : "";
      break;
    }

    conversation.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
      toolUseBlocks.map(async (block): Promise<Anthropic.ToolResultBlockParam> => {
        try {
          const result = await callFollowupTool(block.name, block.input, dateRange);
          return { type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return { type: "tool_result", tool_use_id: block.id, content: message, is_error: true };
        }
      }),
    );

    conversation.push({ role: "user", content: toolResults });
  }

  const now = new Date().toISOString();
  const updatedMessages: OverviewChatMessage[] = [
    ...thread.messages,
    { role: "user", content: question, createdAt: now },
    { role: "assistant", content: answer, createdAt: now },
  ];

  await saveOverviewThread(dateRange, { ...thread, messages: updatedMessages });
  return updatedMessages;
}
