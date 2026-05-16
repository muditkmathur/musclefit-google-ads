import "dotenv/config";
import { DEFAULT_SEARCH_TERMS_OUTPUT, runSearchTermsReport } from "../src/lib/google-ads/search-terms";

async function main() {
  const campaignFilter = process.argv[2] ?? null;

  try {
    const result = await runSearchTermsReport({
      campaign: campaignFilter,
      saveToPath: DEFAULT_SEARCH_TERMS_OUTPUT,
    });

    if (!result.rows.length) {
      console.log("No search terms found for today yet.");
      return;
    }

    console.log(`\n📊 Search Terms Report — ${result.dateRange.start} to ${result.dateRange.end}`);
    if (result.campaignFilter) {
      console.log(`   Filtered by campaign: "${result.campaignFilter}"`);
    }
    console.log(`   Total terms: ${result.totalTerms}\n`);

    console.table(
      result.rows.map((r) => ({
        "Search Term": r.searchTerm,
        Status: r.status,
        Campaign: r.campaign,
        "Ad Group": r.adGroup,
        Clicks: r.clicks,
        Impressions: r.impressions,
        CTR: (r.ctr * 100).toFixed(2) + "%",
        "Cost (₹)": r.cost.toFixed(2),
        Conversions: r.conversions,
        "Conv. value": r.conversionValue,
      })),
    );

    console.log(`✅ Wrote full output to ${DEFAULT_SEARCH_TERMS_OUTPUT}`);
    console.log("\n─── Summary ───────────────────────────────");
    console.log(`Total Clicks:      ${result.summary.totalClicks}`);
    console.log(`Total Impressions: ${result.summary.totalImpressions}`);
    console.log(
      `Overall CTR:       ${
        result.summary.totalImpressions
          ? ((result.summary.totalClicks / result.summary.totalImpressions) * 100).toFixed(2)
          : 0
      }%`,
    );
    console.log(`Total Cost:        ₹${result.summary.totalCost.toFixed(2)}`);
    console.log(`Total Conversions: ${result.summary.totalConversions}`);
    console.log(`Total Conv. value: ${result.summary.totalConversionValue.toFixed(2)}`);
    console.log("───────────────────────────────────────────\n");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("❌ Error fetching search terms:", message);
    process.exit(1);
  }
}

main();
