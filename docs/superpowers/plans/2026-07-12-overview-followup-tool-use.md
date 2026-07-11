# Overview Follow-up Agentic Tool Use Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the overview follow-up chat (`askOverviewFollowup`) Claude tool-use access to the 8 report functions already used to build the initial analysis, so it can pull live, detailed data (e.g. individual change events with dates/fields) on demand instead of relying solely on the pre-aggregated context baked in at analysis time.

**Architecture:** Define 8 `Tool` objects (Anthropic SDK's `Tool` type) wrapping `runCampaignReport`, `runAdGroupReport`, `runQualityScore`, `runLandingPageReport`, `runKeywordSearchTermMap`, `runAdPerformance`, `runAuctionInsights`, `runChangeHistory` — all scoped to the thread's fixed `dateRange`. Replace `askOverviewFollowup`'s single `messages.create` call with a loop (max 6 round-trips) that executes any requested tool calls, feeds `tool_result` blocks back, and continues until Claude returns a final text answer. Only the final Q&A pair is persisted to `OverviewChatMessage[]`.

**Tech Stack:** `@anthropic-ai/sdk` (already a dependency), no new packages. No test framework in this project — verification is `pnpm typecheck` and `pnpm check`.

## Global Constraints

- No test suite exists in this repo — verification is `pnpm typecheck` and `pnpm check` (Biome), not automated tests.
- Biome: 2-space indent, 120-char line width, double quotes, trailing commas. Import order: `react` → `next/**` → packages → `@/` aliases → relative paths.
- Path alias `@/` resolves to `src/`.
- Tools are scoped to the thread's stored `dateRange` (`thread.analysis.dateRange`) — no tool accepts its own date range parameter, per the spec.
- `get_change_history`'s `days` parameter defaults to 30 and must be capped at 30, matching `runChangeHistory`'s existing behavior in the rest of the codebase (`Math.min(days, 30)` pattern used in `src/app/actions/google-ads.ts`'s `getChangeHistory` action).
- The iteration cap is exactly 6 round-trips (6 calls to `messages.create` within one `askOverviewFollowup` invocation); on hitting the cap, force one final call without tools so Claude must answer in text.
- A failed tool call (thrown error from the underlying lib function) must be returned to Claude as a `tool_result` with `is_error: true` and the error message as content — it must never crash the whole `askOverviewFollowup` call.
- Only the final user question and final assistant text answer are appended to `thread.messages` / persisted via `saveOverviewThread` — intermediate tool-use/tool-result exchanges are not persisted.
- `askOverviewFollowup`'s exported signature must not change: `(dateRange: DateRange, question: string) => Promise<OverviewChatMessage[]>`.
- `thinking: { type: "disabled" }` and `OVERVIEW_MODEL` stay unchanged from the current implementation. `max_tokens: 2048` stays unchanged per call within the loop.
- Only `src/lib/google-ads/overview-analysis.ts` should be modified — no other file touched (no UI changes, no server action changes, no new report sources).

---

### Task 1: Define the follow-up tool schemas and the tool-dispatch function

**Files:**
- Modify: `src/lib/google-ads/overview-analysis.ts` (add near the top, after the existing imports and before `askOverviewFollowup`)

**Interfaces:**
- Consumes: `runCampaignReport` (`src/lib/google-ads/report.ts`), `runAdGroupReport` (`src/lib/google-ads/ad-group-report.ts`), `runQualityScore` (`src/lib/google-ads/quality-score.ts`), `runLandingPageReport` (`src/lib/google-ads/landing-page-report.ts`), `runKeywordSearchTermMap` (`src/lib/google-ads/keyword-search-term-map.ts`), `runAdPerformance` (`src/lib/google-ads/ad-performance.ts`), `runAuctionInsights` (`src/lib/google-ads/auction-insights.ts`), `runChangeHistory` (`src/lib/google-ads/change-history.ts`) — already imported or need new imports in this file (currently only `runAdPerformance`, `runAuctionInsights`, `runChangeHistory`, `runKeywordSearchTermMap`, `runLandingPageReport`, `runQualityScore`, `runCampaignReport` are imported; `runAdGroupReport` needs a new import).
- Produces: `FOLLOWUP_TOOLS: Anthropic.Tool[]` (the 8 tool definitions) and `async function callFollowupTool(name: string, input: unknown, dateRange: DateRange): Promise<unknown>` (throws on unknown tool name or on the underlying lib function throwing — the caller in Task 2 catches and converts to a `tool_result` with `is_error: true`) — both used by Task 2.

- [ ] **Step 1: Add the missing import**

In `src/lib/google-ads/overview-analysis.ts`, add to the existing import block (alphabetically, between `runAdPerformance` and `runAuctionInsights` imports — Biome's import order requires alphabetical within the `@/` group):

```ts
import { runAdGroupReport } from "@/lib/google-ads/ad-group-report";
```

The full top-of-file import block for `@/lib/google-ads/*` should read (alphabetical by path):

```ts
import { runAdGroupReport } from "@/lib/google-ads/ad-group-report";
import { runAdPerformance } from "@/lib/google-ads/ad-performance";
import { runAuctionInsights } from "@/lib/google-ads/auction-insights";
import { runChangeHistory } from "@/lib/google-ads/change-history";
import { runKeywordSearchTermMap } from "@/lib/google-ads/keyword-search-term-map";
import { runLandingPageReport } from "@/lib/google-ads/landing-page-report";
import { runQualityScore } from "@/lib/google-ads/quality-score";
import { runCampaignReport } from "@/lib/google-ads/report";
```

Wait — Biome's `useSortedClasses`/import order sorts by string path, not by imported symbol name. Since these are separate `import { X } from "path"` statements (not a single multi-symbol import), verify the actual required order by running `pnpm check:fix` after Step 2 below rather than hand-sorting; Biome will reorder them automatically if they're wrong. Just add the new import line anywhere within that block for now — Step 3's `pnpm check` will catch and Biome's `--write` can fix ordering if needed.

- [ ] **Step 2: Add the tool schema constant and dispatch function**

Add this block to `src/lib/google-ads/overview-analysis.ts`, placed after the existing imports and before `buildOverviewContext` (or anywhere before its first use in `askOverviewFollowup` — logically grouping it near the top of the file, after imports, is clearest):

```ts
import type Anthropic from "@anthropic-ai/sdk";

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
```

Note: `Anthropic.Tool`'s `input_schema` type requires `type: 'object'` plus a loosely-typed `properties`/`required` — the object literals above satisfy that shape structurally; if `pnpm typecheck` reports a mismatch on the `input_schema` literals (e.g. TypeScript inferring `type: string` instead of the literal `"object"`), add `as const` to each `input_schema` object literal (not just the outer array) to fix it.

- [ ] **Step 3: Verify**

Run: `pnpm typecheck`
Expected: no errors. If there are import-order errors from `pnpm check`, run `pnpm check:fix` to auto-fix, then re-run `pnpm check` to confirm clean.

Run: `pnpm check src/lib/google-ads/overview-analysis.ts`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/google-ads/overview-analysis.ts
git commit -m "feat: define follow-up chat tools wrapping existing report functions"
```

---

### Task 2: Rewrite `askOverviewFollowup` as an agentic tool-use loop

**Files:**
- Modify: `src/lib/google-ads/overview-analysis.ts` (the `askOverviewFollowup` function)

**Interfaces:**
- Consumes: `FOLLOWUP_TOOLS`, `callFollowupTool` (from Task 1, same file); existing `buildFollowupSystemPrompt`, `loadOverviewThread`, `saveOverviewThread`, `getAnthropicClient`, `OVERVIEW_MODEL`, `getRedis` (all already in this file, unchanged).
- Produces: no new exports — `askOverviewFollowup`'s signature `(dateRange: DateRange, question: string) => Promise<OverviewChatMessage[]>` is unchanged. This is the last task in the plan; nothing downstream needs updating (server actions and UI already call this function and are unaffected by the internal rewrite).

- [ ] **Step 1: Replace the function body**

Find the current `askOverviewFollowup` in `src/lib/google-ads/overview-analysis.ts`:

```ts
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

  const history = thread.messages.map((m) => ({ role: m.role, content: m.content }));

  const response = await client.messages.create({
    model: OVERVIEW_MODEL,
    max_tokens: 2048,
    thinking: { type: "disabled" },
    system: buildFollowupSystemPrompt(thread),
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
```

Replace it with:

```ts
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
```

Note on the loop's cap behavior: with `MAX_TOOL_ROUNDS = 6`, rounds `0..4` (5 rounds) include `tools: FOLLOWUP_TOOLS`; round `5` (the 6th and last) omits `tools` entirely, forcing Claude to respond with text only (matching the plan's "final call without tools" requirement — omitting `tools` has the same forcing effect as `tool_choice: { type: "none" }` and is simpler). If Claude stops requesting tools before round 5, the loop breaks early via the `stop_reason !== "tool_use"` check, so the common case is 1-2 rounds, not always 6.

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: no errors. If `Anthropic.MessageParam`, `Anthropic.ToolUseBlock`, or `Anthropic.ToolResultBlockParam` aren't the correct exported type names from the installed `@anthropic-ai/sdk` version, check `node_modules/@anthropic-ai/sdk/resources/messages/messages.d.ts` for the actual exported names (they were confirmed present at the time this plan was written: `MessageParam`, `ToolUseBlock`, `ToolResultBlockParam`, `Tool` are all top-level exports from that file, re-exported as `Anthropic.X`).

Run: `pnpm check src/lib/google-ads/overview-analysis.ts`
Expected: no errors.

- [ ] **Step 3: Manual verification of the loop logic (no test framework available)**

Read through the final code once and confirm:
1. The early-exit condition (`response.stop_reason !== "tool_use" || toolUseBlocks.length === 0`) correctly handles the normal single-round case (Claude answers directly with no tool calls) — `answer` gets set and the loop `break`s on round 0.
2. A failed tool call produces `is_error: true` in its `tool_result`, not a thrown exception that would abort the whole function.
3. Only `question` and `answer` (not `conversation`, which includes tool-use plumbing) are written into `updatedMessages` / persisted.

- [ ] **Step 4: Live smoke test (if `.env`/`.env.local` with real credentials are available)**

1. Start `pnpm dev` (port 3002).
2. Navigate to `/dashboard/overview`, run an analysis for some date range with recent account changes (or use a range you know has changes).
3. Ask a follow-up question like "Which account changes happened in the last 30 days, and could any of them explain a CPA increase?" — confirm the answer cites specific change dates/fields rather than saying it has no visibility.
4. Check the server log/terminal for any thrown errors during the tool-call round trips.
5. Stop the dev server.

If credentials aren't available, skip this step — `pnpm typecheck`/`pnpm check` plus the Step 3 read-through are sufficient given this project's no-test-framework constraint.

- [ ] **Step 5: Commit**

```bash
git add src/lib/google-ads/overview-analysis.ts
git commit -m "feat: rewrite overview follow-up chat as an agentic tool-use loop"
```

---

## Self-Review Notes

- **Spec coverage:** 8 tools wrapping the 8 report functions → Task 1. Tools scoped to thread's date range with campaign/adGroup/days filters matching each function's real signature → Task 1 Step 2. Agentic loop with `tool_use`/`tool_result` round trips → Task 2 Step 1. 6-round cap forcing a final tools-less call → Task 2 Step 1 (`isLastRound` / `MAX_TOOL_ROUNDS`). Failed tool call returns `is_error: true` rather than crashing → Task 2 Step 1 (`try/catch` inside `toolResults` mapping). Only final Q&A persisted, not intermediate tool plumbing → Task 2 Step 1 (`updatedMessages` built from `question`/`answer`, not `conversation`). `askOverviewFollowup` signature unchanged → Task 2 Step 1 (same parameters and return type). No new report sources beyond the existing 8 → Task 1's tool list matches exactly the 8 functions in `buildOverviewContext` plus `runAdGroupReport` (which `buildOverviewContext` doesn't call directly but the design spec's table explicitly includes `get_ad_group_report` as one of the 8 tools — this matches the design doc's table, not `buildOverviewContext`'s current call list, which is correct per spec).
- **Placeholder scan:** no TBD/TODO; every step has literal code.
- **Type consistency:** `callFollowupTool(name: string, input: unknown, dateRange: DateRange): Promise<unknown>` (Task 1) is called with exactly `(block.name, block.input, dateRange)` in Task 2 — matches. `FOLLOWUP_TOOLS: Anthropic.Tool[]` (Task 1) is passed as `tools: FOLLOWUP_TOOLS` in Task 2 — matches the `messages.create` `tools` parameter's expected type.
