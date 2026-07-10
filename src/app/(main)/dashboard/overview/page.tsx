import { OverviewContent } from "./_components/overview-content";

export default function OverviewPage() {
  return (
    <div className="mx-auto flex min-h-0 w-full max-w-screen-2xl flex-col gap-8">
      <section id="overview" className="scroll-mt-24">
        <h1 className="font-heading font-semibold text-2xl tracking-tight md:text-3xl">Overview</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          AI-generated performance summary and next steps for every campaign in the selected date range, with a
          follow-up chat grounded in the same data.
        </p>
      </section>

      <OverviewContent />
    </div>
  );
}
