"use client";

import { useFiltersStore } from "@/stores/filters/filters-provider";

export interface Scope {
  campaign: string | null;
  adGroup: string | null;
}

export function useScope(): Scope {
  const campaign = useFiltersStore((s) => s.campaign);
  const adGroup = useFiltersStore((s) => s.adGroup);
  return { campaign, adGroup };
}
