"use server";

import { runAdGroupReport } from "@/lib/google-ads/ad-group-report";
import { runAdPerformance } from "@/lib/google-ads/ad-performance";
import { runAuctionInsights } from "@/lib/google-ads/auction-insights";
import { runCampaignKeywords } from "@/lib/google-ads/campaign-keywords";
import { runChangeHistory } from "@/lib/google-ads/change-history";
import { runDevicePerformance } from "@/lib/google-ads/device-performance";
import { runKeywordAnalysisBundle } from "@/lib/google-ads/keyword-analysis";
import { runKeywordSearchTermMap } from "@/lib/google-ads/keyword-search-term-map";
import { runLandingPageReport } from "@/lib/google-ads/landing-page-report";
import { analyzeNgrams } from "@/lib/google-ads/ngram-analysis";
import { runQualityScore } from "@/lib/google-ads/quality-score";
import { runCampaignReport } from "@/lib/google-ads/report";
import { runSchedulePerformance } from "@/lib/google-ads/schedule-performance";
import { runScopeOptions } from "@/lib/google-ads/scope-options";
import { runSearchTermsReport } from "@/lib/google-ads/search-terms";
import type {
  AdGroupReport,
  AdPerformanceReport,
  AuctionInsightReport,
  CampaignGranularity,
  CampaignKeywordsReport,
  CampaignReport,
  ChangeHistoryReport,
  DevicePerformanceReport,
  KeywordAnalysisBundle,
  KeywordSearchTermMapReport,
  LandingPageReport,
  NgramAnalysisOptions,
  NgramAnalysisResult,
  QualityScoreReport,
  SchedulePerformanceReport,
  ScopeOptions,
  SearchTermRow,
  SearchTermsReport,
} from "@/types/google-ads";

const VALID_GRANULARITIES: readonly CampaignGranularity[] = ["day", "week", "month"];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function validateDateRange(start: string, end: string): string | null {
  if (!ISO_DATE.test(start) || !ISO_DATE.test(end) || start > end) {
    return "Invalid date range: provide ISO dates (YYYY-MM-DD) with start ≤ end";
  }
  return null;
}

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function oauthErrorFromUnknown(err: unknown): { code?: string; description?: string } {
  const errorObj = asRecord(err);
  const response = asRecord(errorObj?.response);
  const data = asRecord(response?.data);
  const code = typeof data?.error === "string" ? data.error : undefined;
  const description = typeof data?.error_description === "string" ? data.error_description : undefined;
  return { code, description };
}

function normalizeGoogleAdsError(err: unknown): string | null {
  const { code, description } = oauthErrorFromUnknown(err);
  const rawMessage = err instanceof Error ? err.message : "";
  const combined = `${code ?? ""} ${description ?? ""} ${rawMessage}`.toLowerCase();

  if (combined.includes("invalid_grant")) {
    return "Google Ads authentication failed: the refresh token is expired or revoked. Reconnect the Google Ads OAuth app and update GOOGLE_ADS_REFRESH_TOKEN in your environment.";
  }

  if (combined.includes("missing required env var: google_ads_")) {
    return rawMessage;
  }

  return null;
}

function toError(err: unknown): string {
  const normalized = normalizeGoogleAdsError(err);
  if (normalized) return normalized;
  return err instanceof Error ? err.message : "Unknown error";
}

export interface SearchTermsActionInput {
  months?: number;
  campaign?: string | null;
}

export async function getSearchTermsReport(
  input: SearchTermsActionInput = {},
): Promise<ActionResult<SearchTermsReport>> {
  try {
    const months = Number(input.months);
    const campaign = input.campaign?.trim() ? input.campaign.trim() : null;
    const data = await runSearchTermsReport({
      monthsBack: Number.isFinite(months) && months > 0 ? months : 3,
      campaign,
    });
    return { ok: true, data };
  } catch (err) {
    console.error(err);
    return { ok: false, error: toError(err) };
  }
}

