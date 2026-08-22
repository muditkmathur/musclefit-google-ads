import { buildCacheKey, getOrSetJson } from "@/lib/cache/query-cache";
import { CACHE_TTL_SECONDS } from "@/lib/cache/file-store";
import type { NgramAnalysisOptions, NgramAnalysisResult, SearchTermsReport } from "@/types/google-ads";

import { getCustomerId } from "./client";
import { analyzeNgrams } from "./ngram-analysis";
import { fetchSearchTermsReport } from "./search-terms";

export interface KeywordAnalysisBundle {
  searchTerms: SearchTermsReport;
  ngrams: NgramAnalysisResult;
}

export interface RunKeywordAnalysisOptions {
  monthsBack: number;
  campaign: string | null;
  ngramOptions: NgramAnalysisOptions;
  forceRefresh?: boolean;
}

export async function runKeywordAnalysisBundle(options: RunKeywordAnalysisOptions): Promise<KeywordAnalysisBundle> {
  const monthsBack = Math.max(1, Math.floor(options.monthsBack));
  const campaignFilter = options.campaign?.trim() || null;
  const ngramOptions: NgramAnalysisOptions = {
    ...(options.ngramOptions ?? {}),
    campaign: campaignFilter,
  };

  const cacheKey = buildCacheKey("keyword-analysis-bundle:v2", {
    customerId: getCustomerId(),
    monthsBack,
    campaignFilter,
    ngramOptions,
  });

  return getOrSetJson<KeywordAnalysisBundle>(
    cacheKey,
    async () => {
      const searchTerms = await fetchSearchTermsReport(monthsBack, campaignFilter);
      const ngrams = analyzeNgrams({ rows: searchTerms.rows, options: ngramOptions });
      return { searchTerms, ngrams };
    },
    CACHE_TTL_SECONDS,
    { forceRefresh: options.forceRefresh === true },
  );
}
