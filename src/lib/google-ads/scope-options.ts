import { buildCacheKey, getOrSetJson } from "@/lib/cache/query-cache";
import { CACHE_TTL_SECONDS } from "@/lib/cache/redis";
import type { ScopeCampaign, ScopeOptions } from "@/types/google-ads";

import { getCustomer, getCustomerId } from "./client";

export interface RunScopeOptionsOptions {
  forceRefresh?: boolean;
}

export async function runScopeOptions(options: RunScopeOptionsOptions = {}): Promise<ScopeOptions> {
  const cacheKey = buildCacheKey("scope-options:v1", { customerId: getCustomerId() });
  return getOrSetJson<ScopeOptions>(cacheKey, fetchScopeOptions, CACHE_TTL_SECONDS, {
    forceRefresh: options.forceRefresh === true,
  });
}

async function fetchScopeOptions(): Promise<ScopeOptions> {
  const customer = await getCustomer();
  const rows = await customer.query(`
    SELECT
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      ad_group.name,
      ad_group.status
    FROM ad_group
    WHERE campaign.status IN ('ENABLED', 'PAUSED')
      AND ad_group.status IN ('ENABLED', 'PAUSED')
    ORDER BY campaign.name, ad_group.name
  `);

  const campaignMap = new Map<string, ScopeCampaign>();

  for (const r of rows) {
    const campaignName = String(r.campaign?.name ?? "");
    if (!campaignName) continue;

    if (!campaignMap.has(campaignName)) {
      campaignMap.set(campaignName, {
        name: campaignName,
        status: String(r.campaign?.status ?? ""),
        type: String(r.campaign?.advertising_channel_type ?? ""),
        adGroups: [],
      });
    }

    const adGroupName = String(r.ad_group?.name ?? "");
    if (adGroupName) {
      campaignMap.get(campaignName)!.adGroups.push({
        name: adGroupName,
        status: String(r.ad_group?.status ?? ""),
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    campaigns: Array.from(campaignMap.values()),
  };
}
