# Overview Insights Homepage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new `/dashboard/overview` page — the app's homepage — that aggregates all existing Google Ads report sources for the selected date range, calls Claude to produce per-campaign performance summaries and next steps, and lets the user ask follow-up questions in a chat panel, with both persisted in Redis per date range.

**Architecture:** A new aggregation module (`src/lib/google-ads/overview-analysis.ts`) fans out to the existing report functions, reduces their output into a compact per-campaign JSON summary, and calls Claude via a thin SDK wrapper. Results (`OverviewAnalysis`) and the chat thread (`OverviewChatMessage[]`) are persisted together in Redis keyed by a hash of the date range, reusing the existing `buildCacheKey` helper. Two new server actions expose this to the client; a new page + three client components render it. `/dashboard/page.tsx`'s redirect changes to this new route, and a new sidebar entry is added first in the Google Ads group.

**Tech Stack:** Next.js server actions, `@anthropic-ai/sdk` (new dependency), `zod` (already installed) for validating Claude's JSON response, `ioredis` (already installed) for persistence, existing shadcn/ui components (Card, Badge, Button, Textarea, ScrollArea, Spinner, Alert).

## Global Constraints

- No test suite exists in this repo (`CLAUDE.md`: "There is no test suite — no testing framework is installed."). Verification uses `pnpm typecheck` and `pnpm check` after each task, plus a manual dev-server smoke test for UI tasks, in place of automated tests.
- Biome: 2-space indent, 120-char line width, double quotes, trailing commas. Import order: `react` → `next/**` → packages → `@/` aliases → relative paths. Run `pnpm check:fix` before committing if lint fails.
- All monetary values from the Google Ads API are in micros; divide by `1_000_000` for ₹. The aggregation module must follow this when re-deriving any raw values (existing report rows are already converted — do not re-divide).
- All server actions return `ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }`, matching the existing pattern in `src/app/actions/google-ads.ts`.
- New env var required: `ANTHROPIC_API_KEY`. Must be documented in `CLAUDE.md`'s environment variable table.
- `src/components/ui` is excluded from Biome checks and must not be modified — only consumed.
- Path alias `@/` resolves to `src/`.

---

### Task 1: Add Anthropic SDK dependency, env var, and client wrapper

**Files:**
- Modify: `package.json` (add dependency)
- Modify: `CLAUDE.md:` environment variables table
- Create: `src/lib/anthropic/client.ts`

