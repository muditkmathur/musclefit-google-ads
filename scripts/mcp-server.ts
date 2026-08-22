import { config } from "dotenv";

import path from "node:path";

config({ path: path.resolve(process.cwd(), ".env") });
config({ path: path.resolve(process.cwd(), ".env.local"), override: true });

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { runAdGroupReport } from "../src/lib/google-ads/ad-group-report";
import { runAdPerformance } from "../src/lib/google-ads/ad-performance";
import { runAuctionInsights } from "../src/lib/google-ads/auction-insights";
import { runCampaignKeywords } from "../src/lib/google-ads/campaign-keywords";
import { runChangeHistory } from "../src/lib/google-ads/change-history";
import { runDevicePerformance } from "../src/lib/google-ads/device-performance";
import { runKeywordAnalysisBundle } from "../src/lib/google-ads/keyword-analysis";
import { runKeywordSearchTermMap } from "../src/lib/google-ads/keyword-search-term-map";
import { runLandingPageReport } from "../src/lib/google-ads/landing-page-report";
import { runQualityScore } from "../src/lib/google-ads/quality-score";
import { runCampaignReport } from "../src/lib/google-ads/report";
import { runSchedulePerformance } from "../src/lib/google-ads/schedule-performance";
import { runSearchTermsReport } from "../src/lib/google-ads/search-terms";
import { runSearchConsoleReport } from "../src/lib/search-console/report";

const GRANULARITIES = ["day", "week", "month"] as const;

const forceRefreshSchema = z
  .boolean()
  .optional()
  .default(false)
  .describe("Bypass file cache and fetch fresh data from the API");

const startDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe("Start date in YYYY-MM-DD format");
const endDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe("End date in YYYY-MM-DD format");

const server = new McpServer({ name: "google-ads", version: "1.0.0" });

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function fail(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
}

// ─── Tools ───────────────────────────────────────────────────────────────────

