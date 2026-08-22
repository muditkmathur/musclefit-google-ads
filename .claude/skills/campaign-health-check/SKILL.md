---
name: campaign-health-check
description: Use when asked to "review performance", "check the campaigns", "how are things doing" or similar periodic Google Ads health checks for this account. Pulls campaign report + change history and compares against the prior comparable window with a clear verdict.
---

# Campaign Health Check

A repeatable procedure for reviewing this Google Ads account's performance, so the read is consistent across sessions instead of ad hoc.

## Steps

1. **Determine the window.** Default to the last 7 days unless the user specifies otherwise. If there's an open investigation (e.g. a budget change, a scheduled checkpoint noted in `recommendation/*.md`), match the window to what that investigation needs.

2. **Pull the data in parallel:**
   - `mcp__google-ads__get_campaign_report` for the window, `include_daily: true`, `force_refresh: true` — gives per-campaign impressions/clicks/spend/conversions/CPA/Impression Share/Lost IS (Budget & Rank), plus a `previous_totals` comparison to the prior equal-length window automatically.
   - `mcp__google-ads__get_change_history` for the same window (or last 1-3 days if just confirming recent manual changes) — gives an audit trail of what actually changed and when, and by whom/what client.

3. **Build the comparison table.** Per campaign: Impressions, Clicks, Spend, Conversions, CPA, Impression Share, Lost IS (Budget), Lost IS (Rank). Always include the account-wide total row using the `totals`/`previous_totals` fields already computed by the tool — don't re-derive by hand.

4. **Check for unexplained metric swings.** If any campaign's CPA, Impression Share, or Lost IS moved by more than ~20% versus the prior window, cross-reference `get_change_history` for that campaign in the relevant date range. If a change event explains it (budget edit, keyword pause, bid strategy change), say so explicitly. If nothing in change history explains a swing, say that too — don't paper over an unexplained move.

5. **Read the daily breakdown for trend direction, not just the aggregate.** A flat 7-day average can hide a campaign that's recovering (or degrading) day by day. When judging whether an issue is "settling down" vs "persistent," look at the actual day-over-day sequence within the window, not just start-vs-end.

6. **State a verdict, not just numbers.** Every health check should end with an explicit read: improving / flat / degrading, and whether it's within normal noise for the current data volume (a campaign converting 1-3x/day is noisy; don't over-read single-day swings) or a real pattern (consistent across the whole window, or consistent across two consecutive windows).

7. **If there's an open decision pending** (e.g. a budget-revert decision, a scheduled checkpoint), explicitly restate the decision rule that was agreed and say whether this check's numbers satisfy it yet — don't make the user re-derive the threshold from memory.

## Notes

- Always use `force_refresh: true` on `get_campaign_report` for health checks — cached data defeats the purpose of a fresh review.
- If `get_campaign_report` errors with `invalid_grant`, the OAuth refresh token has expired — tell the user to re-authorize via `/api/google-ads/oauth/authorize` (see CLAUDE.md), don't silently retry more than once.
- If output is large (ad-level or keyword-level reports), it'll get persisted to a file automatically — dispatch a subagent to read and summarize it rather than reading the raw file inline, per the tool's own guidance.
