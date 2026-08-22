import { SearchConsolePerformanceCard } from "./_components/search-console-performance-card";

export default function SearchConsolePerformancePage() {
  return (
    <div className="mx-auto flex min-h-0 w-full max-w-screen-2xl flex-col gap-8">
      <section id="overview" className="scroll-mt-24">
        <h1 className="font-heading font-semibold text-2xl tracking-tight md:text-3xl">Search Console performance</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Organic search performance by query and landing page — clicks, impressions, CTR, and average position from
          Google Search Console.
        </p>
      </section>

      <div className="flex flex-col gap-6">
        <section id="search-console-performance" className="scroll-mt-24">
          <SearchConsolePerformanceCard />
        </section>
      </div>
    </div>
  );
}
