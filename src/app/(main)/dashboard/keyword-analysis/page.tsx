import Link from "next/link";

import { Badge } from "@/components/ui/badge";

import { NgramAnalysisCard } from "../campaigns/_components/ngram-analysis-card";
import { SearchTermsCard } from "../campaigns/_components/search-terms-card";

export default function KeywordAnalysisPage() {
  return (
    <div className="mx-auto flex min-h-0 w-full max-w-screen-2xl flex-col gap-8">
      <section id="overview" className="scroll-mt-24">
        <div className="mb-2 flex flex-wrap gap-2">
          <Badge>muscle fit</Badge>
          <Badge variant="outline">Google Ads</Badge>
        </div>
        <h1 className="font-heading font-semibold text-2xl tracking-tight md:text-3xl">Keyword analysis</h1>
        <p className="mt-2 max-w-3xl text-muted-foreground text-sm leading-relaxed">
          Search terms and n-gram views align with the CLI (
          <code className="rounded bg-muted px-1 py-0.5 text-xs">pnpm search-terms</code>,{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">pnpm ngram-analysis</code>
          ). Campaign reporting is on{" "}
          <Link href="/dashboard/campaigns" className="font-medium text-primary underline-offset-4 hover:underline">
            Campaigns
          </Link>
          .
        </p>
      </section>

      <div className="flex flex-col gap-6">
        <section id="search-terms" className="scroll-mt-24">
          <SearchTermsCard />
        </section>
        <section id="ngram-analysis" className="scroll-mt-24">
          <NgramAnalysisCard />
        </section>
      </div>
    </div>
  );
}
