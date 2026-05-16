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
  range: CampaignRangeKey;
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
