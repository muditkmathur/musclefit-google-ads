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
  conversions: number;
  cpa: string;
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
  saved_to?: { summary: string; daily?: string };
}

export interface CampaignDailyEntry {
  date: string;
  impressions: number;
  clicks: number;
  ctr: number | null;
  spend: number;
  conversions: number;
  avg_cpc: number;
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
  };
}

export interface NgramItem {
  ngram: string;
  count: number;
  score: number;
  clicks: number;
  impressions: number;
  cost: number;
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