server.tool(
  "get_campaign_report",
  "Campaign performance summary with optional daily breakdown and demographic data. Returns impressions, clicks, spend, conversions, CTR, CPC, and impression share per campaign plus account totals. Each campaign row includes dailyBudget (INR/day cap from Google Ads) and periodBudget (dailyBudget × days in range) for budget utilization analysis.",
  {
    start_date: startDateSchema,
    end_date: endDateSchema,
    granularity: z
      .enum(GRANULARITIES)
      .default("day")
      .describe('Time granularity for daily chart: "day" | "week" | "month"'),
    include_daily: z.boolean().optional().default(true).describe("Include day-by-day breakdown with DoD deltas"),
    include_demographics: z.boolean().optional().default(false).describe("Include age/gender demographic breakdown"),
    force_refresh: forceRefreshSchema,
  },
  async ({ start_date, end_date, granularity, include_daily, include_demographics, force_refresh }) => {
    try {
      const data = await runCampaignReport({
        dateRange: { start: start_date, end: end_date },
        granularity,
        includeDaily: include_daily,
        includeDemographics: include_demographics,
        forceRefresh: force_refresh,
      });
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
);

server.tool(
  "get_search_terms",
  "All search terms that triggered ads, with clicks, impressions, cost, conversions, and CTR per term. Useful for finding irrelevant queries to add as negatives.",
  {
    months: z.number().int().min(1).max(12).optional().default(3).describe("How many months of history to fetch"),
    campaign: z.string().optional().describe("Filter to a specific campaign by name (partial match)"),
    force_refresh: forceRefreshSchema,
  },
  async ({ months, campaign, force_refresh }) => {
    try {
      const data = await runSearchTermsReport({
        monthsBack: months,
        campaign: campaign ?? null,
        forceRefresh: force_refresh,
      });
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
);

server.tool(
  "get_keyword_analysis",
  "Search terms report combined with n-gram frequency analysis. Identifies high-performing keyword patterns and wasted spend. Use this to find new keywords to add or bid adjustments.",
  {
    months: z.number().int().min(1).max(12).optional().default(3).describe("How many months of history to analyze"),
    campaign: z.string().optional().describe("Filter to a specific campaign by name (partial match)"),
    weight: z
      .enum(["clicks", "cost", "count", "impressions"])
      .optional()
      .default("clicks")
      .describe("Metric to rank n-grams by"),
    force_refresh: forceRefreshSchema,
  },
  async ({ months, campaign, weight, force_refresh }) => {
    try {
      const data = await runKeywordAnalysisBundle({
        monthsBack: months,
        campaign: campaign ?? null,
        ngramOptions: { weight },
        forceRefresh: force_refresh,
      });
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
);

server.tool(
  "get_ad_groups",
  "Ad group performance metrics: impressions, clicks, spend, conversions, CTR, CPC, impression share per ad group.",
  {
    start_date: startDateSchema,
    end_date: endDateSchema,
    force_refresh: forceRefreshSchema,
  },
  async ({ start_date, end_date, force_refresh }) => {
    try {
      const data = await runAdGroupReport({
        dateRange: { start: start_date, end: end_date },
        forceRefresh: force_refresh,
      });
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
);

server.tool(
  "get_device_performance",
  "Performance split by device type: Desktop, Mobile, Tablet, Connected TV. Useful for bid modifier decisions.",
  {
    start_date: startDateSchema,
    end_date: endDateSchema,
    force_refresh: forceRefreshSchema,
  },
  async ({ start_date, end_date, force_refresh }) => {
    try {
      const data = await runDevicePerformance({
        dateRange: { start: start_date, end: end_date },
        forceRefresh: force_refresh,
      });
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
);

server.tool(
  "get_quality_score",
  "Keyword quality scores with expected CTR, ad relevance, and landing page experience components. Low QS increases CPC.",
  {
    start_date: startDateSchema,
    end_date: endDateSchema,
    force_refresh: forceRefreshSchema,
  },
  async ({ start_date, end_date, force_refresh }) => {
    try {
      const data = await runQualityScore({
        dateRange: { start: start_date, end: end_date },
        forceRefresh: force_refresh,
      });
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
);

server.tool(
  "get_schedule_performance",
  "Hour-of-day × day-of-week heatmap: clicks, impressions, spend, conversions by time slot. Use for ad scheduling bid adjustments.",
  {
    start_date: startDateSchema,
    end_date: endDateSchema,
    force_refresh: forceRefreshSchema,
  },
  async ({ start_date, end_date, force_refresh }) => {
    try {
      const data = await runSchedulePerformance({
        dateRange: { start: start_date, end: end_date },
        forceRefresh: force_refresh,
      });
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
);

server.tool(
  "get_change_history",
  "Account change history: bid changes, budget changes, status changes, ad/keyword additions and removals. API limit is 30 days.",
  {
    days: z
      .number()
      .int()
      .min(1)
      .max(30)
      .optional()
      .default(30)
      .describe("Number of days of history (max 30, Google Ads API limit)"),
    force_refresh: forceRefreshSchema,
  },
  async ({ days, force_refresh }) => {
    try {
      const data = await runChangeHistory({ days, forceRefresh: force_refresh });
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
);

server.tool(
  "get_campaign_keywords",
  "All keywords for a campaign with match type, bid, quality score, and status. Requires either campaign_id or campaign_name.",
  {
    campaign_id: z.string().optional().describe("Numeric campaign ID string"),
    campaign_name: z.string().optional().describe("Campaign name (partial match)"),
  },
  async ({ campaign_id, campaign_name }) => {
    if (!campaign_id && !campaign_name) {
      return fail(new Error("Provide either campaign_id or campaign_name"));
    }
    try {
      const data = await runCampaignKeywords({
        campaignId: campaign_id,
        campaignName: campaign_name,
      });
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
);

server.tool(
  "get_landing_page_report",
  "Landing page performance — spend, conversions, CTR, CPA per unexpanded final URL. Includes which ad groups point to each URL and a waste flag (spend ≥ ₹500 with 0 conversions). Use to find LPs that need rework when QS landing-page-experience is low.",
  {
    start_date: startDateSchema,
    end_date: endDateSchema,
    campaign: z.string().optional().describe("Filter to a specific campaign by name (partial match)"),
    force_refresh: forceRefreshSchema,
  },
  async ({ start_date, end_date, campaign, force_refresh }) => {
    try {
      const data = await runLandingPageReport({
        dateRange: { start: start_date, end: end_date },
        campaign: campaign ?? null,
        forceRefresh: force_refresh,
      });
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
);

server.tool(
  "get_keyword_search_term_map",
  "Maps each search term back to the triggering keyword and match type, with per-row spend/conversions plus intent-mismatch, broad-trigger, and waste flags. Use to spot broad keywords pulling irrelevant traffic.",
  {
    start_date: startDateSchema,
    end_date: endDateSchema,
    campaign: z.string().optional().describe("Filter to a specific campaign by name (partial match)"),
    top: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .default(300)
      .describe("Cap the result set to top N rows by spend (default 300, max 1000)"),
    force_refresh: forceRefreshSchema,
  },
  async ({ start_date, end_date, campaign, top, force_refresh }) => {
    try {
      const data = await runKeywordSearchTermMap({
        dateRange: { start: start_date, end: end_date },
        campaign: campaign ?? null,
        top,
        forceRefresh: force_refresh,
      });
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
);

server.tool(
  "get_ad_performance",
  "Ad-level performance with RSA ad strength and per-asset (headline/description) performance labels (BEST/GOOD/LOW/LEARNING). Use to identify weak ads, weak assets, and ads that need refreshing.",
  {
    start_date: startDateSchema,
    end_date: endDateSchema,
    campaign: z.string().optional().describe("Filter to a specific campaign by name (partial match)"),
    force_refresh: forceRefreshSchema,
  },
  async ({ start_date, end_date, campaign, force_refresh }) => {
    try {
      const data = await runAdPerformance({
        dateRange: { start: start_date, end: end_date },
        campaign: campaign ?? null,
        forceRefresh: force_refresh,
      });
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
);

server.tool(
  "get_auction_insights",
  "Competitor auction insights — domains you compete with on Search keywords, with impression share, overlap rate, position-above rate, and outranking share. Use to explain Lost IS (rank). Search campaigns only; sparse when keyword volume is low.",
  {
    start_date: startDateSchema,
    end_date: endDateSchema,
    campaign: z.string().optional().describe("Filter to a specific campaign by name (partial match)"),
    force_refresh: forceRefreshSchema,
  },
  async ({ start_date, end_date, campaign, force_refresh }) => {
    try {
      const data = await runAuctionInsights({
        dateRange: { start: start_date, end: end_date },
        campaign: campaign ?? null,
        forceRefresh: force_refresh,
      });
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
);

server.tool(
  "get_search_console_report",
  "Organic Search Console performance (query × page): clicks, impressions, CTR, and average position. Use to analyze SEO performance, find top/losing queries and pages, or spot query-page intent mismatches. Separate data source/OAuth from Google Ads.",
  {
    start_date: startDateSchema,
    end_date: endDateSchema,
    site_url: z
      .string()
      .optional()
      .describe(
        "Search Console site to query (e.g. 'sc-domain:example.com'). Defaults to SEARCH_CONSOLE_SITE_URL env var or the account's sole site.",
      ),
    row_limit: z.number().int().positive().max(25000).optional().describe("Max rows to return (default 500)"),
    force_refresh: forceRefreshSchema,
  },
  async ({ start_date, end_date, site_url, row_limit, force_refresh }) => {
    try {
      const data = await runSearchConsoleReport({
        dateRange: { start: start_date, end: end_date },
        siteUrl: site_url ?? null,
        rowLimit: row_limit,
        forceRefresh: force_refresh,
      });
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  },
);

// ─── Start ────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
