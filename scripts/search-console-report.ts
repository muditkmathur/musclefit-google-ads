import { config } from "dotenv";

import path from "node:path";

config({ path: path.resolve(process.cwd(), ".env") });
config({ path: path.resolve(process.cwd(), ".env.local"), override: true });

import { dateRangeForLastNDays } from "../src/lib/date-presets";
import { runSearchConsoleReport } from "../src/lib/search-console/report";

async function main() {
  const args = process.argv.slice(2);
  const parsed = args[0] !== undefined ? parseInt(args[0], 10) : 30;
  if (!Number.isFinite(parsed) || parsed < 1) {
    console.error("❌ Invalid input. Use a positive number of days. Example: pnpm search-console-report 14");
    process.exit(1);
  }
  const days = parsed;

  try {
    const result = await runSearchConsoleReport({
      dateRange: dateRangeForLastNDays(days),
    });

    if (!result.rows.length) {
      console.log("No Search Console data found for this range.");
      return;
    }

    console.log(`\n🔎 Search Console — ${result.siteUrl} — ${result.dateRange.start} → ${result.dateRange.end}\n`);
    console.table(
      result.rows.slice(0, 50).map((r) => ({
        query: r.query,
        page: r.page,
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: `${(r.ctr * 100).toFixed(2)}%`,
        position: r.position.toFixed(1),
      })),
    );
    console.log(`\n📈 Totals (${result.rows.length} rows)`);
    console.table([
      {
        clicks: result.totals.clicks,
        impressions: result.totals.impressions,
        ctr: `${(result.totals.ctr * 100).toFixed(2)}%`,
        position: result.totals.position.toFixed(1),
      },
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("❌ Error fetching Search Console report:", message);
    process.exit(1);
  }
}

main();
