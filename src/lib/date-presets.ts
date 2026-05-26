import type { CampaignRangeKey, DateRange } from "@/types/google-ads";

export type DatePreset =
  | "today"
  | "yesterday"
  | "last-7-days"
  | "last-14-days"
  | "last-30-days"
  | "this-week"
  | "last-week"
  | "this-month"
  | "last-month"
  | "all-time";

export const PRESET_LABELS: Record<DatePreset, string> = {
  today: "Today",
  yesterday: "Yesterday",
  "last-7-days": "Last 7 days",
  "last-14-days": "Last 14 days",
  "last-30-days": "Last 30 days",
  "this-week": "This week",
  "last-week": "Last week",
  "this-month": "This month",
  "last-month": "Last month",
  "all-time": "All time",
};

function fmtYmd(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const dy = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${dy}`;
}

export function resolveDatePreset(preset: DatePreset): DateRange {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  switch (preset) {
    case "today":
      return { start: fmtYmd(today), end: fmtYmd(today) };

    case "yesterday": {
      const d = new Date(today);
      d.setDate(d.getDate() - 1);
      return { start: fmtYmd(d), end: fmtYmd(d) };
    }

    case "last-7-days": {
      const start = new Date(today);
      start.setDate(start.getDate() - 6);
      return { start: fmtYmd(start), end: fmtYmd(today) };
    }

    case "last-14-days": {
      const start = new Date(today);
      start.setDate(start.getDate() - 13);
      return { start: fmtYmd(start), end: fmtYmd(today) };
    }

    case "last-30-days": {
      const start = new Date(today);
      start.setDate(start.getDate() - 29);
      return { start: fmtYmd(start), end: fmtYmd(today) };
    }

    case "this-week": {
      const d = new Date(today);
      const dow = d.getDay(); // 0=Sun
      const diff = dow === 0 ? -6 : 1 - dow;
      d.setDate(d.getDate() + diff);
      return { start: fmtYmd(d), end: fmtYmd(today) };
    }

    case "last-week": {
      const dow = today.getDay();
      const thisMon = new Date(today);
      thisMon.setDate(today.getDate() + (dow === 0 ? -6 : 1 - dow));
      const lastSun = new Date(thisMon);
      lastSun.setDate(lastSun.getDate() - 1);
      const lastMon = new Date(lastSun);
      lastMon.setDate(lastMon.getDate() - 6);
      return { start: fmtYmd(lastMon), end: fmtYmd(lastSun) };
    }

    case "this-month": {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return { start: fmtYmd(start), end: fmtYmd(today) };
    }

    case "last-month": {
      const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastOfPrev = new Date(firstOfMonth);
      lastOfPrev.setDate(lastOfPrev.getDate() - 1);
      const firstOfPrev = new Date(lastOfPrev.getFullYear(), lastOfPrev.getMonth(), 1);
      return { start: fmtYmd(firstOfPrev), end: fmtYmd(lastOfPrev) };
    }

    case "all-time":
      return { start: "2020-01-01", end: fmtYmd(today) };
  }
}

export function last30Days(): DateRange {
  return resolveDatePreset("last-30-days");
}

// ─── Backward-compat helpers (previously in report.ts) ───────────────────────

export function dateRangeForLastNDays(n: number): DateRange {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - (n - 1));
  return { start: fmtYmd(start), end: fmtYmd(end) };
}

function daysForRangeKey(range: CampaignRangeKey): number {
  const now = new Date();
  switch (range) {
    case "last-7-days":
      return 7;
    case "last-4-weeks":
      return 28;
    case "last-3-months":
      return 90;
    case "year-to-date": {
      const start = new Date(now.getFullYear(), 0, 1);
      return Math.round((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    }
  }
}

export function dateRangeForRangeKey(range: CampaignRangeKey): DateRange {
  const end = new Date();
  if (range === "year-to-date") {
    const start = new Date(end.getFullYear(), 0, 1);
    return { start: fmtYmd(start), end: fmtYmd(end) };
  }
  const days = daysForRangeKey(range);
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  return { start: fmtYmd(start), end: fmtYmd(end) };
}
