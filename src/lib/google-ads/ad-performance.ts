import { buildCacheKey, getOrSetJson } from "@/lib/cache/query-cache";
import { CACHE_TTL_SECONDS } from "@/lib/cache/file-store";
import type {
  AdAssetFieldType,
  AdAssetPerformanceRow,
  AdPerformanceReport,
  AdPerformanceRow,
  AdStrengthLabel,
  AssetPerformanceLabel,
  DateRange,
} from "@/types/google-ads";

import { getCustomer, getCustomerId } from "./client";

const AD_STRENGTH_LABELS: Record<string, AdStrengthLabel> = {
  "0": "Unknown",
  UNSPECIFIED: "Unknown",
  "1": "Unknown",
  UNKNOWN: "Unknown",
  "2": "Pending",
  PENDING: "Pending",
  "3": "No ads",
  NO_ADS: "No ads",
  "4": "Poor",
  POOR: "Poor",
  "5": "Average",
  AVERAGE: "Average",
  "6": "Good",
  GOOD: "Good",
  "7": "Excellent",
  EXCELLENT: "Excellent",
};

const AD_TYPE_LABELS: Record<string, string> = {
  "0": "Unknown",
  UNSPECIFIED: "Unknown",
  "1": "Unknown",
  UNKNOWN: "Unknown",
  "2": "Text",
  TEXT_AD: "Text",
  "3": "Expanded text",
  EXPANDED_TEXT_AD: "Expanded text",
  "7": "Expanded dynamic search",
  EXPANDED_DYNAMIC_SEARCH_AD: "Expanded dynamic search",
  "12": "Video",
  VIDEO_AD: "Video",
  "14": "Image",
  IMAGE_AD: "Image",
  "15": "Responsive search",
  RESPONSIVE_SEARCH_AD: "Responsive search",
  "16": "Responsive display",
  LEGACY_RESPONSIVE_DISPLAY_AD: "Responsive display",
  "17": "App",
  APP_AD: "App",
  "18": "App install",
  LEGACY_APP_INSTALL_AD: "App install",
  "19": "Responsive display",
  RESPONSIVE_DISPLAY_AD: "Responsive display",
  "20": "Local",
  LOCAL_AD: "Local",
  "23": "App engagement",
  APP_ENGAGEMENT_AD: "App engagement",
  "31": "Smart campaign",
  SMART_CAMPAIGN_AD: "Smart campaign",
  "32": "Call",
  CALL_AD: "Call",
  "33": "App pre-registration",
  APP_PRE_REGISTRATION_AD: "App pre-registration",
  "37": "Travel",
  TRAVEL_AD: "Travel",
};

const ASSET_PERFORMANCE_LABELS: Record<string, AssetPerformanceLabel> = {
  "0": "UNKNOWN",
  UNSPECIFIED: "UNKNOWN",
  "1": "UNKNOWN",
  UNKNOWN: "UNKNOWN",
  "2": "PENDING",
  PENDING: "PENDING",
  "3": "LEARNING",
  LEARNING: "LEARNING",
  "4": "LOW",
  LOW: "LOW",
  "5": "GOOD",
  GOOD: "GOOD",
  "6": "BEST",
  BEST: "BEST",
};

const FIELD_TYPE_LABELS: Record<string, AdAssetFieldType> = {
  "2": "HEADLINE",
  HEADLINE: "HEADLINE",
  "3": "DESCRIPTION",
  DESCRIPTION: "DESCRIPTION",
};

const STATUS_LABELS: Record<string, string> = {
  "2": "Enabled",
  ENABLED: "Enabled",
  "3": "Paused",
  PAUSED: "Paused",
  "4": "Removed",
  REMOVED: "Removed",
};

export interface RunAdPerformanceOptions {
  dateRange: DateRange;
  campaign?: string | null;
  adGroup?: string | null;
  forceRefresh?: boolean;
}

export async function runAdPerformance(options: RunAdPerformanceOptions): Promise<AdPerformanceReport> {
  const campaignFilter = options.campaign?.trim() || null;
  const adGroupFilter = options.adGroup?.trim() || null;

  const cacheKey = buildCacheKey("ad-performance:v1", {
    customerId: getCustomerId(),
    rangeStart: options.dateRange.start,
    rangeEnd: options.dateRange.end,
    campaignFilter,
    adGroupFilter,
  });

  return getOrSetJson<AdPerformanceReport>(
    cacheKey,
    () => fetchAdPerformance(options.dateRange, campaignFilter, adGroupFilter),
    CACHE_TTL_SECONDS,
    { forceRefresh: options.forceRefresh === true },
  );
}

function escapeForGaql(value: string): string {
  return value.replaceAll("'", "\\'");
}

