"use client";

import { useFiltersStore } from "@/stores/filters/filters-provider";
import type { DateRange } from "@/types/google-ads";

export function useDateRange(): [DateRange, (range: DateRange) => void] {
  const dateRange = useFiltersStore((s) => s.dateRange);
  const setDateRange = useFiltersStore((s) => s.setDateRange);
  return [dateRange, setDateRange];
}
