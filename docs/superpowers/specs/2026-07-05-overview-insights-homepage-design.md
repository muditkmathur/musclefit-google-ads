# Overview / Insights Homepage — Design

Date: 2026-07-05

## Goal

A new dashboard page that becomes the app's homepage. It aggregates data from all
existing Google Ads report sources for the selected (global) date range, asks Claude
to produce a per-campaign performance summary with prioritized next steps, and lets
the user ask follow-up questions in a chat panel grounded in that same data.

## Route & navigation

- New page: `src/app/(main)/dashboard/overview/page.tsx`.
- New sidebar entry "Overview" (or similar), placed first in the Google Ads group.
- `src/app/(main)/dashboard/page.tsx` redirect target changes from `/dashboard/campaigns`
  to `/dashboard/overview`, making this the effective homepage. `/dashboard/campaigns`
  remains fully reachable from the sidebar as before.

## Date range

Reuses the existing global filters store (`src/stores/filters/filters-store.ts`) and
the nav bar's `NavDateRangePicker` — no separate/local date picker on this page.

## Data aggregation

New function `runOverviewAnalysis(dateRange, { forceRefresh })` in
`src/lib/google-ads/overview-analysis.ts`:

1. Calls all existing report functions in parallel for the given date range:
   `runCampaignReport`, `runAdGroupReport`, `runQualityScore`, `runDevicePerformance`,
   `runSchedulePerformance`, `runLandingPageReport`, `runKeywordSearchTermMap`,
   `runAdPerformance`, `runAuctionInsights`, `runChangeHistory`.
2. Each of these already goes through the existing Redis cache-aside
   (`getOrSetJson`) inside its own module, so this step doesn't add a new caching
   layer for the raw reports — it just fans out to what's already cached/fetched.
3. Reduces the combined results into a compact per-campaign JSON summary (aggregate
   numbers and flags only, not raw row-level data) suitable for an LLM prompt —
   roughly: spend, conversions, CPA, CTR, impression share components, QS
   distribution/bottlenecks, top waste flags from landing pages and search terms,
   ad strength, and notable auction-insight competitors, per campaign.
4. Sends this summary to Claude (model `claude-sonnet-5` via `@anthropic-ai/sdk`)
   with a system prompt instructing it to return structured JSON: one entry per
   campaign with a health label, a short summary, and a prioritized list of next
   steps.
5. Parses the model's JSON response into typed `CampaignInsight[]`.

## Persistence (Redis)

The **analysis result and the chat thread** for a given date range are persisted in
Redis, keyed via the existing `buildCacheKey("overview", dateRange)` helper:

- `ga:overview:<hash>` → `{ analysis: CampaignInsight[], generatedAt, messages: OverviewChatMessage[] }`
- TTL: same `CACHE_TTL_SECONDS` default (1 hour) used elsewhere, refreshed on each
  write (new message or re-analysis).
- On page load for a given date range: if a Redis entry exists, hydrate the page
  from it (skip calling Claude). The user must press "Analyze" to force a fresh
  Claude call (passes `forceRefresh: true`, which also clears prior chat history for
  that date range since the underlying analysis changed).
- If Redis is unavailable (as elsewhere in this codebase), the feature still works
  but nothing persists across reloads — same fail-open behavior as `query-cache.ts`.

## Server actions (`src/app/actions/google-ads.ts`)

- `runOverviewAnalysisAction(dateRange, forceRefresh)` → `ActionResult<OverviewAnalysis>`
  — runs aggregation + Claude call, or returns cached Redis result if present and
  `forceRefresh` is false.
- `askOverviewFollowupAction(dateRange, question)` → `ActionResult<OverviewChatMessage[]>`
  — loads the persisted analysis + prior messages for that date range from Redis,
  sends the full data context + conversation history + new question to Claude,
  appends the exchange to the Redis-stored message list, returns the updated list.

## Types (`src/types/google-ads.ts`)

```ts
export type CampaignHealth = "on-track" | "needs-attention" | "at-risk";

export interface CampaignInsight {
  campaignId: string;
  campaignName: string;
  health: CampaignHealth;
  summary: string;
  nextSteps: string[];
}

export interface OverviewAnalysis {
  generatedAt: string; // ISO timestamp
  insights: CampaignInsight[];
}

export interface OverviewChatMessage {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface OverviewThread {
  analysis: OverviewAnalysis;
  messages: OverviewChatMessage[];
}
```

## UI (`src/app/(main)/dashboard/overview/_components/`)

- `overview-page.tsx` — client component, top-level: "Analyze" button (loading
  state, disabled while pending), campaign insight cards, chat panel. Uses the
  global date range from the filters store; re-fetches Redis-backed state when the
  date range changes (no auto-analysis).
- `campaign-insight-card.tsx` — campaign name, health badge, summary text, bulleted
  next steps.
- `overview-chat-panel.tsx` — message list + input box, calls
  `askOverviewFollowupAction` on submit, appends the returned messages.

## Environment / dependencies

- New package: `@anthropic-ai/sdk`.
- New env var: `ANTHROPIC_API_KEY` (required for this feature only; documented in
  CLAUDE.md's environment variables table).

## Error handling

Follows the existing `ActionResult<T>` convention — Claude API errors, missing
`ANTHROPIC_API_KEY`, and malformed JSON responses from the model all surface as
`{ ok: false, error: string }` with a human-readable message, same pattern as
existing Google Ads error normalization.

## Out of scope

- No changes to the Google Ads report modules themselves beyond calling their
  existing exported functions.
- No multi-turn campaign-scoped chats — one chat thread per date range, covering
  all campaigns.
- No streaming responses for the initial version — chat replies render once
  complete.
