import { runAdPerformance } from "@/lib/google-ads/ad-performance";
import { runAuctionInsights } from "@/lib/google-ads/auction-insights";
import { runChangeHistory } from "@/lib/google-ads/change-history";
import { runKeywordSearchTermMap } from "@/lib/google-ads/keyword-search-term-map";
import { runLandingPageReport } from "@/lib/google-ads/landing-page-report";
import { runQualityScore } from "@/lib/google-ads/quality-score";
import { runCampaignReport } from "@/lib/google-ads/report";
import type {
  AdStrengthLabel,
  DateRange,
  OverviewCampaignContext,
  OverviewContext,
  QualityScoreBottleneck,
} from "@/types/google-ads";

const WASTE_TOP_N = 5;
const COMPETITOR_TOP_N = 3;

function topByField<T>(rows: T[], field: (row: T) => number, n: number): T[] {
  return [...rows].sort((a, b) => field(b) - field(a)).slice(0, n);
}

export async function buildOverviewContext(dateRange: DateRange): Promise<OverviewContext> {
  const [campaignReport, qualityScore, landingPages, searchTerms, adPerformance, auctionInsights, changeHistory] =
    await Promise.all([
      runCampaignReport({ dateRange, includeDaily: false, includeDemographics: false, includePrevious: false }),
      runQualityScore({ dateRange }),
      runLandingPageReport({ dateRange }),
      runKeywordSearchTermMap({ dateRange, top: 500 }),
      runAdPerformance({ dateRange }),
      runAuctionInsights({ dateRange }),
      runChangeHistory({ days: 30 }),
    ]);

  const campaigns: OverviewCampaignContext[] = campaignReport.campaigns.map((row) => {
    const campaignName = row.campaign;

    const qsRows = qualityScore.rows.filter((r) => r.campaign === campaignName);
    const qsValues = qsRows.map((r) => r.qualityScore).filter((v): v is number => v !== null);
    const avgQualityScore = qsValues.length > 0 ? qsValues.reduce((a, b) => a + b, 0) / qsValues.length : null;
    const qualityScoreBottlenecks: Partial<Record<QualityScoreBottleneck, number>> = {};
    for (const r of qsRows) {
      qualityScoreBottlenecks[r.bottleneck] = (qualityScoreBottlenecks[r.bottleneck] ?? 0) + 1;
    }

    const wasteLandingPages = topByField(
      landingPages.rows.filter((r) => r.isWaste && r.campaigns.includes(campaignName)),
      (r) => r.spend,
      WASTE_TOP_N,
    ).map((r) => ({ url: r.url, spend: r.spend }));

    const wasteSearchTerms = topByField(
      searchTerms.rows.filter((r) => r.isWaste && r.campaign === campaignName),
      (r) => r.spend,
      WASTE_TOP_N,
    ).map((r) => ({ searchTerm: r.searchTerm, spend: r.spend }));

    const adStrengthCounts: Partial<Record<AdStrengthLabel, number>> = {};
    for (const ad of adPerformance.ads.filter((a) => a.campaign === campaignName)) {
      adStrengthCounts[ad.adStrength] = (adStrengthCounts[ad.adStrength] ?? 0) + 1;
    }

    const topCompetitorDomains = topByField(
      auctionInsights.competitors.filter((c) => c.campaign === campaignName),
      (c) => c.impressionShare,
      COMPETITOR_TOP_N,
    ).map((c) => ({ domain: c.domain, impressionShare: c.impressionShare }));

    const changeEventCount = changeHistory.events.filter((e) => e.campaignName === campaignName).length;

    return {
      campaignId: campaignName,
      campaignName,
      status: row.status,
      spend: row.spendRaw,
      conversions: row.conversions,
      cpa: row.cpaRaw,
      ctr: Number.parseFloat(row.ctr) || 0,
      impressionShare: row.impressionShare,
      lostIsBudget: row.lostIsBudget,
      lostIsRank: row.lostIsRank,
      avgQualityScore,
      qualityScoreBottlenecks,
      topWasteLandingPages: wasteLandingPages,
      topWasteSearchTerms: wasteSearchTerms,
      adStrengthCounts,
      topCompetitorDomains,
      changeEventCount,
    };
  });

  return { dateRange, campaigns };
}
