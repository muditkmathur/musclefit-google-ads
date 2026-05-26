"use client";

import { useState } from "react";

import { CalendarIcon } from "lucide-react";
import type { DateRange as DayPickerRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { type DatePreset, PRESET_LABELS, resolveDatePreset } from "@/lib/date-presets";
import { cn } from "@/lib/utils";
import type { DateRange } from "@/types/google-ads";

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  className?: string;
}

const PRESETS: DatePreset[] = [
  "today",
  "yesterday",
  "last-7-days",
  "last-14-days",
  "last-30-days",
  "this-week",
  "last-week",
  "this-month",
  "last-month",
  "all-time",
];

function fmtYmd(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const dy = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${dy}`;
}

function formatDisplay(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function toInputFmt(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function fromInputFmt(s: string): string | null {
  const parts = s.split("/");
  if (parts.length !== 3) return null;
  const [d, m, y] = parts;
  if (!d || !m || !y || y.length !== 4) return null;
  const iso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return iso;
}

function matchPreset(range: DateRange): DatePreset | null {
  for (const p of PRESETS) {
    const r = resolveDatePreset(p);
    if (r.start === range.start && r.end === range.end) return p;
  }
  return null;
}

export function DateRangePicker({ value, onChange, className }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<DateRange | null>(null);
  const [startInput, setStartInput] = useState("");
  const [endInput, setEndInput] = useState("");
  const [nDaysToday, setNDaysToday] = useState("30");
  const [nDaysYesterday, setNDaysYesterday] = useState("30");

  const current = pending ?? value;

  function handleOpenChange(next: boolean) {
    if (next) {
      setPending(value);
      setStartInput(toInputFmt(value.start));
      setEndInput(toInputFmt(value.end));
    } else {
      setPending(null);
    }
    setOpen(next);
  }

  function applyPreset(preset: DatePreset) {
    onChange(resolveDatePreset(preset));
    setPending(null);
    setOpen(false);
  }

  function applyNDays(n: number, endOffset: number) {
    const end = new Date();
    end.setDate(end.getDate() - endOffset);
    const start = new Date(end);
    start.setDate(start.getDate() - (n - 1));
    onChange({ start: fmtYmd(start), end: fmtYmd(end) });
    setPending(null);
    setOpen(false);
  }

  function handleCalendarSelect(sel: DayPickerRange | undefined) {
    if (!sel?.from) return;
    const start = fmtYmd(sel.from);
    const end = sel.to ? fmtYmd(sel.to) : start;
    setPending({ start, end });
    setStartInput(toInputFmt(start));
    setEndInput(toInputFmt(end));
  }

  function handleStartInput(val: string) {
    setStartInput(val);
    const iso = fromInputFmt(val);
    if (iso && current) {
      const end = iso > current.end ? iso : current.end;
      setPending({ start: iso, end });
    }
  }

  function handleEndInput(val: string) {
    setEndInput(val);
    const iso = fromInputFmt(val);
    if (iso && current) {
      const start = iso < current.start ? iso : current.start;
      setPending({ start, end: iso });
    }
  }

  function handleApply() {
    if (pending) {
      onChange(pending);
      setPending(null);
      setOpen(false);
    }
  }

  function triggerLabel(): string {
    const preset = matchPreset(value);
    if (preset) return PRESET_LABELS[preset];
    return `${formatDisplay(value.start)} – ${formatDisplay(value.end)}`;
  }

  const calFrom = new Date(`${current.start}T00:00:00`);
  const calTo = new Date(`${current.end}T00:00:00`);
  const activeP = matchPreset(current);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn("gap-2", className)}>
          <CalendarIcon className="h-4 w-4" />
          {triggerLabel()}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex">
          {/* Left: Presets */}
          <div className="flex w-44 flex-col gap-0.5 border-r p-2">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => applyPreset(p)}
                className={cn(
                  "rounded px-3 py-1.5 text-left text-sm hover:bg-muted",
                  activeP === p && "bg-muted font-medium",
                )}
              >
                {PRESET_LABELS[p]}
              </button>
            ))}
            <div className="mt-2 flex flex-col gap-1.5 border-t pt-2">
              <div className="flex items-center gap-1">
                <Input
                  className="h-6 w-14 px-1.5 text-xs"
                  value={nDaysToday}
                  onChange={(e) => setNDaysToday(e.target.value)}
                  onBlur={() => {
                    const n = parseInt(nDaysToday, 10);
                    if (n > 0) applyNDays(n, 0);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const n = parseInt(nDaysToday, 10);
                      if (n > 0) applyNDays(n, 0);
                    }
                  }}
                />
                <span className="text-muted-foreground text-xs">days to today</span>
              </div>
              <div className="flex items-center gap-1">
                <Input
                  className="h-6 w-14 px-1.5 text-xs"
                  value={nDaysYesterday}
                  onChange={(e) => setNDaysYesterday(e.target.value)}
                  onBlur={() => {
                    const n = parseInt(nDaysYesterday, 10);
                    if (n > 0) applyNDays(n, 1);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const n = parseInt(nDaysYesterday, 10);
                      if (n > 0) applyNDays(n, 1);
                    }
                  }}
                />
                <span className="text-muted-foreground text-xs">days to yesterday</span>
              </div>
            </div>
          </div>

          {/* Right: Calendar */}
          <div className="p-3">
            <div className="mb-2 flex gap-2">
              <div className="flex flex-col gap-0.5">
                <label htmlFor="drp-start" className="text-muted-foreground text-xs">Start date</label>
                <Input
                  id="drp-start"
                  className="h-7 w-28 text-xs"
                  placeholder="DD/MM/YYYY"
                  value={startInput}
                  onChange={(e) => handleStartInput(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-0.5">
                <label htmlFor="drp-end" className="text-muted-foreground text-xs">End date</label>
                <Input
                  id="drp-end"
                  className="h-7 w-28 text-xs"
                  placeholder="DD/MM/YYYY"
                  value={endInput}
                  onChange={(e) => handleEndInput(e.target.value)}
                />
              </div>
            </div>
            <Calendar
              mode="range"
              selected={{ from: calFrom, to: calTo }}
              onSelect={handleCalendarSelect}
              numberOfMonths={1}
            />
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button size="sm" disabled={!pending} onClick={handleApply}>
                Apply
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
