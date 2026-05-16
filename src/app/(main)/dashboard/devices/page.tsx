import { DevicePerformanceCard } from "./_components/device-performance-card";

export default function DevicesPage() {
  return (
    <div className="mx-auto flex min-h-0 w-full max-w-screen-2xl flex-col gap-8">
      <section id="overview" className="scroll-mt-24">
        <h1 className="font-heading font-semibold text-2xl tracking-tight md:text-3xl">Device performance</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Compare spend, CPA, and conversions across devices to guide bid adjustments.
        </p>
      </section>

      <div className="flex flex-col gap-6">
        <section id="devices" className="scroll-mt-24">
          <DevicePerformanceCard />
        </section>
      </div>
    </div>
  );
}
