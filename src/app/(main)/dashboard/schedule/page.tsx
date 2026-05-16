import { ScheduleHeatmapCard } from "./_components/schedule-heatmap-card";

export default function SchedulePage() {
  return (
    <div className="mx-auto flex min-h-0 w-full max-w-screen-2xl flex-col gap-8">
      <section id="overview" className="scroll-mt-24">
        <h1 className="font-heading font-semibold text-2xl tracking-tight md:text-3xl">Schedule performance</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Identify peak hours and days to inform ad scheduling and bid adjustments.
        </p>
      </section>

      <div className="flex flex-col gap-6">
        <section id="heatmap" className="scroll-mt-24">
          <ScheduleHeatmapCard />
        </section>
      </div>
    </div>
  );
}
