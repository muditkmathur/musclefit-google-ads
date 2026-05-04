'use server';

import { runCampaignReport } from '@/lib/google-ads/report';
import { runSearchTermsReport } from '@/lib/google-ads/search-terms';
import { analyzeNgrams } from '@/lib/google-ads/ngram-analysis';
import { runCampaignKeywords } from '@/lib/google-ads/campaign-keywords';
import type {
  CampaignKeywordsReport,
  CampaignReport,
  NgramAnalysisOptions,
  NgramAnalysisResult,
  SearchTermRow,
  SearchTermsReport,
} from '@/types/google-ads';

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function toError(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
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
    return { ok: false, error: toError(err) };
  }
}

export interface CampaignReportActionInput {
  days?: number;
  includeDaily?: boolean;
  saveToDisk?: boolean;
}

export async function getCampaignReport(
  input: CampaignReportActionInput = {},
): Promise<ActionResult<CampaignReport>> {
  try {
    const days = Number(input.days);
    const data = await runCampaignReport({
      days: Number.isFinite(days) && days > 0 ? days : 30,
      includeDaily: Boolean(input.includeDaily),
      saveToDisk: Boolean(input.saveToDisk),
    });
    return { ok: true, data };
  } catch (err) {
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
      return { ok: false, error: 'rows must be a SearchTermRow[]' };
    }
    const data = analyzeNgrams({
      rows: input.rows,
      options: input.options ?? {},
    });
    return { ok: true, data };
  } catch (err) {
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
        error: 'Provide campaignId or campaignName',
      };
    }
    const data = await runCampaignKeywords({ campaignId, campaignName });
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toError(err) };
  }
}
