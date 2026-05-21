# Design: Sidebar Cleanup + MCP Server

**Date:** 2026-05-21  
**Status:** Approved

---

## Overview

Two independent tasks delivered together:

1. **Sidebar cleanup** — Remove all non-Google Ads navigation, routes, and their dead code from the dashboard.
2. **MCP server** — Build a stdio MCP server that exposes all Google Ads data sources as tools so Claude can query live data directly in any conversation.

---

## Part 1: Sidebar Cleanup

### What Gets Deleted

| Path | Reason |
|---|---|
| `src/app/(main)/auth/` | Auth page stubs — not needed |
| `src/app/(main)/dashboard/(legacy)/` | Legacy template dashboards (analytics-v1, crm-v1, default-v1, finance-v1) |
| `src/app/(main)/dashboard/analytics/` | Stub — no real data |
| `src/app/(main)/dashboard/crm/` | Stub — no real data |
| `src/app/(main)/dashboard/default/` | Stub — no real data |
| `src/app/(main)/dashboard/finance/` | Stub — no real data |
| `src/app/(main)/dashboard/productivity/` | Stub — no real data |
| `src/app/(main)/dashboard/coming-soon/` | Placeholder page |
| `src/data/users.ts` | Only used by removed footer components and auth stubs |
| `src/app/(main)/dashboard/_components/sidebar/account-switcher.tsx` | Template stub using fake users |
| `src/app/(main)/dashboard/_components/sidebar/nav-user.tsx` | Template stub using fake users |
| `src/app/(main)/dashboard/_components/sidebar/sidebar-support-card.tsx` | Template stub |

### What Gets Updated

**`src/navigation/sidebar/sidebar-items.ts`**  
Remove groups 2 (Pages/Auth) and 3 (Legacy). Keep only group 1 (Google Ads).

**`src/app/(main)/dashboard/_components/sidebar/app-sidebar.tsx`**  
- Remove imports and JSX for `AccountSwitcher`, `NavUser`, `SidebarSupportCard`
- Remove the `_data` block (dead `navSecondary` and `documents` arrays)
- Remove `rootUser` import from `@/data/users`
- Fix header logo link: `/dashboard/default` → `/dashboard/campaigns`
- Remove `SidebarFooter` entirely (nothing left in it)

**`src/app/(main)/dashboard/layout.tsx`**  
- Remove `AccountSwitcher` import and usage from the header
- Remove the GitHub template link button (`https://github.com/arhamkhnz/next-shadcn-admin-dashboard`)
- Remove `src/data/users` import and `users` reference

**`src/app/(main)/dashboard/page.tsx`**  
Redirect to `/dashboard/campaigns` using Next.js `redirect()` instead of returning nothing.

---

## Part 2: MCP Server

### Architecture

```
Claude (MCP client)
  → scripts/mcp-server.ts          (stdio transport, @modelcontextprotocol/sdk)
    → src/lib/google-ads/*.ts       same lib the UI uses — no logic duplication
      → src/lib/cache/query-cache.ts  Redis cache shared with UI
          → Google Ads API
```

The server loads `.env` via `dotenv/config` (same pattern as all other scripts in `scripts/`).

### New Files

**`scripts/mcp-server.ts`**  
Single-file stdio MCP server. Registers all tools, calls lib functions, returns JSON-stringified results. Uses `StdioServerTransport` from `@modelcontextprotocol/sdk/server/stdio.js`.

**`.mcp.json`** (project root)  
```json
{
  "mcpServers": {
    "google-ads": {
      "command": "pnpm",
      "args": ["tsx", "--tsconfig", "tsconfig.json", "scripts/mcp-server.ts"]
    }
  }
}
```
Claude Code auto-starts this server when opening the project.

### New Dependency

`@modelcontextprotocol/sdk` — added to `dependencies` (not devDependencies, since the server runs at runtime via `tsx`).

### Tools

All tools accept an optional `force_refresh: boolean` param that passes `forceRefresh: true` to the underlying lib call, bypassing Redis cache.

| Tool name | Lib function | Key params |
|---|---|---|
| `get_campaign_report` | `runCampaignReport` | `range: CampaignRangeKey`, `granularity: CampaignGranularity`, `include_daily: boolean` |
| `get_search_terms` | `runSearchTermsReport` | `months?: number`, `campaign?: string` |
| `get_ngram_analysis` | `runSearchTermsReport` → `analyzeNgrams` | `weight: "clicks"\|"cost"\|"conversions"`, `campaign?: string`, `months?: number` |
| `get_ad_groups` | `runAdGroupReport` | `range: CampaignRangeKey` |
| `get_device_performance` | `runDevicePerformance` | `range: CampaignRangeKey` |
| `get_quality_score` | `runQualityScore` | `range: CampaignRangeKey` |
| `get_schedule_performance` | `runSchedulePerformance` | `range: CampaignRangeKey` |
| `get_change_history` | `runChangeHistory` | `days?: number` |
| `get_keyword_analysis` | `runKeywordAnalysisBundle` | `range: CampaignRangeKey` |
| `get_campaign_keywords` | `runCampaignKeywords` | `campaign_id?: string` |

`CampaignRangeKey` values: `"last-7-days"`, `"last-4-weeks"`, `"last-3-months"`, `"year-to-date"`  
`CampaignGranularity` values: `"day"`, `"week"`, `"month"`

### Implementation note on `get_ngram_analysis`

`analyzeNgrams` is a pure in-memory function — it does not fetch data. The `get_ngram_analysis` tool will chain two calls: `runSearchTermsReport({ months })` to get rows, then `analyzeNgrams({ rows, options: { weight, campaign } })` to compute the n-gram frequencies. This gives live data without requiring a pre-saved file on disk.

### Error Handling

The server catches all errors from lib calls and returns them as MCP error responses (not crashes). `invalid_grant` OAuth errors surface with the same human-readable message used by the UI server actions.

### TypeScript

The server uses the existing `tsconfig.json` (path aliases `@/` resolve to `src/`). No new tsconfig needed. `tsx` handles transpilation at runtime.

---

## Out of Scope

- No changes to `src/lib/google-ads/` — lib functions are used as-is
- No changes to server actions or UI data flow
- No authentication on the MCP server (local stdio only)
- `nav-documents.tsx` and `nav-secondary.tsx` sidebar components are left in place (already commented out in `app-sidebar.tsx`) — delete separately if desired
