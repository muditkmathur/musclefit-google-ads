# Foot Massage Isolation & Budget Split — Session Log

**Account:** muscle fit (musclefitspa.com)
**Log covers:** 2026-07-13 to 2026-07-21
**Purpose:** Continuity file so a fresh session (Claude Code or otherwise) can pick up this investigation without re-deriving context. Update this file as the situation evolves — don't let it go stale.

---

## Background

Two active Search campaigns originally shared one Google Ads **shared/portfolio budget** (₹1,200/day, Maximize Conversions, no CPA/ROAS target):
- **Search | WhatsApp + Calls**
- **Search | Women | Calls + WhatsApp | HSR**

Investigation found:
- Both campaigns were **budget-limited** despite two prior budget increases.
- Within "Search | WhatsApp + Calls," the keyword **`foot massage near me`** (Exact match) had **Quality Score 1** (worst possible) and cost ~₹542 CPA in isolation — driven mainly by a **landing page mismatch**: the ad group pointed to `/pain-relief`, a page about pain relief, not general/foot massage. `landingPageExperience` was "Below Average" on nearly every keyword in the account, the one consistent weak spot.
- The user separately noted **foot massage earns only ~40% of the margin** of the cheapest full-body massage — meaning even at "normal" CPA, this keyword is proportionally overpriced.

## Actions taken (chronological)

1. **2026-07-13 — Split the shared budget into two independent campaign budgets.**
   - Search | WhatsApp + Calls → ₹900/day
   - Search | Women | Calls + WhatsApp | HSR → ₹400/day
   - Rationale: user wanted independent control; also raised combined total slightly (₹1,200 → ₹1,300) since both were budget-constrained.

2. **2026-07-13/14 — Created "Search | Foot Massage (Capped)"** — an isolated single-keyword campaign to cap downside on the low-margin, QS-1 keyword while its landing page mismatch gets fixed:
   - Budget: ₹150/day (deliberately restrictive)
   - Bidding: **Manual CPC**, max ₹35–40 (not Maximize Conversions — chosen specifically because Maximize Conversions can't account for the 40%-lower margin; Manual CPC / eventual Target CPA ₹140–150 lets us encode that discount explicitly once enough conversion volume accumulates, ~15+/month is Google's rule of thumb for Target CPA reliability)
   - Keyword: `[foot massage near me]` — **must be Exact match** (was initially created as Broad by mistake, then corrected)
   - Landing page: steered away from `/pain-relief`; ad copy avoids "home service" (confirmed the business does **not** offer home service) and avoids overclaiming "reflexology" unless therapists specifically practice it
   - 6 sitelinks added (Focused Massages, Relaxation Massages, Aromatherapy, All Services → `/services/` not `/`, Head Massage, Back Massage) — deliberately excluded `/pain-relief` as a sitelink after visiting the actual page and comparing to `/services/`
   - Removed `foot massage near me` (Exact) from the old "Search | WhatsApp + Calls" → AG-WA-Primary Whatsapp ad group (paused it there) to avoid self-competing auctions
   - Fixed a duplicate-headline bug ("Step Into" vs "Step into Foot Massage Bliss" showing back-to-back in ad preview)
   - AI Max was **deliberately left off** for this campaign (broad-match expansion and Final URL expansion both work against the tight-control goal)

3. **2026-07-14 to 2026-07-20 — Post-split performance tracking.**
   - Foot Massage (Capped) campaign worked roughly as designed: CPA ranged ₹299–₹403 (well under the old blended ₹542), correctly budget-throttled (~90% Lost IS Budget most days on the tight ₹150 cap).
   - **However, the two main campaigns got worse, not better, after the split**, and did NOT show a self-correcting "learning phase" trend over 8 days:
     - Account-wide CPA: **₹250–273 pre-split → ₹483–489 post-split**, stable across two separate weekly windows (not noise).
     - Both campaigns showed **rising Lost IS (Budget)**: WhatsApp + Calls 37%, Women|HSR 41–44% (vs ~23–26% pre-split).
     - Root cause diagnosis: a shared budget let Smart Bidding shift spend to whichever campaign was cheaper on a given day; independent budgets removed that cross-campaign flexibility — a **structural** loss, not something that resolves with more learning time.

