---
name: search-console-query
description: Use when asked about organic search performance, SEO, Search Console data, top/losing queries, or ranking pages for this site — e.g. "what are our top search queries", "which pages are losing organic clicks", "how's our SEO doing". Distinct data source from Google Ads (no spend/conversions here, only organic clicks/impressions/CTR/position).
---

# Search Console Query

An on-demand tool for answering ad-hoc questions about this site's organic search performance, via `mcp__google-ads__get_search_console_report`.

## Steps

1. **Determine the window.** Default to the last 28 days unless the user specifies otherwise. Search Console data typically lags 1-3 days behind real-time, so avoid querying `end_date` as today — use yesterday or 2 days ago as the effective end date.

2. **Call the tool.** `mcp__google-ads__get_search_console_report` with `start_date`/`end_date`. Leave `site_url` unset unless the user names a specific property — it defaults to the account's site automatically. Use `force_refresh: true` only if the user explicitly wants fresh data (default cache TTL is 1 hour, which is fine for most questions).

3. **Shape the answer to the question**, don't dump the raw table:
   - "Top queries" → sort rows by `clicks` descending, aggregate by `query` across pages if the user means overall query volume rather than query-page pairs.
   - "Which pages are losing clicks" → requires comparing two windows (current vs. prior equal-length period) — call the tool twice with adjacent date ranges and diff by `page` (sum clicks per page in each window).
   - "Ranking opportunities" → look for rows with high `impressions` but low `position` (page 2+, i.e. position > 10) and low `ctr` relative to that position — these are queries getting shown but not clicked, often fixable with a better title/meta description.
   - "Query-page mismatch" → a query with high impressions/clicks landing on a page whose content doesn't obviously match the query is worth flagging, similar in spirit to the Ads `get_keyword_search_term_map` intent-mismatch check.

4. **State clicks and impressions together, not CTR alone.** A high CTR on 10 impressions is noise; a low CTR on 5,000 impressions is a real opportunity. Always give the reader both numbers so they can judge significance themselves.

## Notes

- If the tool errors with `invalid_grant`, the Search Console OAuth refresh token has expired — tell the user to re-authorize via `/api/search-console/oauth/authorize` (see CLAUDE.md), don't silently retry more than once.
- This is a separate OAuth app/refresh token from Google Ads (`sc:oauth:refresh_token` in Redis vs. `ga:oauth:refresh_token`) — an Ads auth failure does not mean Search Console is also broken, and vice versa.
- Position is 1-indexed and *lower is better* (1 = top of page 1). Don't describe a rising position number as "improving."
