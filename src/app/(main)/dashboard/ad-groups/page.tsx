import { AdGroupsCard } from "./_components/ad-groups-card";

export default function AdGroupsPage() {
  return (
    <div className="mx-auto flex min-h-0 w-full max-w-screen-2xl flex-col gap-8">
      <section id="overview" className="scroll-mt-24">
        <h1 className="font-heading font-semibold text-2xl tracking-tight md:text-3xl">Ad groups</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Performance breakdown by ad group with Impression Share. Low IS indicates room to grow — check the Campaigns
          page Lost IS columns to diagnose whether budget or rank is the limiting factor.
        </p>
      </section>

      <div className="flex flex-col gap-6">
        <section id="ad-groups" className="scroll-mt-24">
          <AdGroupsCard />
        </section>
      </div>
    </div>
  );
}
