import { config } from "dotenv";

import path from "node:path";

config({ path: path.resolve(process.cwd(), ".env") });
config({ path: path.resolve(process.cwd(), ".env.local"), override: true });

import { runCampaignKeywords } from "../src/lib/google-ads/campaign-keywords";

function getArg(argv: string[], key: string): string | null {
  const i = argv.indexOf(key);
  return i >= 0 ? (argv[i + 1] ?? null) : null;
}

async function main() {
  const argv = process.argv.slice(2);
  const campaignId = getArg(argv, "--campaignId");
  const campaignName = getArg(argv, "--campaignName");

  if (!campaignId && !campaignName) {
    console.error('Provide --campaignId <id> or --campaignName "<name>"');
    process.exit(2);
  }

  try {
    const { positives, campaignNegatives, adGroupNegatives } = await runCampaignKeywords({ campaignId, campaignName });

    if (!positives.length && !campaignNegatives.length && !adGroupNegatives.length) {
      console.log("No keywords found (check campaign filter / access).");
      return;
    }

    console.log(`\n📌 Positive keywords (${positives.length})`);
    console.table(positives);

    console.log(`\n🚫 Campaign-level negatives (${campaignNegatives.length})`);
    console.table(campaignNegatives);

    console.log(`\n🚫 Ad group-level negatives (${adGroupNegatives.length})`);
    console.table(adGroupNegatives);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("❌ Error fetching keywords:", message);
    process.exit(1);
  }
}

main();
