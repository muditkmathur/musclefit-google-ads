"use client";

import { getLocalStorageValue, setLocalStorageValue } from "@/lib/local-storage.client";
import type { DateRange } from "@/types/google-ads";

const STORAGE_KEY = "ga:dashboard:date_range";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDateRange(value: unknown): value is DateRange {
  if (!value || typeof value !== "object") return false;
  const { start, end } = value as DateRange;
  if (typeof start !== "string" || typeof end !== "string") return false;
  if (!ISO_DATE_RE.test(start) || !ISO_DATE_RE.test(end)) return false;
  return start <= end;
}

export function loadPersistedDateRange(): DateRange | null {
  const raw = getLocalStorageValue(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isValidDateRange(parsed)) return parsed;
  } catch {
    // ignore corrupt storage
  }
  return null;
}

export function persistDateRange(range: DateRange): void {
  setLocalStorageValue(STORAGE_KEY, JSON.stringify(range));
}
