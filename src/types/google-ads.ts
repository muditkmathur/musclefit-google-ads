export interface DateRange {
  start: string;
  end: string;
}

export interface DiffValue {
  delta: number;
  direction: "up" | "down" | "flat";
}

export interface CampaignSummaryRow {
  campaign: string;
  status: string;
  impressions: number;
  clicks: number;
  ctr: string;
  avg_cpc: string;
  spend: string;
  spendRaw: number;
  conversions: number;
  cpa: string;
  cpaRaw: number;
  impressionShare: number | null;
  lostIsBudget: number | null;
  lostIsRank: number | null;
  dailyBudget: number; // INR (micros / 1_000_000)
  periodBudget: number; // dailyBudget × days in the selected date range
}

export interface CampaignTotals {
  campaign: "TOTAL";
  status: "—";
  impressions: number;
  clicks: number;
  ctr: string;
  avg_cpc: "—";
  spend: string;
  conversions: number;
  cpa: string;
}

export interface CampaignTotalsRaw {
  impressions: number;
  clicks: number;
  ctr: number;
  spend: number;
  conversions: number;
  cpa: number;
}

export type CampaignRangeKey = "last-7-days" | "last-4-weeks" | "last-3-months" | "year-to-date";

export type CampaignGranularity = "day" | "week" | "month";

export interface CampaignReport {
  generated_at: string;
  period: string;
  granularity: CampaignGranularity;
  date_range: DateRange;
  previous_date_range: DateRange;
  campaigns: CampaignSummaryRow[];
  totals: CampaignTotals;
  totals_raw: CampaignTotalsRaw;
  previous_totals: CampaignTotals;
  previous_totals_raw: CampaignTotalsRaw;
  daily?: CampaignDailyReport;
  demographics?: CampaignDemographicsReport;
  saved_to?: { summary: string; daily?: string; demographics?: string };
}

export interface CampaignDailyEntry {
  date: string;
  impressions: number;
  clicks: number;
  ctr: number | null;
  spend: number;
  conversions: number;
  avg_cpc: number;
  /** Search impression share 0–1; null when not applicable (e.g. non-search). */
  impressionShare: number | null;
  lostIsBudget: number | null;
  lostIsRank: number | null;
  dod: {
    impressions: DiffValue;
    clicks: DiffValue;
    spend: DiffValue;
    conversions: DiffValue;
    ctr: DiffValue;
    avg_cpc: DiffValue;
  } | null;
}

export interface CampaignDailyReport {
  generated_at: string;
  period: string;
  date_range: DateRange;
  campaigns: Array<{ campaign: string; days: CampaignDailyEntry[] }>;
}

export type DemographicDimension = "gender" | "age_range";

export interface CampaignDemographicMetrics {
  impressions: number;
  clicks: number;
  ctr: number | null;
  spend: number;
  conversions: number;
  avg_cpc: number;
}

export interface CampaignDemographicDailyEntry extends CampaignDemographicMetrics {
  date: string;
  /** Stable identifier for the demographic value (e.g. raw enum/code from API or normalized key). */
  bucket: string;
  /** Human-friendly label for the bucket (e.g. "Male", "18-24", "Undetermined"). */
  bucketLabel: string;
}

export interface CampaignDemographicSlice {
  dimension: DemographicDimension;
  /** All buckets observed in `days`, in display order. */
  buckets: Array<{ key: string; label: string }>;
  days: CampaignDemographicDailyEntry[];
}

export interface CampaignDemographicEntry {
  campaign: string;
  slices: CampaignDemographicSlice[];
}

export interface CampaignDemographicsReport {
  generated_at: string;
  period: string;
  date_range: DateRange;
  campaigns: CampaignDemographicEntry[];
}

export interface SearchTermRow {
  searchTerm: string;
  status: string;
  campaign: string;
  adGroup: string;
  clicks: number;
  impressions: number;
  ctr: number;
  costMicros: number;
  cost: number;
  conversions: number;
  conversionValue: number;
}

export interface SearchTermsReport {
  generatedAt: string;
  dateRange: DateRange;
  campaignFilter: string | null;
  totalTerms: number;
  rows: SearchTermRow[];
  summary: {
    totalClicks: number;
    totalImpressions: number;
    overallCtr: number;
    totalCost: number;
    totalConversions: number;
    totalConversionValue: number;
  };
}

export interface NgramItem {
  ngram: string;
  count: number;
  score: number;
  clicks: number;
  impressions: number;
  cost: number;
  conversions: number;
  ctr: number;
  convRate: number;
}

export interface NgramAnalysisOptions {
  n?: number[];
  top?: number;
  minCount?: number;
  minTokenLen?: number;
  keepNumbers?: boolean;
  keepStopwords?: boolean;
  weight?: "count" | "clicks" | "impressions" | "cost";
  campaign?: string | null;
}

