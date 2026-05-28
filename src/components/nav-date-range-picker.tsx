"use client";

import { DateRangePicker } from "@/components/date-range-picker";
import { useDateRange } from "@/hooks/use-date-range";

export function NavDateRangePicker() {
  const [dateRange, setDateRange] = useDateRange();
  return <DateRangePicker value={dateRange} onChange={setDateRange} className="h-8 text-xs" />;
}
