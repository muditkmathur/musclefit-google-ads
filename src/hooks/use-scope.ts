"use client";

import { useSearchParams } from "next/navigation";

export interface Scope {
  campaign: string | null;
  adGroup: string | null;
}

export function useScope(): Scope {
  const params = useSearchParams();
  return {
    campaign: params.get("campaign"),
    adGroup: params.get("adGroup"),
  };
}
