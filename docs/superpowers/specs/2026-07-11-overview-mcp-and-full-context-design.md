# Overview Follow-up: Full-Context Grounding — Design

Date: 2026-07-11

## Goal

The follow-up chat currently answers questions using only the generated `insights` summary (health/summary/next-steps per campaign) — not the richer per-campaign facts (quality-score bottlenecks, wasted search terms/landing pages, ad strength, competitor domains) that were computed to produce that summary. Persist the full aggregated context so follow-up answers can cite real numbers, not just the summary.

## Current state

`OverviewThread = { analysis: OverviewAnalysis; messages: OverviewChatMessage[] }`. `askOverviewFollowup`'s system prompt serializes only `thread.analysis.insights` (the LLM-generated summary) — the `OverviewContext` (built by `buildOverviewContext`, aggregating campaign/ad-group/quality-score/landing-page/search-term/ad-performance/auction-insight/change-history data) is discarded after `generateCampaignInsights` runs.

## Change

Add a `context: OverviewContext` field to `OverviewThread`. `runOverviewAnalysis` stores it alongside `analysis` when it builds a fresh thread. `askOverviewFollowup`'s system prompt serializes `thread.context.campaigns` (the full per-campaign aggregate — spend, conversions, CPA, CTR, impression share, lost IS, quality-score bottleneck counts, top wasted landing pages/search terms, ad-strength counts, top competitor domains, change-event count) instead of just the insights array, in addition to the insights themselves (both are useful: insights give the LLM's own prior conclusions to stay consistent with, context gives the underlying numbers to answer more specific questions).

No new Google Ads API calls are introduced — `OverviewContext` is already computed once per analysis run; this only changes what gets persisted and what the follow-up prompt includes.

## Redis/size impact

`OverviewContext` is already bounded (top-5 waste rows, top-3 competitors per campaign, aggregate counts — no raw per-row dumps), so the added Redis payload size is modest, consistent with the existing 1-hour TTL and cache-key scheme (no change to `overviewRedisKey`/TTL).

## Backward compatibility

Existing cached `OverviewThread` values in Redis (written before this change) won't have a `context` field. `askOverviewFollowup` must handle `thread.context` being `undefined` (treat as "no additional context available" in the prompt rather than crashing) since Redis entries can outlive a deploy within their 1-hour TTL.

## Out of scope

- No changes to the web UI (`overview-content.tsx`, `overview-chat-panel.tsx`) — they already call the same underlying `runOverviewAnalysis`/`askOverviewFollowup` functions via server actions and will automatically benefit from this richer grounding with no code change.
- No new Google Ads API calls beyond what `buildOverviewContext` already makes.
- No change to the Redis TTL, key scheme, or the "manual Analyze button only" trigger behavior.
- No MCP tools, CLAUDE.md tool-table changes, or other external-interface exposure — out of scope for this change.
