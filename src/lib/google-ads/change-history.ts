import { buildCacheKey, getOrSetJson } from "@/lib/cache/query-cache";
import type { ChangeEvent, ChangeHistoryReport, DateRange } from "@/types/google-ads";

import { getCustomer, getCustomerId } from "./client";

/** change_event is retained for at most 30 days. */
const MAX_DAYS = 30;

/** Short TTL — change history is looked at to diagnose recent issues. */
const CHANGE_HISTORY_TTL_SECONDS = 5 * 60;

const RESOURCE_TYPE_LABELS: Record<string, string> = {
  "3": "Ad group",
  AD_GROUP: "Ad group",
  "4": "Ad",
  AD_GROUP_AD: "Ad",
  "5": "Ad group asset",
  AD_GROUP_ASSET: "Ad group asset",
  "6": "Bid modifier",
  AD_GROUP_BID_MODIFIER: "Bid modifier",
  "7": "Keyword",
  AD_GROUP_CRITERION: "Keyword",
  "11": "Campaign",
  CAMPAIGN: "Campaign",
  "12": "Campaign asset",
  CAMPAIGN_ASSET: "Campaign asset",
  "14": "Campaign bid modifier",
  CAMPAIGN_BID_MODIFIER: "Campaign bid modifier",
  "15": "Budget",
  CAMPAIGN_BUDGET: "Budget",
  "16": "Campaign negative",
  CAMPAIGN_CRITERION: "Campaign negative",
  "22": "Shared set",
  CAMPAIGN_SHARED_SET: "Shared set",
};

const CLIENT_TYPE_LABELS: Record<string, string> = {
  "2": "UI",
  GOOGLE_ADS_WEB_CLIENT: "UI",
  "3": "Automated rule",
  GOOGLE_ADS_AUTOMATED_RULE: "Automated rule",
  "4": "Editor",
  GOOGLE_ADS_EDITOR: "Editor",
  "5": "API",
  GOOGLE_ADS_API: "API",
  "6": "Smart campaigns",
  GOOGLE_ADS_SMART_CAMPAIGNS: "Smart campaigns",
  "7": "Performance Max",
  GOOGLE_ADS_PERFORMANCE_MAX: "Performance Max",
};

const STATUS_LABELS: Record<string, string> = {
  "2": "Enabled",
  ENABLED: "Enabled",
  "3": "Paused",
  PAUSED: "Paused",
  "4": "Removed",
  REMOVED: "Removed",
};

const MATCH_TYPE_LABELS: Record<string, string> = {
  "2": "Broad",
  BROAD: "Broad",
  "3": "Phrase",
  PHRASE: "Phrase",
  "4": "Exact",
  EXACT: "Exact",
};

const OPERATION_MAP: Record<string, ChangeEvent["operation"]> = {
  "2": "CREATE",
  CREATE: "CREATE",
  "3": "UPDATE",
  UPDATE: "UPDATE",
  "4": "REMOVE",
  REMOVE: "REMOVE",
};

type AnyRecord = Record<string, unknown>;

function asRecord(value: unknown): AnyRecord | null {
  return value !== null && typeof value === "object" ? (value as AnyRecord) : null;
}

function parseChangedFields(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return (raw as unknown[]).map(String);
  const obj = asRecord(raw);
  if (obj) {
    const paths = obj.paths;
    if (Array.isArray(paths)) return (paths as unknown[]).map(String);
    if (typeof obj === "object") {
      const vals = Object.values(obj);
      if (vals.every((v) => typeof v === "string")) return vals as string[];
    }
  }
  if (typeof raw === "string")
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  return [];
}

function extractMicros(resource: AnyRecord | null, ...paths: string[]): number | null {
  if (!resource) return null;
  for (const path of paths) {
    const parts = path.split(".");
    let cur: unknown = resource;
    for (const p of parts) {
      cur = asRecord(cur)?.[p];
    }
    if (cur !== null && cur !== undefined) {
      const n = Number(cur);
      if (Number.isFinite(n)) return n / 1_000_000;
    }
  }
  return null;
}

