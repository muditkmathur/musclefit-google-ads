import { getCustomer } from './client';
import type {
  CampaignKeywordRow,
  CampaignKeywordsReport,
} from '@/types/google-ads';

export interface CampaignKeywordsOptions {
  campaignId?: string | number | null;
  campaignName?: string | null;
}

const escapeGaqlString = (s: unknown): string =>
  String(s ?? '').replaceAll('\\', '\\\\').replaceAll("'", "\\'");

export async function runCampaignKeywords(
  options: CampaignKeywordsOptions,
): Promise<CampaignKeywordsReport> {
  const { campaignId, campaignName } = options;
  if (!campaignId && !campaignName) {
    throw new Error('Provide either campaignId or campaignName');
  }

  const whereClause = campaignId
    ? `WHERE campaign.id = ${Number(campaignId)}`
    : `WHERE campaign.name LIKE '%${escapeGaqlString(campaignName)}%'`;

  const customer = getCustomer();

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

  const adGroupKeywords: CampaignKeywordRow[] = adGroupRows.map((r) => ({
    level: 'ad_group',
    campaignId: String(r.campaign?.id ?? ''),
    campaign: String(r.campaign?.name ?? ''),
    adGroup: String(r.ad_group?.name ?? ''),
    criterionId: String(r.ad_group_criterion?.criterion_id ?? ''),
    negative: Boolean(r.ad_group_criterion?.negative),
    keyword: String(r.ad_group_criterion?.keyword?.text ?? ''),
    matchType: r.ad_group_criterion?.keyword?.match_type ?? '',
    status: r.ad_group_criterion?.status ?? null,
  }));

  const campaignNegatives: CampaignKeywordRow[] = campaignNegRows.map((r) => ({
    level: 'campaign',
    campaignId: String(r.campaign?.id ?? ''),
    campaign: String(r.campaign?.name ?? ''),
    adGroup: null,
    criterionId: String(r.campaign_criterion?.criterion_id ?? ''),
    negative: true,
    keyword: String(r.campaign_criterion?.keyword?.text ?? ''),
    matchType: r.campaign_criterion?.keyword?.match_type ?? '',
    status: null,
  }));

  return {
    positives: adGroupKeywords.filter((k) => !k.negative),
    campaignNegatives,
    adGroupNegatives: adGroupKeywords.filter((k) => k.negative),
  };
}