async function fetchAdPerformance(
  dateRange: DateRange,
  campaignFilter: string | null,
  adGroupFilter: string | null,
): Promise<AdPerformanceReport> {
  const customer = await getCustomer();

  const campaignClause = campaignFilter ? ` AND campaign.name LIKE '%${escapeForGaql(campaignFilter)}%'` : "";
  const adGroupClause = adGroupFilter ? ` AND ad_group.name = '${escapeForGaql(adGroupFilter)}'` : "";

  const adRows = await customer.query(`
    SELECT
      campaign.name,
      campaign.status,
      ad_group.name,
      ad_group.status,
      ad_group_ad.ad.id,
      ad_group_ad.ad.type,
      ad_group_ad.ad.final_urls,
      ad_group_ad.ad_strength,
      ad_group_ad.status,
      metrics.impressions,
      metrics.clicks,
      metrics.ctr,
      metrics.cost_micros,
      metrics.conversions
    FROM ad_group_ad
    WHERE segments.date BETWEEN '${dateRange.start}' AND '${dateRange.end}'
      AND campaign.status = 'ENABLED'
      AND ad_group.status = 'ENABLED'
      AND ad_group_ad.status != 'REMOVED'${campaignClause}${adGroupClause}
    ORDER BY metrics.cost_micros DESC
  `);

  const ads: AdPerformanceRow[] = adRows.map((r): AdPerformanceRow => {
    const ad = (r.ad_group_ad as { ad?: Record<string, unknown>; ad_strength?: unknown; status?: unknown } | undefined)
      ?.ad;
    const m = r.metrics ?? {};
    const clicks = Number(m.clicks ?? 0);
    const impressions = Number(m.impressions ?? 0);
    const spend = Number(m.cost_micros ?? 0) / 1_000_000;
    const conversions = Number(m.conversions ?? 0);
    const rawStrength = String((r.ad_group_ad as { ad_strength?: unknown } | undefined)?.ad_strength ?? "");
    const rawStatus = String((r.ad_group_ad as { status?: unknown } | undefined)?.status ?? "");
    const rawType = String((ad as { type?: unknown } | undefined)?.type ?? "");

    const finalUrls = Array.isArray((ad as { final_urls?: unknown } | undefined)?.final_urls)
      ? ((ad as { final_urls?: unknown[] }).final_urls as unknown[]).map((u) => String(u ?? ""))
      : [];

    return {
      campaign: String(r.campaign?.name ?? ""),
      adGroup: String(r.ad_group?.name ?? ""),
      adId: String((ad as { id?: unknown } | undefined)?.id ?? ""),
      adType: AD_TYPE_LABELS[rawType] ?? rawType ?? "Unknown",
      finalUrls,
      adStrength: AD_STRENGTH_LABELS[rawStrength] ?? "Unknown",
      status: STATUS_LABELS[rawStatus] ?? rawStatus,
      impressions,
      clicks,
      ctr: impressions > 0 ? clicks / impressions : 0,
      spend,
      conversions,
      cpa: conversions > 0 ? spend / conversions : 0,
      assets: [],
    };
  });

  // Asset-level pass. RSA asset metrics are sparse — only impressions/clicks are
  // reliably populated. We key assets by (campaign, adGroup, text, fieldType)
  // because ad_group_ad_asset_view does not surface a stable ad id we can join.
  const assetRows = await customer.query(`
    SELECT
      campaign.name,
      campaign.status,
      ad_group.name,
      ad_group.status,
      ad_group_ad_asset_view.field_type,
      ad_group_ad_asset_view.performance_label,
      asset.text_asset.text,
      metrics.impressions,
      metrics.clicks
    FROM ad_group_ad_asset_view
    WHERE segments.date BETWEEN '${dateRange.start}' AND '${dateRange.end}'
      AND campaign.status = 'ENABLED'
      AND ad_group.status = 'ENABLED'${campaignClause}${adGroupClause}
  `);

  // Aggregate by (campaign, adGroup, fieldType, text). Attach assets to every ad
  // in the same (campaign, adGroup) — there is typically one RSA per ad group
  // so this is accurate; for multi-RSA ad groups assets are shown against each.
  const assetsByGroup = new Map<string, AdAssetPerformanceRow[]>();
  for (const r of assetRows) {
    const fieldTypeRaw = String((r.ad_group_ad_asset_view as { field_type?: unknown } | undefined)?.field_type ?? "");
    const fieldType = FIELD_TYPE_LABELS[fieldTypeRaw] ?? "OTHER";
    if (fieldType === "OTHER") continue;

    const text = String((r.asset as { text_asset?: { text?: unknown } } | undefined)?.text_asset?.text ?? "").trim();
    if (!text) continue;

    const perfRaw = String(
      (r.ad_group_ad_asset_view as { performance_label?: unknown } | undefined)?.performance_label ?? "",
    );
    const performanceLabel = ASSET_PERFORMANCE_LABELS[perfRaw] ?? "UNKNOWN";

    const m = r.metrics ?? {};
    const campaign = String(r.campaign?.name ?? "");
    const adGroup = String(r.ad_group?.name ?? "");
    const key = `${campaign}\u0000${adGroup}`;

    const list = assetsByGroup.get(key) ?? [];
    list.push({
      campaign,
      adGroup,
      fieldType,
      text,
      performanceLabel,
      impressions: Number(m.impressions ?? 0),
      clicks: Number(m.clicks ?? 0),
    });
    assetsByGroup.set(key, list);
  }

  for (const ad of ads) {
    const key = `${ad.campaign}\u0000${ad.adGroup}`;
    const list = assetsByGroup.get(key);
    if (!list) continue;
    // Sort: headlines first, then by impressions desc.
    ad.assets = [...list].sort((a, b) => {
      if (a.fieldType !== b.fieldType) return a.fieldType === "HEADLINE" ? -1 : 1;
      return b.impressions - a.impressions;
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    dateRange,
    campaignFilter,
    ads,
  };
}