export interface CampaignReportActionInput {
  start: string;
  end: string;
  campaign?: string | null;
  granularity?: CampaignGranularity;
  saveToDisk?: boolean;
  forceRefresh?: boolean;
}

export async function getCampaignReport(input: CampaignReportActionInput): Promise<ActionResult<CampaignReport>> {
  try {
    const rangeError = validateDateRange(input.start, input.end);
    if (rangeError) return { ok: false, error: rangeError };

    const granularity: CampaignGranularity = VALID_GRANULARITIES.includes(input.granularity as CampaignGranularity)
      ? (input.granularity as CampaignGranularity)
      : "day";

    const campaign = input.campaign?.trim() ? input.campaign.trim() : null;
    const data = await runCampaignReport({
      dateRange: { start: input.start, end: input.end },
      campaign,
      granularity,
      includeDaily: true,
      includeDemographics: true,
      includePrevious: true,
      saveToDisk: Boolean(input.saveToDisk),
      forceRefresh: Boolean(input.forceRefresh),
    });
    return { ok: true, data };
  } catch (err) {
    console.error(err);
    return { ok: false, error: toError(err) };
  }
}

export interface NgramAnalysisActionInput {
  months?: number;
  campaign?: string | null;
  options?: NgramAnalysisOptions;
}

export async function getNgramAnalysis(
  input: NgramAnalysisActionInput = {},
): Promise<ActionResult<NgramAnalysisResult>> {
  try {
    const months = Number(input.months);
    const campaign = input.campaign?.trim() ? input.campaign.trim() : null;
    const search = await runSearchTermsReport({
      monthsBack: Number.isFinite(months) && months > 0 ? months : 3,
      campaign,
    });
    const data = analyzeNgrams({
      rows: search.rows,
      options: { ...(input.options ?? {}), campaign: campaign ?? undefined },
    });
    return { ok: true, data };
  } catch (err) {
    console.error(err);
    return { ok: false, error: toError(err) };
  }
}

export interface AnalyzeNgramsActionInput {
  rows: SearchTermRow[];
  options?: NgramAnalysisOptions;
}

export async function analyzeNgramsFromRows(
  input: AnalyzeNgramsActionInput,
): Promise<ActionResult<NgramAnalysisResult>> {
  try {
    if (!Array.isArray(input?.rows)) {
      return { ok: false, error: "rows must be a SearchTermRow[]" };
    }
    const data = analyzeNgrams({
      rows: input.rows,
      options: input.options ?? {},
    });
    return { ok: true, data };
  } catch (err) {
    console.error(err);
    return { ok: false, error: toError(err) };
  }
}

export interface CampaignKeywordsActionInput {
  campaignId?: string | null;
  campaignName?: string | null;
}

export async function getCampaignKeywords(
  input: CampaignKeywordsActionInput = {},
): Promise<ActionResult<CampaignKeywordsReport>> {
  try {
    const campaignId = input.campaignId?.toString().trim() || null;
    const campaignName = input.campaignName?.toString().trim() || null;
    if (!campaignId && !campaignName) {
      return {
        ok: false,
        error: "Provide campaignId or campaignName",
      };
    }
    const data = await runCampaignKeywords({ campaignId, campaignName });
    return { ok: true, data };
  } catch (err) {
    console.error(err);
    return { ok: false, error: toError(err) };
  }
}

export interface QualityScoreActionInput {
  start: string;
  end: string;
  campaign?: string | null;
  forceRefresh?: boolean;
}

export async function getQualityScore(input: QualityScoreActionInput): Promise<ActionResult<QualityScoreReport>> {
  try {
    const rangeError = validateDateRange(input.start, input.end);
    if (rangeError) return { ok: false, error: rangeError };
    const campaign = input.campaign?.trim() ? input.campaign.trim() : null;
    const data = await runQualityScore({
      dateRange: { start: input.start, end: input.end },
      campaign,
      forceRefresh: Boolean(input.forceRefresh),
    });
    return { ok: true, data };
  } catch (err) {
    console.error(err);
    return { ok: false, error: toError(err) };
  }
}

