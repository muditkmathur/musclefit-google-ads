import { KeywordSearchTermsCard } from "./_components/keyword-search-terms-card";

export default function KeywordSearchTermsPage() {
  return (
    <div className="mx-auto flex min-h-0 w-full max-w-screen-2xl flex-col gap-8">
      <section id="overview" className="scroll-mt-24">
        <h1 className="font-heading font-semibold text-2xl tracking-tight md:text-3xl">Keyword ↔ Search terms</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Every search term mapped back to the keyword that triggered it. Use this to spot Broad-match keywords pulling
          irrelevant queries, intent mismatches between keyword and search term, and high-spend zero-conversion terms
          that should become negatives.
        </p>
      </section>

      <div className="flex flex-col gap-6">
        <section id="keyword-search-terms" className="scroll-mt-24">
          <KeywordSearchTermsCard />
        </section>
      </div>
    </div>
  );
}
