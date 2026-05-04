import 'dotenv/config';
import { GoogleAdsApi } from 'google-ads-api';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_JSON = join(__dirname, 'data', 'output.json');

const client = new GoogleAdsApi({
  client_id: process.env.GOOGLE_ADS_CLIENT_ID,
  client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET,
  developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
});

const customer = client.Customer({
  customer_id: process.env.GOOGLE_ADS_CUSTOMER_ID,
  refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN,
});

// Optional: filter by campaign name via CLI arg, e.g. node search-terms.js "WhatsApp"
const campaignFilter = process.argv[2];

function formatDateYYYYMMDD(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

async function getSearchTerms() {
  try {
    const end = new Date();
    const start = new Date(end);
    start.setMonth(start.getMonth() - 3);

    const startDate = formatDateYYYYMMDD(start);
    const endDate = formatDateYYYYMMDD(end);

    const whereClause = campaignFilter
      ? `WHERE segments.date BETWEEN '${startDate}' AND '${endDate}' AND metrics.cost_micros > 0 AND campaign.name LIKE '%${campaignFilter}%'`
      : `WHERE segments.date BETWEEN '${startDate}' AND '${endDate}' AND metrics.cost_micros > 0`;

    const response = await customer.query(`
      SELECT
        search_term_view.search_term,
        search_term_view.status,
        campaign.name,
        ad_group.name,
        metrics.clicks,
        metrics.impressions,
        metrics.ctr,
        metrics.cost_micros
      FROM search_term_view
      ${whereClause}
      ORDER BY metrics.clicks DESC
    `);

    if (!response.length) {
      console.log('No search terms found for today yet.');
      return;
    }

    console.log(`\n📊 Search Terms Report — Last 3 months (${startDate} to ${endDate})`);
    if (campaignFilter) console.log(`   Filtered by campaign: "${campaignFilter}"`);
    console.log(`   Total terms: ${response.length}\n`);

    const rows = response.map(r => ({
      'Search Term': r.search_term_view.search_term,
      'Status': r.search_term_view.status,
      'Campaign': r.campaign.name,
      'Ad Group': r.ad_group.name,
      'Clicks': r.metrics.clicks,
      'Impressions': r.metrics.impressions,
      'CTR': (r.metrics.ctr * 100).toFixed(2) + '%',
      'Cost (₹)': (r.metrics.cost_micros / 1_000_000).toFixed(2),
    }));

    console.table(rows);

    // Summary
    const totalClicks = response.reduce((sum, r) => sum + r.metrics.clicks, 0);
    const totalImpressions = response.reduce((sum, r) => sum + r.metrics.impressions, 0);
    const totalCost = response.reduce((sum, r) => sum + r.metrics.cost_micros, 0) / 1_000_000;

    const output = {
      generatedAt: new Date().toISOString(),
      dateRange: { startDate, endDate },
      campaignFilter: campaignFilter ?? null,
      totalTerms: response.length,
      rows: response.map(r => ({
        searchTerm: r.search_term_view.search_term,
        status: r.search_term_view.status,
        campaign: r.campaign.name,
        adGroup: r.ad_group.name,
        clicks: r.metrics.clicks,
        impressions: r.metrics.impressions,
        ctr: r.metrics.ctr,
        costMicros: r.metrics.cost_micros,
        cost: r.metrics.cost_micros / 1_000_000,
      })),
      summary: {
        totalClicks,
        totalImpressions,
        overallCtr: totalImpressions ? totalClicks / totalImpressions : 0,
        totalCost,
      },
    };

    await mkdir(dirname(OUTPUT_JSON), { recursive: true });
    await writeFile(OUTPUT_JSON, JSON.stringify(output, null, 2), 'utf8');
    console.log(`✅ Wrote full output to ${OUTPUT_JSON}`);

    console.log('\n─── Summary ───────────────────────────────');
    console.log(`Total Clicks:      ${totalClicks}`);
    console.log(`Total Impressions: ${totalImpressions}`);
    console.log(`Overall CTR:       ${totalImpressions ? ((totalClicks / totalImpressions) * 100).toFixed(2) : 0}%`);
    console.log(`Total Cost:        ₹${totalCost.toFixed(2)}`);
    console.log('───────────────────────────────────────────\n');

  } catch (err) {
    console.error('❌ Error fetching search terms:', err.message);
    process.exit(1);
  }
}

getSearchTerms();