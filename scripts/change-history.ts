import "dotenv/config";
import { runChangeHistory } from "../src/lib/google-ads/change-history";

const usage = `
Usage: pnpm change-history [days] [options]

  days          How many days back to fetch (1–30, default 30)

Options:
  --type <type> Filter by resource type: campaign | budget | keyword | ad | adgroup
  --op <op>     Filter by operation: create | update | remove
  --save        Save raw JSON to output/change-history/

Examples:
  pnpm change-history
  pnpm change-history 14
  pnpm change-history 30 --type budget
  pnpm change-history 30 --op create
`.trim();

const RESOURCE_FILTER_MAP: Record<string, string[]> = {
  campaign: ["CAMPAIGN", "11"],
  budget: ["CAMPAIGN_BUDGET", "15"],
  keyword: ["AD_GROUP_CRITERION", "7"],
  ad: ["AD_GROUP_AD", "4"],
  adgroup: ["AD_GROUP", "3"],
};

const OP_FILTER_MAP: Record<string, string> = {
  create: "CREATE",
  update: "UPDATE",
  remove: "REMOVE",
};

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(usage);
    return;
  }

  const daysArg = args.find((a) => /^\d+$/.test(a));
  const days = daysArg ? Math.min(30, Math.max(1, parseInt(daysArg, 10))) : 30;

  const typeIdx = args.indexOf("--type");
  const typeArg = typeIdx !== -1 ? args[typeIdx + 1]?.toLowerCase() : undefined;
  const typeFilter = typeArg ? RESOURCE_FILTER_MAP[typeArg] : undefined;
  if (typeArg && !typeFilter) {
    console.error(`❌ Unknown --type "${typeArg}". Valid: campaign | budget | keyword | ad | adgroup`);
    process.exit(1);
  }

  const opIdx = args.indexOf("--op");
  const opArg = opIdx !== -1 ? args[opIdx + 1]?.toLowerCase() : undefined;
  const opFilter = opArg ? OP_FILTER_MAP[opArg] : undefined;
  if (opArg && !opFilter) {
    console.error(`❌ Unknown --op "${opArg}". Valid: create | update | remove`);
    process.exit(1);
  }

  const saveToDisk = args.includes("--save");

  try {
    console.log(`\nFetching change history (last ${days} days)…\n`);
    const report = await runChangeHistory({ days });

    let events = report.events;
    if (typeFilter) events = events.filter((e) => typeFilter.includes(e.resourceType));
    if (opFilter) events = events.filter((e) => e.operation === opFilter);

    if (!events.length) {
      console.log("No events match the selected filters.");
      return;
    }

    console.log(`📋 Change History — ${report.dateRange.start} → ${report.dateRange.end}`);
    console.log(
      `   ${events.length} event(s)${typeArg ? ` · type: ${typeArg}` : ""}${opArg ? ` · op: ${opArg}` : ""}\n`,
    );

    // Group by date for readability
    const byDate = new Map<string, typeof events>();
    for (const e of events) {
      const date = e.changeDateTime.slice(0, 10);
      const list = byDate.get(date) ?? [];
      list.push(e);
      byDate.set(date, list);
    }

    for (const [date, dayEvents] of byDate) {
      console.log(`── ${date} (${dayEvents.length} change${dayEvents.length !== 1 ? "s" : ""}) ──`);
      for (const e of dayEvents) {
        const time = e.changeDateTime.slice(11, 16);
        const op = e.operation.padEnd(6);
        const type = e.resourceTypeLabel.padEnd(16);
        const campaign = e.campaignName ? `[${e.campaignName.slice(0, 40)}]` : "";
        const adGroup = e.adGroupName ? `> ${e.adGroupName.slice(0, 30)}` : "";
        const via = e.clientTypeLabel ? `via ${e.clientTypeLabel}` : "";
        const by = e.userEmail ? `by ${e.userEmail}` : "";

        console.log(`  ${time}  ${op}  ${type}  ${e.summary}`);
        if (campaign) console.log(`           ${campaign} ${adGroup}`);
        if (via || by) console.log(`           ${[via, by].filter(Boolean).join("  ")}`);
      }
      console.log();
    }

    if (saveToDisk) {
      const { mkdir, writeFile } = await import("node:fs/promises");
      const { join } = await import("node:path");
      const dir = join(process.cwd(), "output", "change-history");
      await mkdir(dir, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const path = join(dir, `change-history-${days}d-${ts}.json`);
      await writeFile(path, JSON.stringify({ ...report, events }, null, 2), "utf8");
      console.log(`✅ Saved to ${path}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("❌ Error fetching change history:", message);
    process.exit(1);
  }
}

main();
