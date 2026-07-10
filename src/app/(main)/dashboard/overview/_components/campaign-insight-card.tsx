import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { CampaignHealth, CampaignInsight } from "@/types/google-ads";

const HEALTH_CONFIG: Record<CampaignHealth, { label: string; className: string }> = {
  "on-track": { label: "On track", className: "bg-green-500/10 text-green-700 dark:text-green-400" },
  "needs-attention": { label: "Needs attention", className: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  "at-risk": { label: "At risk", className: "bg-destructive/10 text-destructive" },
};

export function CampaignInsightCard({ insight }: { insight: CampaignInsight }) {
  const health = HEALTH_CONFIG[insight.health];
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">{insight.campaignName}</CardTitle>
        <Badge className={cn("shrink-0", health.className)} variant="outline">
          {health.label}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-muted-foreground text-sm">{insight.summary}</p>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {insight.nextSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
