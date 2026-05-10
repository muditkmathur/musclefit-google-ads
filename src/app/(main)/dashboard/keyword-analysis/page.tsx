import { Badge } from "@/components/ui/badge";

import { KeywordAnalysisCard } from "./_components/keyword-analysis-card";

export default function KeywordAnalysisPage() {
  return (
    <div className="mx-auto flex min-h-0 w-full max-w-screen-2xl flex-col gap-8">
      <section id="overview" className="scroll-mt-24">
        <div className="mb-2 flex flex-wrap gap-2">
          <Badge>muscle fit</Badge>
          <Badge variant="outline">Google Ads</Badge>
        </div>
        <h1 className="font-heading font-semibold text-2xl tracking-tight md:text-3xl">Keyword analysis</h1>
      </section>

      <div className="flex flex-col gap-6">
        <section id="keyword-analysis" className="scroll-mt-24">
          <KeywordAnalysisCard />
        </section>
      </div>
    </div>
  );
}
