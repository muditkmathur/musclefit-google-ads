import { QualityScoreCard } from "./_components/quality-score-card";

export default function QualityScorePage() {
  return (
    <div className="mx-auto flex min-h-0 w-full max-w-screen-2xl flex-col gap-8">
      <section id="overview" className="scroll-mt-24">
        <h1 className="font-heading font-semibold text-2xl tracking-tight md:text-3xl">Quality Score</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Quality Score (1–10) is Google's rating of your keyword relevance. A low score means Google charges you more
          per click and shows your ad less often — it is the root cause of high Lost IS (Rank). Fix the lowest-scoring
          keywords before raising bids.
        </p>
      </section>

      <div className="flex flex-col gap-6">
        <section id="quality-score" className="scroll-mt-24">
          <QualityScoreCard />
        </section>
      </div>
    </div>
  );
}
