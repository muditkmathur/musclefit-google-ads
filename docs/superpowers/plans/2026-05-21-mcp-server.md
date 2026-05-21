# MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local stdio MCP server that exposes all 9 Google Ads data sources as tools so Claude can query live data directly in any conversation.

**Architecture:** Single file `scripts/mcp-server.ts` wraps the existing `src/lib/google-ads/` functions using the `@modelcontextprotocol/sdk` stdio transport. Registered via `.mcp.json` so Claude Code auto-starts it per session. Shares the same Redis cache as the UI — no logic duplication.

**Tech Stack:** `@modelcontextprotocol/sdk`, `zod`, `tsx`, `dotenv`

---

### Task 1: Install dependencies

**Files:**
- Modify: `package.json` (via pnpm add)

- [ ] **Step 1: Add the MCP SDK and zod**

```bash
pnpm add @modelcontextprotocol/sdk zod
```

Expected output: both packages appear in `dependencies` in `package.json`.

- [ ] **Step 2: Verify install**

```bash
pnpm typecheck
```

Expected: no new errors (packages are now resolvable).

---

### Task 2: Write the MCP server

**Files:**
- Create: `scripts/mcp-server.ts`

- [ ] **Step 1: Create the file**

```typescript
import "dotenv/config";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { runAdGroupReport } from "../src/lib/google-ads/ad-group-report";
import { runCampaignKeywords } from "../src/lib/google-ads/campaign-keywords";
import { runChangeHistory } from "../src/lib/google-ads/change-history";
import { runDevicePerformance } from "../src/lib/google-ads/device-performance";
import { runKeywordAnalysisBundle } from "../src/lib/google-ads/keyword-analysis";
import { runQualityScore } from "../src/lib/google-ads/quality-score";
import { runCampaignReport } from "../src/lib/google-ads/report";
import { runSchedulePerformance } from "../src/lib/google-ads/schedule-performance";
import { runSearchTermsReport } from "../src/lib/google-ads/search-terms";

const RANGES = ["last-7-days", "last-4-weeks", "last-3-months", "year-to-date"] as const;
const GRANULARITIES = ["day", "week", "month"] as const;

const rangeSchema = z
  .enum(RANGES)
  .default("last-4-weeks")
  .describe('Date range: "last-7-days" | "last-4-weeks" | "last-3-months" | "year-to-date"');

const forceRefreshSchema = z
  .boolean()
  .optional()
  .default(false)
  .describe("Bypass Redis cache and fetch fresh data from the API");

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
  "Campaign performance summary with optional daily breakdown and demographic data. Returns impressions, clicks, spend, conversions, CTR, CPC, and impression share per campaign plus account totals.",
  {
    range: rangeSchema,
    granularity: z
      .enum(GRANULARITIES)
      .default("day")
      .describe('Time granularity for daily chart: "day" | "week" | "month"'),
    include_daily: z.boolean().optional().default(true).describe("Include day-by-day breakdown with DoD deltas"),
    include_demographics: z
      .boolean()
      .optional()
      .default(false)
      .describe("Include age/gender demographic breakdown"),
    force_refresh: forceRefreshSchema,
  },
  async ({ range, granularity, include_daily, include_demographics, force_refresh }) => {
    try {
      const data = await runCampaignReport({
        range,
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
    months: z
      .number()
      .int()
      .min(1)
      .max(12)
      .optional()
      .default(3)
      .describe("How many months of history to fetch"),
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
    months: z
      .number()
      .int()
      .min(1)
      .max(12)
      .optional()
      .default(3)
      .describe("How many months of history to analyze"),
    campaign: z.string().optional().describe("Filter to a specific campaign by name (partial match)"),
    weight: z
      .enum(["clicks", "cost", "conversions"])
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
    range: rangeSchema,
    force_refresh: forceRefreshSchema,
  },
  async ({ range, force_refresh }) => {
    try {
      const data = await runAdGroupReport({ range, forceRefresh: force_refresh });
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
    range: rangeSchema,
    force_refresh: forceRefreshSchema,
  },
  async ({ range, force_refresh }) => {
    try {
      const data = await runDevicePerformance({ range, forceRefresh: force_refresh });
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
    range: rangeSchema,
    force_refresh: forceRefreshSchema,
  },
  async ({ range, force_refresh }) => {
    try {
      const data = await runQualityScore({ range, forceRefresh: force_refresh });
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
    range: rangeSchema,
    force_refresh: forceRefreshSchema,
  },
  async ({ range, force_refresh }) => {
    try {
      const data = await runSchedulePerformance({ range, forceRefresh: force_refresh });
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

// ─── Start ────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
```

- [ ] **Step 2: Verify typecheck passes**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add scripts/mcp-server.ts package.json pnpm-lock.yaml
git commit -m "feat: add Google Ads MCP server with 9 data tools"
```

---

### Task 3: Register the MCP server

**Files:**
- Create: `.mcp.json`

- [ ] **Step 1: Create `.mcp.json` at the project root**

```json
{
  "mcpServers": {
    "google-ads": {
      "command": "pnpm",
      "args": ["tsx", "scripts/mcp-server.ts"]
    }
  }
}
```

`tsx` runs from the project root, so `dotenv/config` picks up `.env` and relative imports resolve correctly.

- [ ] **Step 2: Commit**

```bash
git add .mcp.json
git commit -m "feat: register google-ads MCP server in .mcp.json"
```

---

### Task 4: Verify the server starts and tools are callable

- [ ] **Step 1: Smoke-test the server process starts without error**

```bash
echo '{}' | pnpm tsx scripts/mcp-server.ts
```

Expected: process starts (no crash). It will wait for MCP input — kill with Ctrl+C after confirming no startup errors.

- [ ] **Step 2: Reload MCP servers in Claude Code**

Open `/mcp` in Claude Code to reload the server list. Confirm `google-ads` appears with 9 tools listed.

- [ ] **Step 3: Test a tool call**

In a Claude Code conversation, ask:

> "Use get_campaign_report with range last-7-days to show me campaign performance"

Expected: Claude calls the tool, the server returns JSON campaign data, Claude summarises it.

If you see an `invalid_grant` error, the refresh token in `.env` needs to be renewed via the OAuth flow at `/api/google-ads/oauth/authorize`.
