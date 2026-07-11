# Overview Follow-up Full-Context Grounding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist the full aggregated `OverviewContext` alongside the generated insights in the Redis-stored `OverviewThread`, and have the follow-up chat's system prompt ground its answers in that full context (not just the narrow insights summary), while staying backward-compatible with thread entries already cached before this change.

**Architecture:** Add a `context: OverviewContext` field to the `OverviewThread` type. `runOverviewAnalysis` (which already builds an `OverviewContext` via `buildOverviewContext` before calling Claude) stores that same object on the thread it persists. `askOverviewFollowup` reads `thread.context` (which may be `undefined` for pre-existing cached threads) and includes it in the system prompt alongside the existing `insights` summary.

**Tech Stack:** TypeScript, no new dependencies. No test framework in this project — verification is `pnpm typecheck` and `pnpm check`.

## Global Constraints

- No test suite exists in this repo — verification is `pnpm typecheck` and `pnpm check` (Biome), not automated tests.
- Biome: 2-space indent, 120-char line width, double quotes, trailing commas. Import order: `react` → `next/**` → packages → `@/` aliases → relative paths.
- Path alias `@/` resolves to `src/`.
- No new Google Ads API calls may be introduced — `OverviewContext` is already computed once per analysis run in `buildOverviewContext`; this plan only changes what's persisted and what the follow-up prompt includes.
- No change to the Redis TTL (`OVERVIEW_TTL_SECONDS = 60 * 60`), the cache-key scheme (`overviewRedisKey`/`buildCacheKey("overview", dateRange)`), or the "manual Analyze button only" trigger behavior in the UI.
- `thread.context` must be treated as possibly `undefined` in `askOverviewFollowup` (existing Redis entries written before this change won't have it) — must not crash, must degrade gracefully in the prompt.
- No changes to the web UI (`overview-content.tsx`, `overview-chat-panel.tsx`) — they consume the same server actions and benefit from this automatically.
- No MCP tools, CLAUDE.md tool-table changes, or other external-interface exposure — explicitly out of scope.

---

### Task 1: Add `context` field to `OverviewThread` and persist it in `runOverviewAnalysis`

**Files:**
- Modify: `src/types/google-ads.ts:578-581` (the `OverviewThread` interface)
- Modify: `src/lib/google-ads/overview-analysis.ts` (the `runOverviewAnalysis` function)

**Interfaces:**
- Consumes: existing `OverviewContext` type (`src/types/google-ads.ts`, already defined, produced by the existing `buildOverviewContext` function in `src/lib/google-ads/overview-analysis.ts`).
- Produces: `OverviewThread.context: OverviewContext` (required field) — used by Task 2's `askOverviewFollowup`.

- [ ] **Step 1: Add the `context` field to the type**

In `src/types/google-ads.ts`, change:

```ts
export interface OverviewThread {
  analysis: OverviewAnalysis;
  messages: OverviewChatMessage[];
}
```

to:

```ts
export interface OverviewThread {
  analysis: OverviewAnalysis;
  /** Full per-campaign aggregate data (spend, QS bottlenecks, waste, competitors, etc.) the analysis was generated from — used to ground follow-up chat answers in specifics beyond the summary. Absent on threads cached before this field was added. */
  context?: OverviewContext;
  messages: OverviewChatMessage[];
}
```

Note: the field is optional (`context?:`) on the type itself, not required, precisely because pre-existing Redis-cached threads won't have it — this is the mechanism for backward compatibility, not a separate migration.

- [ ] **Step 2: Store the context when a fresh thread is built**

In `src/lib/google-ads/overview-analysis.ts`, find `runOverviewAnalysis`:

```ts
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
```

Change the `thread` construction to include `context`:

```ts
  const thread: OverviewThread = {
    analysis: { generatedAt: new Date().toISOString(), dateRange, insights },
    context,
    messages: [],
  };
```

The rest of the function is unchanged — `context` (the local variable already computed via `buildOverviewContext`) is now also stored on the thread object, not just used transiently to call `generateCampaignInsights`.

- [ ] **Step 3: Verify**

Run: `pnpm typecheck`
Expected: no errors. (`context` is in scope in `runOverviewAnalysis` already — no new import needed.)

Run: `pnpm check src/types/google-ads.ts src/lib/google-ads/overview-analysis.ts`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/types/google-ads.ts src/lib/google-ads/overview-analysis.ts
git commit -m "feat: persist full OverviewContext alongside generated insights"
```

---

### Task 2: Ground the follow-up chat prompt in the full context, with backward compatibility

**Files:**
- Modify: `src/lib/google-ads/overview-analysis.ts` (the `askOverviewFollowup` function)

**Interfaces:**
- Consumes: `OverviewThread.context` (optional, from Task 1) and the existing `OverviewThread.analysis.insights`.
- Produces: no new exports — `askOverviewFollowup`'s exported signature `(dateRange: DateRange, question: string) => Promise<OverviewChatMessage[]>` is unchanged; only its internal system prompt construction changes. Nothing downstream (server actions, UI) requires changes.

- [ ] **Step 1: Update the system prompt construction**

In `src/lib/google-ads/overview-analysis.ts`, find `askOverviewFollowup`'s Claude call:

```ts
  const response = await client.messages.create({
    model: OVERVIEW_MODEL,
    max_tokens: 2048,
    thinking: { type: "disabled" },
    system: `You are a Google Ads performance analyst. The user previously received this per-campaign \
analysis (JSON): ${JSON.stringify(thread.analysis.insights)}. Answer their follow-up questions grounded \
strictly in this data. If asked about something not covered by the data, say so plainly rather than \
guessing.`,
    messages: [...history, { role: "user" as const, content: question }],
  });
```

Replace the inline `system` string construction with a small helper and updated prompt that includes `thread.context` when present. Add this function above `askOverviewFollowup` (or directly above its use — place it right before the `askOverviewFollowup` function definition):

```ts
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
```

Then change the `messages.create` call's `system` field to:

```ts
    system: buildFollowupSystemPrompt(thread),
```

The full updated call:

```ts
  const response = await client.messages.create({
    model: OVERVIEW_MODEL,
    max_tokens: 2048,
    thinking: { type: "disabled" },
    system: buildFollowupSystemPrompt(thread),
    messages: [...history, { role: "user" as const, content: question }],
  });
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: no errors. `OverviewThread` is already imported in this file (used elsewhere as the return type of `loadOverviewThread`/`runOverviewAnalysis`) — no new import needed.

Run: `pnpm check src/lib/google-ads/overview-analysis.ts`
Expected: no errors.

- [ ] **Step 3: Manual verification of backward compatibility**

This project has no test framework, so verify the `thread.context` undefined case by reading the code path rather than running a test: confirm `buildFollowupSystemPrompt` only reads `thread.context` through the `thread.context ? ... : ...` ternary (never accessed unconditionally elsewhere in the function), so a thread loaded from Redis without a `context` field (pre-existing cache entries) produces the fallback string instead of throwing.

- [ ] **Step 4: Live smoke test (optional, if `.env`/`.env.local` with real credentials are available)**

If you have Google Ads + Redis + `ANTHROPIC_API_KEY` credentials available in this checkout's `.env`/`.env.local`:

1. Start `pnpm dev` (port 3002 per `package.json`).
2. Navigate to `/dashboard/overview`, click "Analyze" for some date range.
3. Ask a follow-up question that requires a specific fact only present in `OverviewContext` (e.g. "which landing page is wasting the most spend?") and confirm the answer cites a real URL/number rather than a generic non-answer.
4. Stop the dev server.

If credentials aren't available, skip this step — `pnpm typecheck`/`pnpm check` plus the code-path read-through in Step 3 are sufficient given this project's no-test-framework constraint.

- [ ] **Step 5: Commit**

```bash
git add src/lib/google-ads/overview-analysis.ts
git commit -m "feat: ground overview follow-up chat in full per-campaign context"
```

---

## Self-Review Notes

- **Spec coverage:** "Add a `context: OverviewContext` field to `OverviewThread`" → Task 1 Step 1. "`runOverviewAnalysis` stores it alongside `analysis`" → Task 1 Step 2. "`askOverviewFollowup`'s system prompt serializes `thread.context.campaigns` ... in addition to the insights themselves" → Task 2 Step 1. "Handle `thread.context` being `undefined`" → Task 1 Step 1 (optional field) + Task 2 Step 1 (ternary fallback) + Task 2 Step 3 (verification). "No new Google Ads API calls" → satisfied structurally: Task 1 only stores an already-computed local variable, introduces no new fetch calls. "No change to Redis TTL/key scheme" → neither task touches `OVERVIEW_TTL_SECONDS` or `overviewRedisKey`. "No web UI changes" → neither task touches `overview-content.tsx`/`overview-chat-panel.tsx`.
- **Placeholder scan:** no TBD/TODO; every step has literal code.
- **Type consistency:** `OverviewThread.context?: OverviewContext` (Task 1) is the exact type read by `buildFollowupSystemPrompt(thread: OverviewThread)` (Task 2) — matches. `askOverviewFollowup`'s exported signature is unchanged, so no downstream task/caller needs updating (there are none in this plan — it's the terminal consumer).
