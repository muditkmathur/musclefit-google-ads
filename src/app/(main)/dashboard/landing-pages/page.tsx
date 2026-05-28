import { LandingPagesCard } from "./_components/landing-pages-card";

export default function LandingPagesPage() {
  return (
    <div className="mx-auto flex min-h-0 w-full max-w-screen-2xl flex-col gap-8">
      <section id="overview" className="scroll-mt-24">
        <h1 className="font-heading font-semibold text-2xl tracking-tight md:text-3xl">Landing pages</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Spend, CTR, CPA, and conversion rate aggregated by final URL. Pair this with the Quality Score page — when
          landing-page-experience is &ldquo;Below average&rdquo;, the URL almost always shows up here with weak
          performance.
        </p>
      </section>

      <div className="flex flex-col gap-6">
        <section id="landing-pages" className="scroll-mt-24">
          <LandingPagesCard />
        </section>
      </div>
    </div>
  );
}