function extractStatus(resource: AnyRecord | null): string | null {
  if (!resource) return null;
  for (const key of ["campaign", "ad_group", "ad_group_criterion", "ad_group_ad", "campaign_budget"]) {
    const sub = asRecord(resource[key]);
    if (sub) {
      const raw = String(sub.status ?? "");
      if (raw) return STATUS_LABELS[raw] ?? raw;
    }
  }
  return null;
}

function extractKeyword(resource: AnyRecord | null): { text: string | null; matchType: string | null } {
  if (!resource) return { text: null, matchType: null };
  const criterion = asRecord(resource.ad_group_criterion);
  if (!criterion) return { text: null, matchType: null };
  const kw = asRecord(criterion.keyword);
  if (!kw) return { text: null, matchType: null };
  return {
    text: typeof kw.text === "string" ? kw.text : null,
    matchType: MATCH_TYPE_LABELS[String(kw.match_type ?? "")] ?? null,
  };
}

function buildSummary(event: {
  operation: ChangeEvent["operation"];
  resourceTypeLabel: string;
  changedFields: string[];
  budgetOld: number | null;
  budgetNew: number | null;
  statusOld: string | null;
  statusNew: string | null;
  keywordText: string | null;
  keywordMatchType: string | null;
  bidOld: number | null;
  bidNew: number | null;
}): string {
  const parts: string[] = [];

  if (event.operation === "CREATE") {
    if (event.keywordText) {
      return `Added keyword "${event.keywordText}" (${event.keywordMatchType ?? "?"})`;
    }
    return `Created ${event.resourceTypeLabel.toLowerCase()}`;
  }
  if (event.operation === "REMOVE") {
    if (event.keywordText) {
      return `Removed keyword "${event.keywordText}"`;
    }
    return `Removed ${event.resourceTypeLabel.toLowerCase()}`;
  }

  // UPDATE — surface the most useful changes first
  if (event.statusOld !== null && event.statusNew !== null && event.statusOld !== event.statusNew) {
    parts.push(`Status: ${event.statusOld} → ${event.statusNew}`);
  } else if (event.statusNew !== null && event.changedFields.some((f) => f.includes("status"))) {
    parts.push(`Status → ${event.statusNew}`);
  }

  if (event.budgetOld !== null && event.budgetNew !== null) {
    parts.push(`Budget: ₹${event.budgetOld.toFixed(0)} → ₹${event.budgetNew.toFixed(0)}`);
  } else if (event.changedFields.some((f) => f.includes("amount_micros"))) {
    parts.push("Budget changed");
  }

  if (event.bidOld !== null && event.bidNew !== null) {
    parts.push(`Bid: ₹${event.bidOld.toFixed(2)} → ₹${event.bidNew.toFixed(2)}`);
  } else if (
    event.changedFields.some((f) => f.includes("cpc_bid") || f.includes("target_cpa") || f.includes("target_roas"))
  ) {
    parts.push("Bid/target changed");
  }

  if (parts.length === 0) {
    // Fallback: show the changed field names, simplified
    const simplified = event.changedFields
      .map((f) => f.split(".").pop() ?? f)
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .slice(0, 3)
      .join(", ");
    parts.push(simplified || "Updated");
  }

  return parts.join(" · ");
}

export interface RunChangeHistoryOptions {
  days?: number;
  forceRefresh?: boolean;
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDateTime(d: Date): string {
  return (
    `${fmtDate(d)} ` +
    `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`
  );
}

export async function runChangeHistory(options: RunChangeHistoryOptions = {}): Promise<ChangeHistoryReport> {
  const days = Math.min(Math.max(1, Math.floor(options.days ?? 30)), MAX_DAYS);
  const end = new Date();
  // Subtract exact milliseconds so "30 days" never exceeds the API's 30-day retention window.
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);

  const dateRange: DateRange = { start: fmtDate(start), end: fmtDate(end) };

