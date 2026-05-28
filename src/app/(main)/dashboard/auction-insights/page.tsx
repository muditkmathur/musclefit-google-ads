import { AuctionInsightsCard } from "./_components/auction-insights-card";

export default function AuctionInsightsPage() {
  return (
    <div className="mx-auto flex min-h-0 w-full max-w-screen-2xl flex-col gap-8">
      <section id="overview" className="scroll-mt-24">
        <h1 className="font-heading font-semibold text-2xl tracking-tight md:text-3xl">Auction insights</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Domains you compete with on Search auctions, aggregated across the top-spend keywords in each campaign. Use
          this to explain &ldquo;Lost IS (rank)&rdquo; on the Campaigns page — when overlap rate is high and outranking
          share is low, competition is the bottleneck, not your QS.
        </p>
      </section>

      <div className="flex flex-col gap-6">
        <section id="auction-insights" className="scroll-mt-24">
          <AuctionInsightsCard />
        </section>
      </div>
    </div>
  );
}