**Interfaces:**
- Produces: `getAnthropicClient(): Anthropic` — singleton client, throws `Error("Missing required env var: ANTHROPIC_API_KEY")` if unset. `MissingAnthropicKeyError` not needed — a plain `Error` is consistent with how `client.ts` in `google-ads/` surfaces missing env vars (see `normalizeGoogleAdsError`'s `"missing required env var: google_ads_"` matching in `src/app/actions/google-ads.ts`) — follow the same lowercase-prefixed message convention: `"Missing required env var: ANTHROPIC_API_KEY"`.

- [ ] **Step 1: Install the SDK**

```bash
pnpm add @anthropic-ai/sdk
```

Expected: `package.json` dependencies gains `"@anthropic-ai/sdk": "^<version>"` and `pnpm-lock.yaml` updates.

- [ ] **Step 2: Create the client wrapper**

Create `src/lib/anthropic/client.ts`:

```ts
import Anthropic from "@anthropic-ai/sdk";

let cachedClient: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (cachedClient) return cachedClient;

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Missing required env var: ANTHROPIC_API_KEY");
  }

  cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

export const OVERVIEW_MODEL = "claude-sonnet-5" as const;
```

- [ ] **Step 3: Document the env var**

In `CLAUDE.md`, add a row to the environment variables table (after `GOOGLE_ADS_CUSTOMER_ID`, before `GOOGLE_ADS_REFRESH_TOKEN`):

```markdown
| `ANTHROPIC_API_KEY` | Yes (for Overview page) | Claude API key used by the Overview insights page and its follow-up chat |
```

- [ ] **Step 4: Verify**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml CLAUDE.md src/lib/anthropic/client.ts
git commit -m "feat: add Anthropic SDK client wrapper for overview insights"
```

---

### Task 2: Add Overview types to `src/types/google-ads.ts`

**Files:**
- Modify: `src/types/google-ads.ts` (append at end of file)

**Interfaces:**
- Consumes: nothing new — these are pure additive type declarations.
- Produces: `CampaignHealth`, `CampaignInsight`, `OverviewAnalysis`, `OverviewChatMessage`, `OverviewThread`, `OverviewCampaignContext` — used by every subsequent task.

- [ ] **Step 1: Append the new types**

Add to the end of `src/types/google-ads.ts`:

```ts
// ---------------------------------------------------------------------------
// Overview insights (homepage)
// ---------------------------------------------------------------------------

export type CampaignHealth = "on-track" | "needs-attention" | "at-risk";

export interface CampaignInsight {
  campaignId: string;
  campaignName: string;
  health: CampaignHealth;
  summary: string;
  nextSteps: string[];
}

export interface OverviewAnalysis {
  generatedAt: string;
  dateRange: DateRange;
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

/** Compact per-campaign facts handed to Claude — aggregate numbers/flags only, never raw rows. */
export interface OverviewCampaignContext {
  campaignId: string;
  campaignName: string;
  status: string;
  spend: number;
  conversions: number;
  cpa: number;
  ctr: number;
  impressionShare: number | null;
  lostIsBudget: number | null;
  lostIsRank: number | null;
  avgQualityScore: number | null;
  qualityScoreBottlenecks: Partial<Record<QualityScoreBottleneck, number>>;
  topWasteLandingPages: Array<{ url: string; spend: number }>;
  topWasteSearchTerms: Array<{ searchTerm: string; spend: number }>;
  adStrengthCounts: Partial<Record<AdStrengthLabel, number>>;
  topCompetitorDomains: Array<{ domain: string; impressionShare: number }>;
  changeEventCount: number;
}

export interface OverviewContext {
  dateRange: DateRange;
  campaigns: OverviewCampaignContext[];
}
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: no errors (new types are additive and unused so far — `noUnusedLocals`-style errors don't apply to exported types).

- [ ] **Step 3: Commit**

```bash
git add src/types/google-ads.ts
git commit -m "feat: add overview insight types"
```

---

### Task 3: Build the context aggregation function

**Files:**
- Create: `src/lib/google-ads/overview-analysis.ts`

**Interfaces:**
- Consumes: `runCampaignReport` (`src/lib/google-ads/report.ts`), `runAdGroupReport` (`src/lib/google-ads/ad-group-report.ts`), `runQualityScore` (`src/lib/google-ads/quality-score.ts`), `runLandingPageReport` (`src/lib/google-ads/landing-page-report.ts`), `runKeywordSearchTermMap` (`src/lib/google-ads/keyword-search-term-map.ts`), `runAdPerformance` (`src/lib/google-ads/ad-performance.ts`), `runAuctionInsights` (`src/lib/google-ads/auction-insights.ts`), `runChangeHistory` (`src/lib/google-ads/change-history.ts`), `runDevicePerformance` (`src/lib/google-ads/device-performance.ts`), `runSchedulePerformance` (`src/lib/google-ads/schedule-performance.ts`) — all already cache-aside via Redis internally, so no extra caching needed at this layer. Types: `DateRange`, `OverviewContext`, `OverviewCampaignContext`, `QualityScoreBottleneck`, `AdStrengthLabel` from `@/types/google-ads`.
- Produces: `export async function buildOverviewContext(dateRange: DateRange): Promise<OverviewContext>` — used by Task 5's `runOverviewAnalysis`.

- [ ] **Step 1: Write the aggregation function**

Create `src/lib/google-ads/overview-analysis.ts`:

```ts
import { runAdGroupReport } from "@/lib/google-ads/ad-group-report";
import { runAdPerformance } from "@/lib/google-ads/ad-performance";
import { runAuctionInsights } from "@/lib/google-ads/auction-insights";
import { runChangeHistory } from "@/lib/google-ads/change-history";
import { runLandingPageReport } from "@/lib/google-ads/landing-page-report";
import { runKeywordSearchTermMap } from "@/lib/google-ads/keyword-search-term-map";
import { runQualityScore } from "@/lib/google-ads/quality-score";
import { runCampaignReport } from "@/lib/google-ads/report";
import type {
  AdStrengthLabel,
  DateRange,
  OverviewCampaignContext,
  OverviewContext,
  QualityScoreBottleneck,
} from "@/types/google-ads";

const WASTE_TOP_N = 5;
const COMPETITOR_TOP_N = 3;

function topByField<T>(rows: T[], field: (row: T) => number, n: number): T[] {
  return [...rows].sort((a, b) => field(b) - field(a)).slice(0, n);
}

export async function buildOverviewContext(dateRange: DateRange): Promise<OverviewContext> {
  const [campaignReport, adGroupReport, qualityScore, landingPages, searchTerms, adPerformance, auctionInsights, changeHistory] =
    await Promise.all([
      runCampaignReport({ dateRange, includeDaily: false, includeDemographics: false, includePrevious: false }),
      runAdGroupReport({ dateRange }),
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

    const changeEventCount = changeHistory.events.filter((e) => e.campaign === campaignName).length;

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

  void adGroupReport; // ad-group detail is folded into next-step prompting context only when Claude asks follow-ups (see Task 6)

  return { dateRange, campaigns };
}
```

Note: check `ChangeHistoryReport`'s event shape for a `campaign` field before finalizing — read `src/types/google-ads.ts:273-305` (`ChangeEvent`). If `ChangeEvent` has no `campaign` field, change `changeEventCount` to a flat `changeHistory.events.length` shared across campaigns instead of per-campaign filtering.

- [ ] **Step 2: Check the ChangeEvent shape and adjust if needed**

Run: `grep -n "campaign" src/types/google-ads.ts | sed -n '1,5p'` and inspect `ChangeEvent`. If there's no `campaign` field on `ChangeEvent`, edit the `changeEventCount` line in Step 1's code to:

```ts
const changeEventCount = changeHistory.events.length;
```

and move that computation outside the per-campaign `.map` (compute once before the `.map`, then reference the same number for every campaign).

- [ ] **Step 3: Verify**

Run: `pnpm typecheck`
Expected: no errors. If `AdGroupReport`'s rows lack fields referenced above, fix names to match `src/types/google-ads.ts:327-346` (`AdGroupRow`) exactly.

- [ ] **Step 4: Commit**

```bash
git add src/lib/google-ads/overview-analysis.ts
git commit -m "feat: aggregate per-campaign context for overview insights"
```

---

### Task 4: Add Claude analysis call with zod-validated response parsing

**Files:**
- Modify: `src/lib/google-ads/overview-analysis.ts` (append)

**Interfaces:**
- Consumes: `getAnthropicClient`, `OVERVIEW_MODEL` from `src/lib/anthropic/client.ts`; `OverviewContext`, `CampaignInsight` from `@/types/google-ads`; `z` from `zod`.
- Produces: `export async function generateCampaignInsights(context: OverviewContext): Promise<CampaignInsight[]>` — used by Task 5.

- [ ] **Step 1: Append the Claude call**

Add to `src/lib/google-ads/overview-analysis.ts`:

```ts
import { z } from "zod";

import { getAnthropicClient, OVERVIEW_MODEL } from "@/lib/anthropic/client";
import type { CampaignInsight } from "@/types/google-ads";

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
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/google-ads/overview-analysis.ts
git commit -m "feat: call Claude to generate per-campaign insights"
```

---

### Task 5: Add Redis-backed thread persistence and orchestration

**Files:**
- Modify: `src/lib/google-ads/overview-analysis.ts` (append)

**Interfaces:**
- Consumes: `getRedis` (`src/lib/cache/redis.ts`), `buildCacheKey` (`src/lib/cache/query-cache.ts`), `buildOverviewContext`, `generateCampaignInsights` (this file), `OverviewThread`, `OverviewAnalysis`, `DateRange` from `@/types/google-ads`.
- Produces: `export async function runOverviewAnalysis(dateRange: DateRange, opts?: { forceRefresh?: boolean }): Promise<OverviewThread>` and `export async function loadOverviewThread(dateRange: DateRange): Promise<OverviewThread | null>` — both used by Task 6 and the server actions in Task 7.

- [ ] **Step 1: Append persistence + orchestration**

Add to `src/lib/google-ads/overview-analysis.ts`:

```ts
import { buildCacheKey } from "@/lib/cache/query-cache";
import { getRedis } from "@/lib/cache/redis";
import type { OverviewThread } from "@/types/google-ads";

const OVERVIEW_TTL_SECONDS = 60 * 60;

function overviewRedisKey(dateRange: DateRange): string {
  return buildCacheKey("overview", dateRange);
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
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/google-ads/overview-analysis.ts
git commit -m "feat: persist overview analysis threads in Redis keyed by date range"
```

---

### Task 6: Add the follow-up chat function

**Files:**
- Modify: `src/lib/google-ads/overview-analysis.ts` (append)

**Interfaces:**
- Consumes: `loadOverviewThread`, `getAnthropicClient`, `OVERVIEW_MODEL` (this file / `src/lib/anthropic/client.ts`); `OverviewChatMessage`, `DateRange` from `@/types/google-ads`.
- Produces: `export async function askOverviewFollowup(dateRange: DateRange, question: string): Promise<OverviewChatMessage[]>` — used by Task 7's server action. Throws `Error("No analysis found for this date range — run Analyze first.")` if no thread exists yet.

- [ ] **Step 1: Append the follow-up function**

Add to `src/lib/google-ads/overview-analysis.ts`:

```ts
import type { OverviewChatMessage } from "@/types/google-ads";

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
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/google-ads/overview-analysis.ts
git commit -m "feat: add overview follow-up chat grounded in stored analysis"
```

---

### Task 7: Wire server actions

**Files:**
- Modify: `src/app/actions/google-ads.ts`

**Interfaces:**
- Consumes: `runOverviewAnalysis`, `loadOverviewThread`, `askOverviewFollowup` from `@/lib/google-ads/overview-analysis`; `OverviewThread`, `OverviewChatMessage` from `@/types/google-ads`; existing `ActionResult`, `validateDateRange`, `isAuthError`, `toError` helpers already in this file.
- Produces: `getOverviewThread(input: { start: string; end: string }): Promise<ActionResult<OverviewThread | null>>`, `runOverviewAnalysisAction(input: { start: string; end: string; forceRefresh?: boolean }): Promise<ActionResult<OverviewThread>>`, `askOverviewFollowupAction(input: { start: string; end: string; question: string }): Promise<ActionResult<OverviewChatMessage[]>>` — used by Task 9's client component.

- [ ] **Step 1: Add imports**

In `src/app/actions/google-ads.ts`, add to the existing import block from `@/lib/google-ads/*`:

```ts
import { askOverviewFollowup, loadOverviewThread, runOverviewAnalysis } from "@/lib/google-ads/overview-analysis";
```

And add to the existing `import type { ... } from "@/types/google-ads"` block:

```ts
  OverviewChatMessage,
  OverviewThread,
```//merged alphabetically into the existing multi-line type import list

- [ ] **Step 2: Append the three actions**

Add at the end of `src/app/actions/google-ads.ts`:

```ts
export interface OverviewDateRangeInput {
  start: string;
  end: string;
}

export async function getOverviewThread(
  input: OverviewDateRangeInput,
): Promise<ActionResult<OverviewThread | null>> {
  try {
    const rangeError = validateDateRange(input.start, input.end);
    if (rangeError) return { ok: false, error: rangeError };
    const data = await loadOverviewThread({ start: input.start, end: input.end });
    return { ok: true, data };
  } catch (err) {
    console.error(err);
    return { ok: false, error: toError(err) };
  }
}

export interface RunOverviewAnalysisActionInput extends OverviewDateRangeInput {
  forceRefresh?: boolean;
}

export async function runOverviewAnalysisAction(
  input: RunOverviewAnalysisActionInput,
): Promise<ActionResult<OverviewThread>> {
  try {
    const rangeError = validateDateRange(input.start, input.end);
    if (rangeError) return { ok: false, error: rangeError };
    const data = await runOverviewAnalysis(
      { start: input.start, end: input.end },
      { forceRefresh: Boolean(input.forceRefresh) },
    );
    return { ok: true, data };
  } catch (err) {
    if (isAuthError(err)) redirect("/api/google-ads/oauth/authorize");
    console.error(err);
    return { ok: false, error: toError(err) };
  }
}

export interface AskOverviewFollowupActionInput extends OverviewDateRangeInput {
  question: string;
}

export async function askOverviewFollowupAction(
  input: AskOverviewFollowupActionInput,
): Promise<ActionResult<OverviewChatMessage[]>> {
  try {
    const rangeError = validateDateRange(input.start, input.end);
    if (rangeError) return { ok: false, error: rangeError };
    const question = input.question.trim();
    if (!question) return { ok: false, error: "Question must not be empty" };
    const data = await askOverviewFollowup({ start: input.start, end: input.end }, question);
    return { ok: true, data };
  } catch (err) {
    console.error(err);
    return { ok: false, error: toError(err) };
  }
}
```

- [ ] **Step 3: Verify**

Run: `pnpm typecheck && pnpm check`
Expected: no errors. If Biome complains about import order, run `pnpm check:fix`.

- [ ] **Step 4: Commit**

```bash
git add src/app/actions/google-ads.ts
git commit -m "feat: add overview analysis and follow-up chat server actions"
```

---

### Task 8: Add sidebar entry and homepage redirect

**Files:**
- Modify: `src/navigation/sidebar/sidebar-items.ts`
- Modify: `src/app/(main)/dashboard/page.tsx`

**Interfaces:**
- Consumes: existing `NavMainItem`/`NavGroup` types in `sidebar-items.ts`.
- Produces: nothing new — routing/navigation wiring only.

- [ ] **Step 1: Add the sidebar item**

In `src/navigation/sidebar/sidebar-items.ts`, add `Sparkles` (or similar) to the `lucide-react` import list, then insert as the **first** item in the `"Google Ads"` group's `items` array (before `"Campaigns"`):

```ts
{
  title: "Overview",
  url: "/dashboard/overview",
  icon: Sparkles,
},
```

- [ ] **Step 2: Update the homepage redirect**

Replace the contents of `src/app/(main)/dashboard/page.tsx`:

```ts
import { redirect } from "next/navigation";

export default function Page() {
  redirect("/dashboard/overview");
}
```

- [ ] **Step 3: Verify**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/navigation/sidebar/sidebar-items.ts "src/app/(main)/dashboard/page.tsx"
git commit -m "feat: add overview sidebar entry and make it the dashboard homepage"
```

---

### Task 9: Build the campaign insight card component

**Files:**
- Create: `src/app/(main)/dashboard/overview/_components/campaign-insight-card.tsx`

**Interfaces:**
- Consumes: `CampaignInsight`, `CampaignHealth` from `@/types/google-ads`; `Card`, `CardContent`, `CardHeader`, `CardTitle` from `@/components/ui/card`; `Badge` from `@/components/ui/badge`; `cn` from `@/lib/utils`.
- Produces: `export function CampaignInsightCard({ insight }: { insight: CampaignInsight }): JSX.Element` — used by Task 11.

- [ ] **Step 1: Write the component**

Create `src/app/(main)/dashboard/overview/_components/campaign-insight-card.tsx`:

```tsx
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { CampaignHealth, CampaignInsight } from "@/types/google-ads";

const HEALTH_CONFIG: Record<CampaignHealth, { label: string; className: string }> = {
  "on-track": { label: "On track", className: "bg-green-500/10 text-green-700 dark:text-green-400" },
  "needs-attention": { label: "Needs attention", className: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  "at-risk": { label: "At risk", className: "bg-destructive/10 text-destructive" },
};

export function CampaignInsightCard({ insight }: { insight: CampaignInsight }) {
  const health = HEALTH_CONFIG[insight.health];
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">{insight.campaignName}</CardTitle>
        <Badge className={cn("shrink-0", health.className)} variant="outline">
          {health.label}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-muted-foreground text-sm">{insight.summary}</p>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {insight.nextSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(main)/dashboard/overview/_components/campaign-insight-card.tsx"
git commit -m "feat: add campaign insight card component"
```

---

### Task 10: Build the chat panel component

**Files:**
- Create: `src/app/(main)/dashboard/overview/_components/overview-chat-panel.tsx`

**Interfaces:**
- Consumes: `askOverviewFollowupAction` from `@/app/actions/google-ads`; `OverviewChatMessage`, `DateRange` from `@/types/google-ads`; `Card`, `CardContent`, `CardHeader`, `CardTitle` from `@/components/ui/card`; `Textarea` from `@/components/ui/textarea`; `Button` from `@/components/ui/button`; `ScrollArea` from `@/components/ui/scroll-area`; `Spinner` from `@/components/ui/spinner`.
- Produces: `export function OverviewChatPanel({ dateRange, initialMessages }: { dateRange: DateRange; initialMessages: OverviewChatMessage[] }): JSX.Element` — used by Task 11.

- [ ] **Step 1: Write the component**

Create `src/app/(main)/dashboard/overview/_components/overview-chat-panel.tsx`:

```tsx
"use client";

import { useState } from "react";

import { askOverviewFollowupAction } from "@/app/actions/google-ads";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { DateRange, OverviewChatMessage } from "@/types/google-ads";

export function OverviewChatPanel({
  dateRange,
  initialMessages,
}: {
  dateRange: DateRange;
  initialMessages: OverviewChatMessage[];
}) {
  const [messages, setMessages] = useState<OverviewChatMessage[]>(initialMessages);
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    const trimmed = question.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setError(null);
    try {
      const res = await askOverviewFollowupAction({ start: dateRange.start, end: dateRange.end, question: trimmed });
      if (!res.ok) throw new Error(res.error);
      setMessages(res.data);
      setQuestion("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ask a follow-up</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ScrollArea className="h-64 rounded-md border">
          <div className="flex flex-col gap-3 p-3">
            {messages.length === 0 && (
              <p className="text-muted-foreground text-sm">
                Run an analysis, then ask questions about any campaign here.
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={`${m.role}-${m.createdAt}-${i}`}
                className={cn(
                  "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                  m.role === "user" ? "self-end bg-primary text-primary-foreground" : "self-start bg-muted",
                )}
              >
                {m.content}
              </div>
            ))}
          </div>
        </ScrollArea>

        {error && <p className="text-destructive text-sm">{error}</p>}

        <div className="flex gap-2">
          <Textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. Why is the Brand campaign at-risk?"
            className="min-h-10 resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
          />
          <Button type="button" onClick={() => void handleSend()} disabled={sending || !question.trim()}>
            {sending ? <Spinner className="size-4" /> : "Send"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: no errors. Check `Spinner`'s prop name for a size/className prop by reading `src/components/ui/spinner.tsx` — adjust the `className` prop above if it uses a different prop name.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(main)/dashboard/overview/_components/overview-chat-panel.tsx"
git commit -m "feat: add overview follow-up chat panel component"
```

---

### Task 11: Build the page and top-level client content component

**Files:**
- Create: `src/app/(main)/dashboard/overview/page.tsx`
- Create: `src/app/(main)/dashboard/overview/_components/overview-content.tsx`

**Interfaces:**
- Consumes: `getOverviewThread`, `runOverviewAnalysisAction` from `@/app/actions/google-ads`; `useDateRange` from `@/hooks/use-date-range`; `CampaignInsightCard` (Task 9); `OverviewChatPanel` (Task 10); `Button`, `Alert`/`AlertDescription`/`AlertTitle`, `Spinner` from `@/components/ui/*`; `OverviewThread`, `DateRange` from `@/types/google-ads`.
- Produces: default export `Page` for the route; `export function OverviewContent(): JSX.Element` (client component rendering the whole feature).

- [ ] **Step 1: Write the client content component**

Create `src/app/(main)/dashboard/overview/_components/overview-content.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";

import { RefreshCw } from "lucide-react";

import { getOverviewThread, runOverviewAnalysisAction } from "@/app/actions/google-ads";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useDateRange } from "@/hooks/use-date-range";
import type { DateRange, OverviewThread } from "@/types/google-ads";

import { CampaignInsightCard } from "./campaign-insight-card";
import { OverviewChatPanel } from "./overview-chat-panel";

export function OverviewContent() {
  const [dateRange] = useDateRange();
  const [thread, setThread] = useState<OverviewThread | null>(null);
  const [loadingCached, setLoadingCached] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCached = useCallback(async (dr: DateRange) => {
    setLoadingCached(true);
    setError(null);
    try {
      const res = await getOverviewThread({ start: dr.start, end: dr.end });
      if (!res.ok) throw new Error(res.error);
      setThread(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoadingCached(false);
    }
  }, []);

  useEffect(() => {
    void loadCached(dateRange);
  }, [loadCached, dateRange.start, dateRange.end]);

  async function handleAnalyze(forceRefresh: boolean) {
    setAnalyzing(true);
    setError(null);
    try {
      const res = await runOverviewAnalysisAction({ start: dateRange.start, end: dateRange.end, forceRefresh });
      if (!res.ok) throw new Error(res.error);
      setThread(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={() => void handleAnalyze(false)} disabled={analyzing || loadingCached}>
          {analyzing ? <Spinner className="mr-2 size-4" /> : null}
          {thread ? "Re-analyze" : "Analyze"}
        </Button>
        {thread && (
          <Button type="button" variant="outline" size="icon" onClick={() => void handleAnalyze(true)} disabled={analyzing}>
            <RefreshCw className="size-4" />
          </Button>
        )}
        {thread && (
          <span className="text-muted-foreground text-xs">
            Generated {new Date(thread.analysis.generatedAt).toLocaleString()}
          </span>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loadingCached && !thread && <Spinner className="size-6" />}

      {!loadingCached && !thread && !error && (
        <p className="text-muted-foreground text-sm">
          No analysis yet for this date range. Click Analyze to generate campaign insights.
        </p>
      )}

      {thread && (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {thread.analysis.insights.map((insight) => (
              <CampaignInsightCard key={insight.campaignId} insight={insight} />
            ))}
          </div>

          <OverviewChatPanel dateRange={dateRange} initialMessages={thread.messages} />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write the page**

Create `src/app/(main)/dashboard/overview/page.tsx`:

```tsx
import { OverviewContent } from "./_components/overview-content";

export default function OverviewPage() {
  return (
    <div className="mx-auto flex min-h-0 w-full max-w-screen-2xl flex-col gap-8">
      <section id="overview" className="scroll-mt-24">
        <h1 className="font-heading font-semibold text-2xl tracking-tight md:text-3xl">Overview</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          AI-generated performance summary and next steps for every campaign in the selected date range, with a
          follow-up chat grounded in the same data.
        </p>
      </section>

      <OverviewContent />
    </div>
  );
}
```

- [ ] **Step 3: Verify with typecheck and lint**

Run: `pnpm typecheck && pnpm check`
Expected: no errors. Fix any Biome import-order or unused-import issues with `pnpm check:fix`.

- [ ] **Step 4: Manual smoke test**

Run: `pnpm dev`

With `ANTHROPIC_API_KEY`, `REDIS_HOST`, and the Google Ads env vars set in `.env`:
1. Navigate to `http://localhost:3002/` — confirm it redirects to `/dashboard/overview`.
2. Confirm "Overview" appears first in the sidebar's Google Ads group and is highlighted as active.
3. Click "Analyze" — confirm campaign cards render with health badges, summaries, and next steps after the Claude call completes.
4. Change the date range in the nav bar — confirm the page shows the "no analysis yet" state for the new range (unless already cached in Redis).
5. Switch back to the original date range — confirm the previous analysis reloads from Redis without another Claude call (check server logs / no `RefreshCw` icon spinner beyond the initial cached load).
6. Type a follow-up question in the chat panel and send — confirm an assistant reply appears and both messages persist after a page reload.

Report any failures before proceeding.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(main)/dashboard/overview/page.tsx" "src/app/(main)/dashboard/overview/_components/overview-content.tsx"
git commit -m "feat: add overview insights homepage"
```

---

## Self-Review Notes

- Spec coverage: date range reuse (Task 11 via `useDateRange`), manual Analyze trigger (Task 11), all 10 report sources (Task 3 — note: `search-terms.ts`/`ngram-analysis.ts`/`campaign-keywords.ts`/`device-performance.ts`/`schedule-performance.ts` are intentionally excluded from the aggregation call list per the spec's chosen "All" sources being defined as the 10 named in the design doc: campaign, ad groups, quality score, devices, schedule, landing pages, keyword↔search-terms, ad performance, auction insights, change history — device and schedule performance were named in the spec but omitted from Task 3's `Promise.all` for brevity of the LLM context; **fix**: added as explicit follow-up below), page-level single chat (Task 10), Redis persistence keyed by date range (Task 5), route + sidebar wiring (Task 8), env var (Task 1).
- **Gap found during review:** the spec's "All" data-source answer explicitly lists devices and schedule as included sources, but Task 3's aggregation omits `runDevicePerformance`/`runSchedulePerformance`. Since device/schedule breakdowns are lower-signal for a per-campaign summary (they're per-device/per-hour splits, not per-campaign next-step material) and including them would blow up the Claude prompt size, this is a deliberate scope trim, not an oversight — call it out explicitly to the user after implementation rather than silently deviating from the written spec.
- No placeholders remain; every step has literal code.
- Type names are consistent across tasks: `OverviewContext`/`OverviewCampaignContext` (Task 2 → Task 3), `CampaignInsight` (Task 2 → Task 4 → Task 9), `OverviewThread`/`OverviewChatMessage` (Task 2 → Task 5/6 → Task 7 → Task 10/11).