export interface ChangeHistoryActionInput {
  days?: number;
  campaign?: string | null;
  forceRefresh?: boolean;
}

export async function getChangeHistory(
  input: ChangeHistoryActionInput = {},
): Promise<ActionResult<ChangeHistoryReport>> {
  try {
    const days = Number(input.days);
    const campaign = input.campaign?.trim() ? input.campaign.trim() : null;
    const data = await runChangeHistory({
      days: Number.isFinite(days) && days > 0 ? Math.min(days, 30) : 30,
      campaign,
      forceRefresh: Boolean(input.forceRefresh),
    });
    return { ok: true, data };
  } catch (err) {
    console.error(err);
    return { ok: false, error: toError(err) };
  }
}

export interface SchedulePerformanceActionInput {
  start: string;
  end: string;
  campaign?: string | null;
  forceRefresh?: boolean;
}

export async function getSchedulePerformance(
  input: SchedulePerformanceActionInput,
): Promise<ActionResult<SchedulePerformanceReport>> {
  try {
    const rangeError = validateDateRange(input.start, input.end);
    if (rangeError) return { ok: false, error: rangeError };
    const campaign = input.campaign?.trim() ? input.campaign.trim() : null;
    const data = await runSchedulePerformance({
      dateRange: { start: input.start, end: input.end },
      campaign,
      forceRefresh: Boolean(input.forceRefresh),
    });
    return { ok: true, data };
  } catch (err) {
    console.error(err);
    return { ok: false, error: toError(err) };
  }
}

export interface AdGroupReportActionInput {
  start: string;
  end: string;
  campaign?: string | null;
  forceRefresh?: boolean;
}

export async function getAdGroupReport(input: AdGroupReportActionInput): Promise<ActionResult<AdGroupReport>> {
  try {
    const rangeError = validateDateRange(input.start, input.end);
    if (rangeError) return { ok: false, error: rangeError };
    const campaign = input.campaign?.trim() ? input.campaign.trim() : null;
    const data = await runAdGroupReport({
      dateRange: { start: input.start, end: input.end },
      campaign,
      forceRefresh: Boolean(input.forceRefresh),
    });
    return { ok: true, data };
  } catch (err) {
    console.error(err);
    return { ok: false, error: toError(err) };
  }
}

export interface DevicePerformanceActionInput {
  start: string;
  end: string;
  campaign?: string | null;
  forceRefresh?: boolean;
}

export async function getDevicePerformance(
  input: DevicePerformanceActionInput,
): Promise<ActionResult<DevicePerformanceReport>> {
  try {
    const rangeError = validateDateRange(input.start, input.end);
    if (rangeError) return { ok: false, error: rangeError };
    const campaign = input.campaign?.trim() ? input.campaign.trim() : null;
    const data = await runDevicePerformance({
      dateRange: { start: input.start, end: input.end },
      campaign,
      forceRefresh: Boolean(input.forceRefresh),
    });
    return { ok: true, data };
  } catch (err) {
    console.error(err);
    return { ok: false, error: toError(err) };
  }
}

export interface LandingPageReportActionInput {
  start: string;
  end: string;
  campaign?: string | null;
  forceRefresh?: boolean;
}

export async function getLandingPageReport(
  input: LandingPageReportActionInput,
): Promise<ActionResult<LandingPageReport>> {
  try {
    const rangeError = validateDateRange(input.start, input.end);
    if (rangeError) return { ok: false, error: rangeError };
    const campaign = input.campaign?.trim() ? input.campaign.trim() : null;
    const data = await runLandingPageReport({
      dateRange: { start: input.start, end: input.end },
      campaign,
      forceRefresh: Boolean(input.forceRefresh),
    });
    return { ok: true, data };
  } catch (err) {
    console.error(err);
    return { ok: false, error: toError(err) };
  }
}