  const cacheKey = buildCacheKey("change-history:v1", {
    customerId: getCustomerId(),
    days,
    // Round to 5-min bucket so cache invalidates naturally
    bucket: Math.floor(Date.now() / (CHANGE_HISTORY_TTL_SECONDS * 1000)),
  });

  return getOrSetJson<ChangeHistoryReport>(
    cacheKey,
    () => fetchChangeHistory(dateRange, fmtDateTime(start), fmtDateTime(end)),
    CHANGE_HISTORY_TTL_SECONDS,
    { forceRefresh: options.forceRefresh === true },
  );
}

async function fetchChangeHistory(
  dateRange: DateRange,
  queryStart: string,
  queryEnd: string,
): Promise<ChangeHistoryReport> {
  const customer = await getCustomer();

  const rows = await customer.query(`
    SELECT
      change_event.change_date_time,
      change_event.change_resource_type,
      change_event.resource_change_operation,
      change_event.changed_fields,
      change_event.client_type,
      change_event.new_resource,
      change_event.old_resource,
      change_event.user_email,
      campaign.name,
      ad_group.name
    FROM change_event
    WHERE change_event.change_date_time >= '${queryStart}'
      AND change_event.change_date_time <= '${queryEnd}'
    ORDER BY change_event.change_date_time DESC
    LIMIT 5000
  `);

  const events: ChangeEvent[] = rows.map((r): ChangeEvent => {
    const ce = asRecord(r.change_event) ?? {};
    const rawType = String(ce.change_resource_type ?? "");
    const rawOp = String(ce.resource_change_operation ?? "");
    const rawClient = String(ce.client_type ?? "");

    const operation: ChangeEvent["operation"] = OPERATION_MAP[rawOp] ?? "UNKNOWN";
    const changedFields = parseChangedFields(ce.changed_fields);
    const newResource = asRecord(ce.new_resource) ?? {};
    const oldResource = asRecord(ce.old_resource) ?? {};

    const budgetOld = extractMicros(oldResource, "campaign_budget.amount_micros");
    const budgetNew = extractMicros(newResource, "campaign_budget.amount_micros");
    const bidOld = extractMicros(
      oldResource,
      "ad_group_criterion.cpc_bid_micros",
      "ad_group.cpc_bid_micros",
      "campaign.target_cpa.target_cpa_micros",
    );
    const bidNew = extractMicros(
      newResource,
      "ad_group_criterion.cpc_bid_micros",
      "ad_group.cpc_bid_micros",
      "campaign.target_cpa.target_cpa_micros",
    );
    const statusOld = extractStatus(oldResource);
    const statusNew = extractStatus(newResource);
    const { text: keywordText, matchType: keywordMatchType } =
      operation === "CREATE" || operation === "REMOVE"
        ? extractKeyword(newResource.ad_group_criterion !== undefined ? newResource : oldResource)
        : { text: null, matchType: null };

    const resourceTypeLabel = RESOURCE_TYPE_LABELS[rawType] ?? rawType;
    const clientTypeLabel = CLIENT_TYPE_LABELS[rawClient] ?? rawClient;

    const partialEvent = {
      operation,
      resourceTypeLabel,
      changedFields,
      budgetOld,
      budgetNew,
      statusOld,
      statusNew,
      keywordText,
      keywordMatchType,
      bidOld,
      bidNew,
    };

    return {
      changeDateTime: String(ce.change_date_time ?? ""),
      resourceType: rawType,
      resourceTypeLabel,
      operation,
      changedFields,
      clientType: rawClient,
      clientTypeLabel,
      userEmail: String(ce.user_email ?? ""),
      campaignName: String(r.campaign?.name ?? ""),
      adGroupName: String(r.ad_group?.name ?? ""),
      summary: buildSummary(partialEvent),
      budgetOld,
      budgetNew,
      statusOld,
      statusNew,
      keywordText,
      keywordMatchType,
      bidOld,
      bidNew,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    dateRange,
    events,
  };
}
