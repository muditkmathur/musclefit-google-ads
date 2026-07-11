# Overview Follow-up: Full-Context Grounding + MCP Tools — Design

Date: 2026-07-11

## Goal

Two related improvements to the "overview insights" feature shipped previously:

1. **Expand follow-up chat grounding.** The follow-up chat currently answers questions using only the generated `insights` summary (health/summary/next-steps per campaign) — not the richer per-campaign facts (quality-score bottlenecks, wasted search terms/landing pages, ad strength, competitor domains) that were computed to produce that summary. Persist the full aggregated context so follow-up answers can cite real numbers, not just the summary.
2. **Expose the feature as MCP tools.** Everything the Overview web page can do — run the analysis, ask a follow-up, read the cached thread — should also be callable from any MCP client (Cursor, Claude Code), matching the existing pattern in `scripts/mcp-server.ts` for every other report.

## Part A: Persist full context for chat grounding

### Current state
`OverviewThread = { analysis: OverviewAnalysis; messages: OverviewChatMessage[] }`. `askOverviewFollowup`'s system prompt serializes only `thread.analysis.insights` (the LLM-generated summary) — the `OverviewContext` (built by `buildOverviewContext`, aggregating campaign/ad-group/quality-score/landing-page/search-term/ad-performance/auction-insight/change-history data) is discarded after `generateCampaignInsights` runs.

### Change
Add a `context: OverviewContext` field to `OverviewThread`. `runOverviewAnalysis` stores it alongside `analysis` when it builds a fresh thread. `askOverviewFollowup`'s system prompt serializes `thread.context.campaigns` (the full per-campaign aggregate — spend, conversions, CPA, CTR, impression share, lost IS, quality-score bottleneck counts, top wasted landing pages/search terms, ad-strength counts, top competitor domains, change-event count) instead of just the insights array, in addition to the insights themselves (both are useful: insights give the LLM's own prior conclusions to stay consistent with, context gives the underlying numbers to answer more specific questions).

No new Google Ads API calls are introduced — `OverviewContext` is already computed once per analysis run; this only changes what gets persisted and what the follow-up prompt includes.

### Redis/size impact
`OverviewContext` is already bounded (top-5 waste rows, top-3 competitors per campaign, aggregate counts — no raw per-row dumps), so the added Redis payload size is modest, consistent with the existing 1-hour TTL and cache-key scheme (no change to `overviewRedisKey`/TTL).

### Backward compatibility
Existing cached `OverviewThread` values in Redis (written before this change) won't have a `context` field. `askOverviewFollowup` must handle `thread.context` being `undefined` (treat as "no additional context available" in the prompt rather than crashing) since Redis entries can outlive a deploy within their 1-hour TTL.

## Part B: MCP tools

Add three tools to `scripts/mcp-server.ts`, following the file's existing conventions (`startDateSchema`/`endDateSchema`/`forceRefreshSchema`, `ok()`/`fail()` helpers, try/catch per tool):

### `get_overview_analysis`
Wraps `runOverviewAnalysis`. Runs the full aggregation + Claude call (or returns the cached thread if one exists and `force_refresh` is false — same semantics as the web UI's Analyze button).

- Input: `start_date`, `end_date`, `force_refresh` (existing shared schemas)
- Output: the full `OverviewThread` (`analysis` + `context` + `messages`)
- Description: "Runs (or returns cached) per-campaign AI performance analysis: health label, summary, and prioritized next steps for every campaign in the date range, grounded in campaign/ad-group/quality-score/landing-page/search-term/ad-performance/auction-insight/change-history data. Expensive (calls Claude) unless a cached result exists for this exact date range."

### `ask_overview_followup`
Wraps `askOverviewFollowup`.

- Input: `start_date`, `end_date`, `question: z.string().min(1)`
- Output: the updated `OverviewChatMessage[]` (full conversation so far)
- Description: "Ask a follow-up question about a previously-run overview analysis (see get_overview_analysis), grounded in that analysis's per-campaign data. Throws if no analysis exists yet for this date range — run get_overview_analysis first."
- Errors (missing thread, Redis unavailable) surface via the existing `fail()` helper, same as every other tool.

### `get_overview_thread`
Wraps `loadOverviewThread`. Cheap, read-only — never calls Claude.

- Input: `start_date`, `end_date`
- Output: `OverviewThread | null`
- Description: "Reads the cached overview analysis + chat history for a date range without triggering a new Claude call. Returns null if no analysis has been run yet for this range."

### Documentation
Add all three to CLAUDE.md's MCP server tool table, in the same row format as the existing 13 tools (`get_overview_analysis` | `runOverviewAnalysis`, etc.).

## Out of scope

- No changes to the web UI (`overview-content.tsx`, `overview-chat-panel.tsx`) — they already call the same underlying `runOverviewAnalysis`/`askOverviewFollowup` functions via server actions and will automatically benefit from Part A's richer grounding with no code change.
- No new Google Ads API calls beyond what `buildOverviewContext` already makes.
- No change to the Redis TTL, key scheme, or the "manual Analyze button only" trigger behavior.
- No streaming responses for the MCP tools (matches the rest of the MCP server, which is all request/response).
