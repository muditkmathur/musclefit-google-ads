import { createStore } from "zustand/vanilla";

import { last30Days } from "@/lib/date-presets";
import type { DateRange } from "@/types/google-ads";

import { persistDateRange } from "./filters-storage";

export type FiltersState = {
  dateRange: DateRange;
  campaign: string | null;
  adGroup: string | null;
  setDateRange: (range: DateRange) => void;
  setScope: (campaign: string | null, adGroup: string | null) => void;
};

export const createFiltersStore = () =>
  createStore<FiltersState>()((set) => ({
    dateRange: last30Days(),
    campaign: null,
    adGroup: null,
    setDateRange: (range) => {
      persistDateRange(range);
      set({ dateRange: range });
    },
    setScope: (campaign, adGroup) => set({ campaign, adGroup }),
  }));