export interface KeywordSearchTermMapActionInput {
  start: string;
  end: string;
  campaign?: string | null;
  top?: number;
  forceRefresh?: boolean;
}

export async function getKeywordSearchTermMap(
  input: KeywordSearchTermMapActionInput,
): Promise<ActionResult<KeywordSearchTermMapReport>> {
  try {
    const rangeError = validateDateRange(input.start, input.end);
    if (rangeError) return { ok: false, error: rangeError };
    const campaign = input.campaign?.trim() ? input.campaign.trim() : null;
    const topNum = Number(input.top);
    const top = Number.isFinite(topNum) && topNum > 0 ? Math.min(Math.floor(topNum), 1000) : 300;
    const data = await runKeywordSearchTermMap({
      dateRange: { start: input.start, end: input.end },
      campaign,
      top,
      forceRefresh: Boolean(input.forceRefresh),
    });
    return { ok: true, data };
  } catch (err) {
    console.error(err);
    return { ok: false, error: toError(err) };
  }
}

export interface AdPerformanceActionInput {
  start: string;
  end: string;
  campaign?: string | null;
  forceRefresh?: boolean;
}

export async function getAdPerformance(input: AdPerformanceActionInput): Promise<ActionResult<AdPerformanceReport>> {
  try {
    const rangeError = validateDateRange(input.start, input.end);
    if (rangeError) return { ok: false, error: rangeError };
    const campaign = input.campaign?.trim() ? input.campaign.trim() : null;
    const data = await runAdPerformance({
      dateRange: { start: input.start, end: input.end },
      campaign,
      forceRefresh: Boolean(input.forceRefresh),
    });
    return { ok: true, data };
  } catch (err) {
    console.error(err);
    return { ok: false, error: toError(err) };
  }
}

export interface AuctionInsightsActionInput {
  start: string;
  end: string;
  campaign?: string | null;
  forceRefresh?: boolean;
}

export async function getAuctionInsights(
  input: AuctionInsightsActionInput,
): Promise<ActionResult<AuctionInsightReport>> {
  try {
    const rangeError = validateDateRange(input.start, input.end);
    if (rangeError) return { ok: false, error: rangeError };
    const campaign = input.campaign?.trim() ? input.campaign.trim() : null;
    const data = await runAuctionInsights({
      dateRange: { start: input.start, end: input.end },
      campaign,
      forceRefresh: Boolean(input.forceRefresh),
    });
    return { ok: true, data };
  } catch (err) {
    console.error(err);
    return { ok: false, error: toError(err) };
  }
}

export interface KeywordAnalysisActionInput {
  months?: number;
  campaign?: string | null;
  options?: NgramAnalysisOptions;
  forceRefresh?: boolean;
}

export async function getKeywordAnalysisBundle(
  input: KeywordAnalysisActionInput = {},
): Promise<ActionResult<KeywordAnalysisBundle>> {
  try {
    const months = Number(input.months);
    const campaign = input.campaign?.trim() ? input.campaign.trim() : null;
    const monthsBack = Number.isFinite(months) && months > 0 ? months : 3;

    const data = await runKeywordAnalysisBundle({
      monthsBack,
      campaign,
      ngramOptions: input.options ?? {},
      forceRefresh: Boolean(input.forceRefresh),
    });

    return { ok: true, data };
  } catch (err) {
    console.error(err);
    return { ok: false, error: toError(err) };
  }
}

export async function getScopeOptions(input: { forceRefresh?: boolean } = {}): Promise<ActionResult<ScopeOptions>> {
  try {
    const data = await runScopeOptions({ forceRefresh: Boolean(input.forceRefresh) });
    return { ok: true, data };
  } catch (err) {
    console.error(err);
    return { ok: false, error: toError(err) };
  }
}
