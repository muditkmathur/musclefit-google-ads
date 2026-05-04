import 'dotenv/config';
import { GoogleAdsApi } from 'google-ads-api';

const client = new GoogleAdsApi({
  client_id: process.env.GOOGLE_ADS_CLIENT_ID,
  client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET,
  developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
});

const customer = client.Customer({
  customer_id: process.env.GOOGLE_ADS_CUSTOMER_ID,
  refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN,
});

// Usage:
//   node campaign-keywords.js --campaignId 1234567890
//   node campaign-keywords.js --campaignName "Brand Search"
const argv = process.argv.slice(2);
const getArg = (k) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : null;
};

const campaignId = getArg('--campaignId');
const campaignName = getArg('--campaignName');

if (!campaignId && !campaignName) {
  console.error('Provide --campaignId <id> or --campaignName "<name>"');
  process.exit(2);
}

const escapeGaqlString = (s) => String(s ?? '').replaceAll('\\', '\\\\').replaceAll("'", "\\'");

const whereClause = campaignId
  ? `WHERE campaign.id = ${Number(campaignId)}`
  : `WHERE campaign.name LIKE '%${escapeGaqlString(campaignName)}%'`;

async function main() {
  const [adGroupRows, campaignNegRows] = await Promise.all([
    customer.query(`
      SELECT
        campaign.id,
        campaign.name,
        ad_group.id,
        ad_group.name,
        ad_group_criterion.criterion_id,
        ad_group_criterion.status,
        ad_group_criterion.negative,
        ad_group_criterion.keyword.text,
        ad_group_criterion.keyword.match_type
      FROM ad_group_criterion
      ${whereClause}
        AND ad_group_criterion.type = KEYWORD
      ORDER BY ad_group.name, ad_group_criterion.keyword.text
    `),
    customer.query(`
      SELECT
        campaign.id,
        campaign.name,
        campaign_criterion.criterion_id,
        campaign_criterion.negative,
        campaign_criterion.keyword.text,
        campaign_criterion.keyword.match_type
      FROM campaign_criterion
      ${whereClause}
        AND campaign_criterion.type = KEYWORD
        AND campaign_criterion.negative = TRUE
      ORDER BY campaign_criterion.keyword.text
    `),
  ]);

  if (!adGroupRows.length && !campaignNegRows.length) {
    console.log('No keywords found (check campaign filter / access).');
    return;
  }

  const adGroupKeywords = adGroupRows.map((r) => ({
    level: 'ad_group',
    campaignId: r.campaign.id,
    campaign: r.campaign.name,
    adGroup: r.ad_group.name,
    criterionId: r.ad_group_criterion.criterion_id,
    negative: r.ad_group_criterion.negative,
    keyword: r.ad_group_criterion.keyword.text,
    matchType: r.ad_group_criterion.keyword.match_type,
    status: r.ad_group_criterion.status,
  }));

  const campaignNegKeywords = campaignNegRows.map((r) => ({
    level: 'campaign',
    campaignId: r.campaign.id,
    campaign: r.campaign.name,
    adGroup: null,
    criterionId: r.campaign_criterion.criterion_id,
    negative: true,
    keyword: r.campaign_criterion.keyword.text,
    matchType: r.campaign_criterion.keyword.match_type,
    status: null,
  }));

  const positives = adGroupKeywords.filter((k) => !k.negative);
  const adGroupNegs = adGroupKeywords.filter((k) => k.negative);

  console.log(`\n📌 Positive keywords (${positives.length})`);
  console.table(positives);

  console.log(`\n🚫 Campaign-level negatives (${campaignNegKeywords.length})`);
  console.table(campaignNegKeywords);

  console.log(`\n🚫 Ad group-level negatives (${adGroupNegs.length})`);
  console.table(adGroupNegs);
}

main().catch((err) => {
  console.error('❌ Error fetching keywords:', err?.message || err);
  process.exit(1);
});

