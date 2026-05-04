import 'dotenv/config';
import { runCampaignReport } from '../lib/google-ads/report';

async function main() {
  const args = process.argv.slice(2);
  const parsed = args[0] !== undefined ? parseInt(args[0], 10) : 30;
  if (!Number.isFinite(parsed) || parsed < 1) {
    console.error('❌ Invalid input. Use a positive number of days. Example: pnpm report 21');
    process.exit(1);
  }
  const days = parsed;
  const flags = new Set(args.slice(1));
  const includeDaily =
    flags.has('--daily') || flags.has('--dod') || flags.has('--day-by-day');

  try {
    const result = await runCampaignReport({
      days,
      includeDaily,
      saveToDisk: true,
    });

    if (!result.campaigns.length) {
      console.log('No active campaigns found.');
      return;
    }

    console.log(`\n✅ Report saved to ${result.saved_to?.summary}\n`);
    console.log(`📊 Campaign Report — ${result.period} (Active only)\n`);
    console.table(result.campaigns);
    console.log('\n📈 Totals');
    console.table([result.totals]);

    if (result.daily) {
      console.log(
        `\n📅 Daily (DoD) report saved to ${result.saved_to?.daily ?? '(in-memory)'}`,
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error fetching campaign report:', message);
    process.exit(1);
  }
}

main();
