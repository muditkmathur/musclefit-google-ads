---
name: diagnose-lost-impression-share
description: Use when a campaign or keyword shows high Lost Impression Share (Rank) and the cause needs to be isolated — whether it's Quality Score, ad strength/creative, or landing page mismatch. Also covers Lost IS (Budget) triage.
---

# Diagnose Lost Impression Share

A repeatable diagnostic sequence for figuring out *why* a campaign is losing impression share, instead of guessing or jumping straight to "raise the bid."

## Step 0: Split Budget vs Rank first

From `mcp__google-ads__get_campaign_report`, every campaign row has `lostIsBudget` and `lostIsRank`. These are different problems with different fixes — always check which one dominates before doing anything else:

- **Lost IS (Budget) dominant** → the campaign is running out of money before it runs out of good auctions to bid on. Fix is budget-related (raise budget, or if the campaign is one of several sharing a pool, reconsider shared vs. independent budgets). Ad Rank tuning won't help this.
- **Lost IS (Rank) dominant** → the campaign has budget left but isn't winning enough auctions on Ad Rank (bid × Quality Score × expected ad impact). Continue to Step 1.
- **Both roughly equal or both high** → note both, but investigate Rank first since it's usually the more actionable/diagnosable of the two.

## Step 1: Quality Score — usually the biggest lever

Pull `mcp__google-ads__get_quality_score` for the relevant date range. For each keyword, note:
- The QS number (1-10) itself
- The `bottleneck` field (`qs` / `bid` / `competitive` / `unknown`) — this tells you directly whether QS or bid competitiveness is the limiting factor for that keyword
- The three components: `expectedCtr`, `adRelevance`, `landingPageExperience` — each is `BELOW_AVERAGE` / `AVERAGE` / `ABOVE_AVERAGE`

**Rank the keywords by spend, not just by QS number.** A QS-1 keyword with ₹50/month spend matters far less than a QS-3 keyword carrying ₹5,000/month. Always compute (or ask for) spend-weighted QS to know where to focus first.

**Look for a consistent weak component across keywords.** If `landingPageExperience` is Below Average across nearly every keyword while `adRelevance` varies, the landing page is the systemic issue, not the ads — this was the actual root cause found in this account (see `recommendation/landing-page-improvements.md`).

## Step 2: Ad strength and creative — usually NOT the bottleneck, but verify

Pull `mcp__google-ads__get_ad_performance`. Check:
- RSA `ad strength` rating per ad (Poor/Average/Good/Excellent)
- Per-asset performance labels (BEST/GOOD/LOW/LEARNING/PENDING/UNKNOWN) — note that these often stay UNKNOWN for a long time on lower-volume ads/accounts; don't treat "all UNKNOWN" as a problem, it usually just means insufficient accumulated data
- Whether any ad group has only one active ad (no A/B testing) — a secondary observation, not usually the main fix

If ad strength is already "Excellent," **rule out creative as the cause** and don't spend more effort here — the account's own ad strength being maxed while Lost IS (Rank) stays high is itself useful evidence that the bottleneck lives elsewhere (usually QS/landing page).

## Step 3: Landing page mismatch — check the actual destination

Pull `mcp__google-ads__get_landing_page_report`, and cross-reference `usedByAdGroups` against what each ad group's keywords are actually about. Specifically look for:
- An ad group's keywords implying one intent (e.g. "foot massage near me" — general, location-based) while its landing page serves a narrower angle (e.g. `/pain-relief` — condition-specific)
- Compare conversion rate / CPA of the mismatched page against other pages on the site — a real mismatch usually shows up as a worse conversion rate too, not just a QS problem

If a mismatch is found, when relevant, **navigate to the actual pages via the Chrome browser tool** to read live content rather than inferring from the URL name alone — this caught the `/services/` vs `/` sitelink decision.

## Step 4: Synthesize a fix, in priority order

1. Landing page / intent-mismatch fixes first (usually free, no ad spend required, and it's the component found consistently weak in this account)
2. Ad copy tightening (echo the literal query in headlines/descriptions) — cheap, fast
3. Isolating a specific low-QS/high-spend keyword into its own ad group or campaign if it's dragging down a shared pool
4. Raising bids — **last resort**, since QS is a multiplier; a bid increase without fixing QS is an expensive workaround, not a fix

## Notes

- Don't recommend bid increases as the first fix for Rank-dominant Lost IS — always check QS/landing page first.
- A keyword/ad group with `bottleneck: "competitive"` (not `"qs"`) genuinely doesn't have a Quality Score problem — don't force a QS narrative onto it.