export interface NgramAnalysisResult {
  generatedAt: string;
  weight: NonNullable<NgramAnalysisOptions["weight"]>;
  campaign: string | null;
  params: {
    n: number[];
    top: number;
    minCount: number;
    minTokenLen: number;
    keepNumbers: boolean;
    keepStopwords: boolean;
  };
  totals: {
    rows: number;
    rowsBeforeCampaignFilter: number;
  };
  ngrams: Record<string, NgramItem[]>;
}

export interface KeywordAnalysisBundle {
  searchTerms: SearchTermsReport;
  ngrams: NgramAnalysisResult;
}

export interface CampaignKeywordRow {
  level: "ad_group" | "campaign";
  campaignId: string | number;
  campaign: string;
  adGroup: string | null;
  criterionId: string | number;
  negative: boolean;
  keyword: string;
  matchType: string | number;
  status: string | number | null;
}

export interface CampaignKeywordsReport {
  positives: CampaignKeywordRow[];
  campaignNegatives: CampaignKeywordRow[];
  adGroupNegatives: CampaignKeywordRow[];
}

// ---------------------------------------------------------------------------
// Quality Score
// ---------------------------------------------------------------------------

export type QualityScoreComponent = "ABOVE_AVERAGE" | "AVERAGE" | "BELOW_AVERAGE" | "UNKNOWN";

export type QualityScoreBottleneck = "bid" | "qs" | "both" | "competitive" | "unknown";

export interface QualityScoreRow {
  campaign: string;
  adGroup: string;
  keyword: string;
  matchType: string;
  status: string;
  qualityScore: number | null;
  expectedCtr: QualityScoreComponent;
  adRelevance: QualityScoreComponent;
  landingPageExperience: QualityScoreComponent;
  avgCpc: number;
  maxCpcBid: number | null;
  firstPageCpc: number | null;
  topOfPageCpc: number | null;
  bottleneck: QualityScoreBottleneck;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
}

export interface QualityScoreReport {
  generatedAt: string;
  dateRange: DateRange;
  rows: QualityScoreRow[];
}

// ---------------------------------------------------------------------------
// Change history
// ---------------------------------------------------------------------------

export interface ChangeEvent {
  changeDateTime: string;
  resourceType: string;
  resourceTypeLabel: string;
  operation: "CREATE" | "UPDATE" | "REMOVE" | "UNKNOWN";
  changedFields: string[];
  clientType: string;
  clientTypeLabel: string;
  userEmail: string;
  campaignName: string;
  adGroupName: string;
  summary: string;
  budgetOld: number | null;
  budgetNew: number | null;
  statusOld: string | null;
  statusNew: string | null;
  keywordText: string | null;
  keywordMatchType: string | null;
  bidOld: number | null;
  bidNew: number | null;
}

export interface ChangeHistoryReport {
  generatedAt: string;
  dateRange: DateRange;
  events: ChangeEvent[];
}

// ---------------------------------------------------------------------------
// Schedule performance (hour × day-of-week heatmap)
// ---------------------------------------------------------------------------

export type DayOfWeek = "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY" | "SUNDAY";

export interface ScheduleCell {
  dayOfWeek: DayOfWeek;
  hour: number;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  ctr: number;
}

export interface SchedulePerformanceReport {
  generatedAt: string;
  dateRange: DateRange;
  cells: ScheduleCell[];
}

// ---------------------------------------------------------------------------
// Ad group report
// ---------------------------------------------------------------------------

export interface AdGroupRow {
  campaign: string;
  adGroup: string;
  impressions: number;
  clicks: number;
  ctr: string;
  avgCpc: string;
  spend: string;
  spendRaw: number;
  conversions: number;
  cpa: string;
  cpaRaw: number;
  impressionShare: number | null;
  lostIsBudget: number | null;
  lostIsRank: number | null;
  topIs: number | null;
  absoluteTopIs: number | null;
}

export interface AdGroupReport {
  generatedAt: string;
  dateRange: DateRange;
  rows: AdGroupRow[];
}

// ---------------------------------------------------------------------------
// Device performance
// ---------------------------------------------------------------------------

export interface DeviceRow {
  device: string;
  impressions: number;
  clicks: number;
  ctr: number;
  spend: number;
  conversions: number;
  cpa: number;
  avgCpc: number;
}

export interface DevicePerformanceReport {
  generatedAt: string;
  dateRange: DateRange;
  rows: DeviceRow[];
}

// ---------------------------------------------------------------------------
// Landing pages
// ---------------------------------------------------------------------------

export interface LandingPageRow {
  /** Unexpanded final URL as configured on the ad. */
  url: string;
  /** Campaigns that surfaced this URL during the date range. */
  campaigns: string[];
  /** Ad groups that have an ad pointing to this URL (best-effort attribution). */
  usedByAdGroups: string[];
  impressions: number;
  clicks: number;
  ctr: number;
  spend: number;
  conversions: number;
  /** Cost per conversion (₹). 0 when conversions are 0. */
  cpa: number;
  /** Conversion rate (conversions / clicks). 0 when clicks are 0. */
  convRate: number;
  /** Spend ≥ ₹500 and conversions = 0 — likely waste. */
  isWaste: boolean;
}

