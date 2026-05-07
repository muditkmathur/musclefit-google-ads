"use server";

import { runCampaignKeywords } from "@/lib/google-ads/campaign-keywords";
import { analyzeNgrams } from "@/lib/google-ads/ngram-analysis";
import { runCampaignReport } from "@/lib/google-ads/report";
import { runSearchTermsReport } from "@/lib/google-ads/search-terms";
import type {
  CampaignGranularity,
  CampaignKeywordsReport,
  CampaignRangeKey,
  CampaignReport,
  NgramAnalysisOptions,
  NgramAnalysisResult,
  SearchTermRow,
  SearchTermsReport,
} from "@/types/google-ads";

const VALID_RANGES: readonly CampaignRangeKey[] = [
  "last-7-days",
  "last-4-weeks",
  "last-3-months",
  "year-to-date",
];

const VALID_GRANULARITIES: readonly CampaignGranularity[] = [
  "day",
  "week",
  "month",
];

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function oauthErrorFromUnknown(err: unknown): { code?: string; description?: string } {
  const errorObj = asRecord(err);
  const response = asRecord(errorObj?.response);
  const data = asRecord(response?.data);
  const code = typeof data?.error === "string" ? data.error : undefined;
  const description =
    typeof data?.error_description === "string" ? data.error_description : undefined;
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
  range?: CampaignRangeKey;
  granularity?: CampaignGranularity;
  saveToDisk?: boolean;
}

export async function getCampaignReport(
  input: CampaignReportActionInput = {},
): Promise<ActionResult<CampaignReport>> {
  try {
    const range: CampaignRangeKey = VALID_RANGES.includes(
      input.range as CampaignRangeKey,
    )
      ? (input.range as CampaignRangeKey)
      : "last-4-weeks";
    const granularity: CampaignGranularity = VALID_GRANULARITIES.includes(
      input.granularity as CampaignGranularity,
    )
      ? (input.granularity as CampaignGranularity)
      : "day";

    const data = await runCampaignReport({
      range,
      granularity,
      includeDaily: true,
      includeDemographics: true,
      includePrevious: true,
      saveToDisk: Boolean(input.saveToDisk),
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
