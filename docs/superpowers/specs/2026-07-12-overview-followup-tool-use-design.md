# Overview Follow-up: Agentic Tool Use — Design

Date: 2026-07-12

## Goal

The follow-up chat currently answers questions from a fixed, pre-aggregated context (`OverviewContext`) plus the generated summary — both computed once at analysis time. Real usage surfaced a gap: asked to "investigate the 12 recent account changes for correlation with the CPA spike," the model had no access to the actual change events (only a `changeEventCount` number), so it couldn't do the investigation.

Give the follow-up chat Claude tool-use (function calling): let it call the same underlying report functions used to build the initial analysis, live, with whatever filters and detail the specific question needs, instead of relying solely on what was pre-baked into the context at analysis time.

## Current state

`askOverviewFollowup` (`src/lib/google-ads/overview-analysis.ts`) makes one `client.messages.create` call per question: system prompt = `thread.analysis.insights` + `thread.context` (optional, from the prior change), user message = the question, no tools. One round trip, one answer.

## Change

### Tools

Define 8 Claude tools, one per report function already used by `buildOverviewContext`, each scoped to the thread's stored `dateRange` (tools don't accept a date range parameter — they always use the date range the analysis/chat session is for) with function-appropriate filters:

| Tool name | Wraps | Extra params (beyond date range, taken from thread) |
|---|---|---|
| `get_campaign_report` | `runCampaignReport` | `campaign?: string` |
| `get_ad_group_report` | `runAdGroupReport` | `campaign?: string` |
| `get_quality_score` | `runQualityScore` | `campaign?: string` |
| `get_landing_page_report` | `runLandingPageReport` | `campaign?: string` |
| `get_keyword_search_term_map` | `runKeywordSearchTermMap` | `campaign?: string`, `adGroup?: string` |
| `get_ad_performance` | `runAdPerformance` | `campaign?: string`, `adGroup?: string` |
| `get_auction_insights` | `runAuctionInsights` | `campaign?: string` |
| `get_change_history` | `runChangeHistory` | `campaign?: string`, `days?: number` (default 30, capped at 30 — this function takes a trailing day count, not a date range, matching its existing signature) |

Each tool's `input_schema` is a plain JSON Schema object (Anthropic's `Tool` type), built by hand to mirror each function's existing `campaign`/`adGroup`/`days` option names — no new zod dependency needed for this (the MCP server uses zod because the MCP SDK requires it; this is a direct Anthropic SDK `tools` array, which takes JSON Schema directly).

Tool descriptions are written for the model, explaining what data the tool returns and when to use it (e.g. `get_change_history`'s description calls out that it returns individual change events with dates/fields/old-new values, for correlating account changes with metric shifts — directly addressing the gap that motivated this change).

### Agentic loop

Replace the single `messages.create` call in `askOverviewFollowup` with a loop:

1. Call `messages.create` with the system prompt (unchanged: `thread.analysis.insights` + `thread.context` hint), the running `messages` array (history + new question), and the `tools` array.
2. If the response's `stop_reason` is `"tool_use"`: for each `tool_use` content block, look up the matching lib function by tool name, call it with `{ dateRange: thread.analysis.dateRange, campaign: input.campaign ?? null, ... }` (merging the tool's own `campaign`/`adGroup`/`days` input with the fixed date range), and produce a `tool_result` content block (`JSON.stringify(result)` on success; `{ is_error: true, content: message }` on a thrown error — a bad campaign filter or upstream API failure must not crash the whole exchange). Append the assistant's tool-use message and the user-role tool-results message to the running `messages` array, then loop back to step 1.
3. If `stop_reason` is anything else (`"end_turn"`, etc.) or the tool-result content is text: extract the final text block as the answer, exit the loop.
4. **Iteration cap:** after 6 round-trips (6 calls to `messages.create` within one `askOverviewFollowup` invocation), stop looping regardless of `stop_reason` and make one final `messages.create` call with `tool_choice: { type: "none" }` (or by simply omitting `tools`) so Claude is forced to answer in text using whatever it has gathered, rather than requesting a 7th tool call.

### Persistence

Only the final user question and the final assistant text answer are appended to `thread.messages` and saved via `saveOverviewThread` — the same two-entry append as today. Intermediate tool-use/tool-result exchanges within a single question's agentic loop are not persisted; they exist only for the duration of that one `askOverviewFollowup` call. This keeps `OverviewChatMessage[]`'s shape and the Redis payload unchanged from the previous design, and keeps conversation history sent to future questions in this thread readable as a normal back-and-forth (not cluttered with tool call plumbing from prior questions).

### Model config

`thinking: { type: "disabled" }` and `OVERVIEW_MODEL` stay as-is (unchanged from the prior fix). `max_tokens: 2048` stays as-is for each individual call within the loop — tool-use round trips are typically short (a tool request or a final answer), so the existing budget remains appropriate per-call; it is not a total-conversation budget.

## File changes

- `src/lib/google-ads/overview-analysis.ts`: the only file touched. Add a `FOLLOWUP_TOOLS` constant (the 8 tool definitions), a `callFollowupTool(name, input, dateRange)` dispatcher function mapping tool name → lib function call, and rewrite `askOverviewFollowup`'s body to run the loop described above. `askOverviewFollowup`'s exported signature is unchanged: `(dateRange: DateRange, question: string) => Promise<OverviewChatMessage[]>`.

## Out of scope

- No changes to `runOverviewAnalysis`/`generateCampaignInsights` (the initial analysis call) — tool use is only added to the follow-up chat, not the initial per-campaign insight generation.
- No changes to the web UI (`overview-content.tsx`, `overview-chat-panel.tsx`) or server actions (`askOverviewFollowupAction`) — `askOverviewFollowup`'s signature and return shape are unchanged, so callers need no changes.
- No persistence of intermediate tool-call traces (e.g. for debugging/audit) — only final Q&A pairs are stored, per the Persistence section above.
- No new report sources beyond the 8 already used in `buildOverviewContext` — device performance, schedule performance, raw search-terms, ngram analysis, and campaign-keywords tools are not added in this change.
- No change to the Redis TTL or cache-key scheme.
