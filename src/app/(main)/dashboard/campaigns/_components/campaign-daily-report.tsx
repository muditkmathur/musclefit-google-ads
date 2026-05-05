"use client";

import { type ReactNode, useEffect, useState } from "react";

import { ArrowDown, ArrowUp, Minus } from "lucide-react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import type { CampaignDailyEntry, CampaignDailyReport, DiffValue } from "@/types/google-ads";

type ImprovementDirection = "higher" | "lower";

interface MetricCellProps {
  value: ReactNode;
  dod: DiffValue | null;
  formatDelta: (delta: number) => string;
  improvement: ImprovementDirection;
}

function MetricCell({ value, dod, formatDelta, improvement }: MetricCellProps) {
  if (!dod) {
    return (
      <div className="flex flex-col items-end gap-0.5">
        <span className="tabular-nums">{value}</span>
        <span className="text-muted-foreground text-xs">—</span>
      </div>
    );
  }

  const isFlat = dod.direction === "flat" || dod.delta === 0;
  const isGood = !isFlat && (improvement === "higher" ? dod.delta > 0 : dod.delta < 0);
  const Icon = isFlat ? Minus : dod.delta > 0 ? ArrowUp : ArrowDown;

  const tone = isFlat
    ? "text-muted-foreground"
    : isGood
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-red-600 dark:text-red-400";

  const sign = dod.delta > 0 ? "+" : "";
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="tabular-nums">{value}</span>
      <span className={cn("inline-flex items-center gap-0.5 text-xs tabular-nums", tone)}>
        <Icon className="size-3" aria-hidden />
        {`${sign}${formatDelta(dod.delta)}`}
      </span>
    </div>
  );
}

function formatInt(n: number): string {
  return n.toLocaleString();
}

function formatRupees(n: number): string {
  return `₹${n.toFixed(2)}`;
}

function formatPercent(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toFixed(2)}%`;
}

function CampaignDailyTable({ campaign, days }: { campaign: string; days: CampaignDailyEntry[] }) {
  const sortedDays = [...days].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="space-y-2">
      <h4 className="font-medium text-sm">{campaign}</h4>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Impr.</TableHead>
              <TableHead className="text-right">Clicks</TableHead>
              <TableHead className="text-right">CTR</TableHead>
              <TableHead className="text-right">Avg. CPC</TableHead>
              <TableHead className="text-right">Spend</TableHead>
              <TableHead className="text-right">Conv.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedDays.map((d) => (
              <TableRow key={d.date}>
                <TableCell className="font-medium tabular-nums">{d.date}</TableCell>
                <TableCell className="text-right">
                  <MetricCell
                    value={formatInt(d.impressions)}
                    dod={d.dod?.impressions ?? null}
                    formatDelta={(x) => formatInt(Math.abs(x))}
                    improvement="higher"
                  />
                </TableCell>
                <TableCell className="text-right">
                  <MetricCell
                    value={formatInt(d.clicks)}
                    dod={d.dod?.clicks ?? null}
                    formatDelta={(x) => formatInt(Math.abs(x))}
                    improvement="higher"
                  />
                </TableCell>
                <TableCell className="text-right">
                  <MetricCell
                    value={formatPercent(d.ctr)}
                    dod={d.dod?.ctr ?? null}
                    formatDelta={(x) => `${Math.abs(x).toFixed(2)}pp`}
                    improvement="higher"
                  />
                </TableCell>
                <TableCell className="text-right">
                  <MetricCell
                    value={formatRupees(d.avg_cpc)}
                    dod={d.dod?.avg_cpc ?? null}
                    formatDelta={(x) => formatRupees(Math.abs(x))}
                    improvement="lower"
                  />
                </TableCell>
                <TableCell className="text-right">
                  <MetricCell
                    value={formatRupees(d.spend)}
                    dod={d.dod?.spend ?? null}
                    formatDelta={(x) => formatRupees(Math.abs(x))}
                    improvement="higher"
                  />
                </TableCell>
                <TableCell className="text-right">
                  <MetricCell
                    value={formatInt(d.conversions)}
                    dod={d.dod?.conversions ?? null}
                    formatDelta={(x) => formatInt(Math.abs(x))}
                    improvement="higher"
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export function CampaignDailyReportSection({ daily }: { daily: CampaignDailyReport }) {
  const firstCampaign = daily.campaigns[0]?.campaign ?? null;
  const [selected, setSelected] = useState<string | null>(firstCampaign);

  useEffect(() => {
    const exists = selected && daily.campaigns.some((c) => c.campaign === selected);
    if (!exists) {
      setSelected(daily.campaigns[0]?.campaign ?? null);
    }
  }, [daily, selected]);

  const selectedCampaign = daily.campaigns.find((c) => c.campaign === selected) ?? daily.campaigns[0];

  return (
    <section className="space-y-4">
      <div>
        <h3 className="font-semibold text-base">Daily breakdown (DoD)</h3>
        <p className="text-muted-foreground text-sm">
          {daily.period} ({daily.date_range.start} → {daily.date_range.end}) · {daily.campaigns.length} campaigns
        </p>
      </div>

      {daily.campaigns.length > 0 && (
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          spacing={1}
          value={selectedCampaign?.campaign ?? ""}
          onValueChange={(value) => {
            if (value) setSelected(value);
          }}
          className="flex-wrap"
          aria-label="Filter daily breakdown by campaign"
        >
          {daily.campaigns.map((c) => (
            <ToggleGroupItem key={c.campaign} value={c.campaign} className="text-xs">
              {c.campaign}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}

      {selectedCampaign && <CampaignDailyTable campaign={selectedCampaign.campaign} days={selectedCampaign.days} />}
    </section>
  );
}
