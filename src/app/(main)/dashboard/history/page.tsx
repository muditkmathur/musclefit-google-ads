import { ChangeHistoryCard } from "./_components/change-history-card";

export default function HistoryPage() {
  return (
    <div className="mx-auto flex min-h-0 w-full max-w-screen-2xl flex-col gap-8">
      <section id="overview" className="scroll-mt-24">
        <h1 className="font-heading font-semibold text-2xl tracking-tight md:text-3xl">Change history</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Full audit log of every change made to campaigns, budgets, keywords, and ads. Use this to correlate
          performance shifts with specific changes.
        </p>
      </section>

      <div className="flex flex-col gap-6">
        <section id="history" className="scroll-mt-24">
          <ChangeHistoryCard />
        </section>
      </div>
    </div>
  );
}
