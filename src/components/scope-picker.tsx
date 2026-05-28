"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { ChevronDown, ChevronRight, LayoutGrid, MonitorPlay, Search, ShoppingBag, Video, Zap } from "lucide-react";

import { getScopeOptions } from "@/app/actions/google-ads";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useFiltersStore } from "@/stores/filters/filters-provider";
import type { ScopeCampaign, ScopeOptions } from "@/types/google-ads";

function campaignIcon(type: string) {
  switch (type) {
    case "SEARCH":
      return <Search className="h-3.5 w-3.5 shrink-0" />;
    case "PERFORMANCE_MAX":
      return <Zap className="h-3.5 w-3.5 shrink-0" />;
    case "DISPLAY":
      return <MonitorPlay className="h-3.5 w-3.5 shrink-0" />;
    case "SHOPPING":
      return <ShoppingBag className="h-3.5 w-3.5 shrink-0" />;
    case "VIDEO":
      return <Video className="h-3.5 w-3.5 shrink-0" />;
    default:
      return <LayoutGrid className="h-3.5 w-3.5 shrink-0" />;
  }
}

function triggerLabel(campaign: string | null, adGroup: string | null): string {
  if (!campaign) return "All campaigns";
  if (!adGroup) return campaign;
  return `${campaign} › ${adGroup}`;
}

export function ScopePicker() {
  const campaign = useFiltersStore((s) => s.campaign);
  const adGroup = useFiltersStore((s) => s.adGroup);
  const setScope = useFiltersStore((s) => s.setScope);

  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ScopeOptions | null>(null);
  const [query, setQuery] = useState("");
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    void getScopeOptions().then((res) => {
      if (res.ok) setOptions(res.data);
    });
  }, []);

  const filteredCampaigns = useMemo((): ScopeCampaign[] => {
    if (!options) return [];
    if (!query) return options.campaigns;
    const q = query.toLowerCase();
    return options.campaigns.filter(
      (c) => c.name.toLowerCase().includes(q) || c.adGroups.some((ag) => ag.name.toLowerCase().includes(q)),
    );
  }, [options, query]);

  const select = useCallback(
    (c: string | null, ag: string | null) => {
      setScope(c, ag);
      setOpen(false);
      setQuery("");
    },
    [setScope],
  );

  const toggleExpand = (name: string) =>
    setExpandedCampaigns((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 max-w-[240px] justify-between gap-1 truncate text-xs">
          <span className="truncate">{triggerLabel(campaign, adGroup)}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <div className="border-b p-2">
          <input
            className="w-full rounded-sm bg-transparent px-2 py-1 text-xs outline-none placeholder:text-muted-foreground"
            placeholder="Search campaigns or ad groups…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="max-h-72 overflow-y-auto py-1">
          <button
            type="button"
            className={cn(
              "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted",
              !campaign && "bg-muted font-medium",
            )}
            onClick={() => select(null, null)}
          >
            <LayoutGrid className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            All campaigns
          </button>

          {filteredCampaigns.map((c) => {
            const isExpanded =
              expandedCampaigns.has(c.name) ||
              (!!query && c.adGroups.some((ag) => ag.name.toLowerCase().includes(query.toLowerCase())));
            const isCampaignSelected = campaign === c.name && !adGroup;
            return (
              <div key={c.name}>
                <div className="flex items-center">
                  <button
                    type="button"
                    className="flex items-center p-1.5 text-muted-foreground hover:text-foreground"
                    onClick={() => toggleExpand(c.name)}
                    aria-label={isExpanded ? "Collapse" : "Expand"}
                  >
                    {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "flex flex-1 items-center gap-2 py-1.5 pr-3 text-left text-xs hover:bg-muted",
                      isCampaignSelected && "bg-muted font-medium",
                    )}
                    onClick={() => select(c.name, null)}
                  >
                    {campaignIcon(c.type)}
                    <span className="truncate">{c.name}</span>
                  </button>
                </div>

                {isExpanded &&
                  c.adGroups
                    .filter(
                      (ag) =>
                        !query ||
                        ag.name.toLowerCase().includes(query.toLowerCase()) ||
                        c.name.toLowerCase().includes(query.toLowerCase()),
                    )
                    .map((ag) => {
                      const isAdGroupSelected = campaign === c.name && adGroup === ag.name;
                      return (
                        <button
                          key={ag.name}
                          type="button"
                          className={cn(
                            "flex w-full items-center gap-2 py-1.5 pr-3 pl-9 text-left text-xs hover:bg-muted",
                            isAdGroupSelected && "bg-muted font-medium",
                          )}
                          onClick={() => select(c.name, ag.name)}
                        >
                          <span className="truncate text-muted-foreground">{ag.name}</span>
                        </button>
                      );
                    })}
              </div>
            );
          })}

          {filteredCampaigns.length === 0 && options && (
            <div className="px-3 py-4 text-center text-muted-foreground text-xs">No results</div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