4. **2026-07-20/21 — Corrective action:**
   - **Paused "Search | Foot Massage (Capped)"** to free its ₹150/day for reallocation (keyword `foot massage near me` remains paused in the old ad group too — currently not running anywhere; revisit once landing page fix is done if you want to resume it)
   - **Reverted WhatsApp + Calls and Women | HSR to a shared budget**, set at **₹1,500/day** (a deliberately conservative test — full theoretical need was ~₹1,800/day to fully clear Lost IS Budget, but ₹1,500 was chosen because ₹1,800 exceeds the user's actual budget ceiling, and ₹1,500 is only ~₹50/day above what was already committed across all three campaigns, making it a clean test of whether *pooling* itself — not just raw spend — was the fix)
   - Early same-day signal (partial day, 2026-07-21 ~12pm IST): Impression share up (31.4% / 27.9%, from ~22%/21%), Lost IS (Budget) down (13.6% / 28.6%, from ~35–60%) — promising but too early to call.
   - Also added negative keywords around this time: `pooja home spa massage service bangalore`, `mg road spa centre` (on Foot Massage campaign, now paused), `b2 massage` (on WhatsApp + Calls).

## Open items / next steps

1. **Scheduled checkpoint: 2026-07-27.** A one-shot cron reminder was set (session-only — will NOT survive if the Claude session that created it ends; if it doesn't fire, just ask Claude to run the check manually) to:
   - Pull a fresh 7-day campaign report (2026-07-20 to 2026-07-26)
   - Compare CPA/Lost IS (Budget) against pre-split baseline (~₹250–275 CPA) and the broken-split baseline (~₹483–489 CPA)
   - **Decision rule:** if CPA still >~₹400 after the ₹1,500 shared budget test, consider stepping up toward ₹1,800/day (if budget allows) or accept the current level; if CPA recovers toward ₹250–300, the shared-budget revert was the fix and ₹1,500 can stay.
   - Also check whether ₹1,500 fully cleared Lost IS (Budget) or only partially — informs whether further increases would keep helping.

2. **Foot Massage (Capped) campaign is paused, not deleted.** Once/if the landing page mismatch is actually fixed (dedicated foot-massage-relevant page, not `/pain-relief`), consider resuming it — the isolated-campaign approach itself was working (CPA well under the old blended rate).

3. **Ad Strength on the Foot Massage ad was "Average"** (the only non-"Excellent" ad in the account) — worth revisiting if the campaign resumes; more headline/description diversity was recommended but not fully iterated on.

4. **Landing page experience is "Below Average" on nearly every keyword account-wide**, not just foot massage — this is the underlying Quality Score / Ad Rank problem referenced in `impression-share-improvement-phases.md` and `landing-page-improvements.md` in this same directory. Those files have more detail on the broader landing-page fix plan; this file is specifically about the foot-massage isolation + budget-split experiment.

5. **Known unrelated bug already fixed:** `CLIENT_TYPE_LABELS` in `src/lib/google-ads/change-history.ts` had incorrect enum mapping (codes 4–7 shifted, 8/9 unmapped) causing raw numbers to show in the `/dashboard/history` "via" column. Fixed and committed (`ba35e5b`) — codes 8 ("Mobile app") and 9 ("Recommendations") now render correctly.

## Key numbers reference table

| Date | Campaign structure | Combined CPA | Notes |
|---|---|---|---|
| Pre-2026-07-13 | Shared ₹1,200/day | ~₹250–275 | Baseline |
| 2026-07-13 to 07-20 | Independent: ₹900 + ₹400 + ₹150 (foot massage) | ~₹483–489 | Structural regression, not learning-phase |
| 2026-07-21 onward | Shared ₹1,500/day (foot massage paused) | TBD — check 2026-07-27 | Test: does pooling alone fix it at near-current spend? |