export interface LandingPageReport {
  generatedAt: string;
  dateRange: DateRange;
  campaignFilter: string | null;
  rows: LandingPageRow[];
}

// ---------------------------------------------------------------------------
// Keyword ↔ Search term map
// ---------------------------------------------------------------------------

export interface KeywordSearchTermMapRow {
  campaign: string;
  adGroup: string;
  /** What the user actually typed into Google. */
  searchTerm: string;
  /** Triggering keyword (segments.keyword.info.text). */
  keyword: string;
  /** Human-friendly match type label (Broad / Phrase / Exact). */
  matchType: string;
  /** Search term status enum (e.g. ADDED, EXCLUDED, NONE). */
  status: string;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  cpa: number;
  convRate: number;
  /** True when the search term shares no significant token with the keyword. */
  intentMismatch: boolean;
  /** True when triggered by a Broad match keyword. */
  isBroadTrigger: boolean;
  /** Spend ≥ ₹200 and conversions = 0. */
  isWaste: boolean;
}

export interface KeywordSearchTermMapReport {
  generatedAt: string;
  dateRange: DateRange;
  campaignFilter: string | null;
  /** Number of rows actually returned after the `top` cap. */
  rowCount: number;
  /** The cap applied to the result set (default 300). */
  topLimit: number;
  rows: KeywordSearchTermMapRow[];
}

// ---------------------------------------------------------------------------
// Ad / RSA performance
// ---------------------------------------------------------------------------

export type AdStrengthLabel = "Pending" | "No ads" | "Poor" | "Average" | "Good" | "Excellent" | "Unknown";

export type AssetPerformanceLabel = "BEST" | "GOOD" | "LOW" | "LEARNING" | "PENDING" | "UNKNOWN";

export type AdAssetFieldType = "HEADLINE" | "DESCRIPTION" | "OTHER";

export interface AdAssetPerformanceRow {
  campaign: string;
  adGroup: string;
  /** "Headline" / "Description" / raw API enum for anything else. */
  fieldType: AdAssetFieldType;
  /** The asset text (RSA headline or description). */
  text: string;
  performanceLabel: AssetPerformanceLabel;
  impressions: number;
  clicks: number;
}

export interface AdPerformanceRow {
  campaign: string;
  adGroup: string;
  adId: string;
  /** Google enum (RESPONSIVE_SEARCH_AD, EXPANDED_TEXT_AD, etc.) normalised to label. */
  adType: string;
  finalUrls: string[];
  adStrength: AdStrengthLabel;
  status: string;
  impressions: number;
  clicks: number;
  ctr: number;
  spend: number;
  conversions: number;
  cpa: number;
  /** Assets attached to this ad (RSA only). Empty for legacy types. */
  assets: AdAssetPerformanceRow[];
}

export interface AdPerformanceReport {
  generatedAt: string;
  dateRange: DateRange;
  campaignFilter: string | null;
  ads: AdPerformanceRow[];
}

// ---------------------------------------------------------------------------
// Auction insights
// ---------------------------------------------------------------------------

export interface AuctionInsightCompetitorRow {
  campaign: string;
  /** Competitor visible URL / domain. */
  domain: string;
  /** 0–1 fractions, weighted by keyword spend within the campaign. */
  impressionShare: number;
  overlapRate: number;
  positionAboveRate: number;
  outrankingShare: number;
  /** How many of the campaign's top keywords this competitor showed up on. */
  keywordCount: number;
  /** Total impressions seen on the keywords this competitor shared. */
  impressions: number;
}

export interface AuctionInsightKeywordRow {
  campaign: string;
  adGroup: string;
  keyword: string;
  domain: string;
  impressionShare: number;
  overlapRate: number;
  positionAboveRate: number;
  outrankingShare: number;
  impressions: number;
  spend: number;
}

export interface AuctionInsightReport {
  generatedAt: string;
  dateRange: DateRange;
  campaignFilter: string | null;
  /** Per-campaign top competitor rollup. */
  competitors: AuctionInsightCompetitorRow[];
  /** Detail rows for drill-down (top keywords × top domains). */
  keywordRows: AuctionInsightKeywordRow[];
  /** Set when the API denies auction-insight metrics for this developer token. */
  warning?: string | null;
}

// ---------------------------------------------------------------------------
// Scope options (campaign / ad group picker)
// ---------------------------------------------------------------------------

export interface ScopeCampaign {
  name: string;
  status: string;
  type: string;
  adGroups: Array<{ name: string; status: string }>;
}

export interface ScopeOptions {
  generatedAt: string;
  campaigns: ScopeCampaign[];
}
