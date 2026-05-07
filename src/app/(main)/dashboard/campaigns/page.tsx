import { CampaignReportCard } from "./_components/campaign-report-card";

export default function CampaignsPage() {
  return (
    <div className="mx-auto flex min-h-0 w-full max-w-screen-2xl flex-col gap-8">
      <section id="overview" className="scroll-mt-24">
        <h1 className="font-heading font-semibold text-2xl tracking-tight md:text-3xl">Campaigns</h1>
      </section>

      <div className="flex flex-col gap-6">
        <section id="campaign-report" className="scroll-mt-24">
          <CampaignReportCard />
        </section>
      </div>
    </div>
  );
}
