import { AdPerformanceCard } from "./_components/ad-performance-card";

export default function AdPerformancePage() {
  return (
    <div className="mx-auto flex min-h-0 w-full max-w-screen-2xl flex-col gap-8">
      <section id="overview" className="scroll-mt-24">
        <h1 className="font-heading font-semibold text-2xl tracking-tight md:text-3xl">Ad performance</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Per-ad spend, conversions, RSA ad strength, and per-asset (headline / description) performance labels. Pair
          with Quality Score to fix &ldquo;Ad relevance&rdquo; bottlenecks at the right ad group.
        </p>
      </section>

      <div className="flex flex-col gap-6">
        <section id="ad-performance" className="scroll-mt-24">
          <AdPerformanceCard />
        </section>
      </div>
    </div>
  );
}
