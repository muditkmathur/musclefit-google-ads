import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type {
  NgramAnalysisOptions,
  NgramAnalysisResult,
  NgramItem,
  SearchTermRow,
  SearchTermsReport,
} from '@/types/google-ads';

const DEFAULT_STOPWORDS = new Set<string>([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'from', 'has',
  'have', 'how', 'i', 'in', 'is', 'it', 'its', 'me', 'my', 'of', 'on', 'or',
  'our', 'ours', 'the', 'their', 'them', 'they', 'this', 'to', 'was', 'we',
  'what', 'when', 'where', 'who', 'why', 'with', 'you', 'your',
  'near', 'best', 'top', 'price', 'cost', 'fees', 'fee',
]);

interface ResolvedOptions {
  n: number[];
  top: number;
  minCount: number;
  minTokenLen: number;
  keepNumbers: boolean;
  keepStopwords: boolean;
  weight: NonNullable<NgramAnalysisOptions['weight']>;
  campaign: string | null;
}

function resolveOptions(opts: NgramAnalysisOptions): ResolvedOptions {
  const n = (opts.n && opts.n.length ? opts.n : [1, 2, 3, 4]).filter(
    (x) => Number.isFinite(x) && x >= 1 && x <= 5,
  );
  return {
    n: n.length ? n : [1, 2, 3],
    top: Math.max(1, opts.top ?? 50),
    minCount: Math.max(1, opts.minCount ?? 2),
    minTokenLen: Math.max(1, opts.minTokenLen ?? 2),
    keepNumbers: Boolean(opts.keepNumbers),
    keepStopwords: Boolean(opts.keepStopwords),
    weight: opts.weight ?? 'count',
    campaign: opts.campaign?.trim() || null,
  };
}

function normalizeText(s: unknown): string {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokenize(
  text: string,
  cfg: Pick<ResolvedOptions, 'minTokenLen' | 'keepNumbers' | 'keepStopwords'>,
): string[] {
  if (!text) return [];
  return text
    .split(/\s+/g)
    .filter(Boolean)
    .filter((t) => {
      if (t.length < cfg.minTokenLen) return false;
      if (!cfg.keepNumbers && /^\d+(\.\d+)?$/.test(t)) return false;
      if (!cfg.keepStopwords && DEFAULT_STOPWORDS.has(t)) return false;
      return true;
    });
}

function ngrams(tokens: string[], n: number): string[] {
  if (tokens.length < n) return [];
  const out: string[] = [];
  for (let i = 0; i <= tokens.length - n; i++) {
    out.push(tokens.slice(i, i + n).join(' '));
  }
  return out;
}

function getWeight(
  row: Partial<SearchTermRow>,
  weight: ResolvedOptions['weight'],
): number {
  switch (weight) {
    case 'clicks':
      return Number(row.clicks ?? 0) || 0;
    case 'impressions':
      return Number(row.impressions ?? 0) || 0;
    case 'cost':
      return Number(row.cost ?? 0) || 0;
    case 'count':
    default:
      return 1;
  }
}

interface NgramStats {
  count: number;
  score: number;
  clicks: number;
  impressions: number;
  cost: number;
}

function sortEntries(map: Map<string, NgramStats>): NgramItem[] {
  return [...map.entries()]
    .map(([ngram, stats]) => ({ ngram, ...stats }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.count - a.count ||
        a.ngram.localeCompare(b.ngram),
    );
}

export interface AnalyzeNgramInput {
  rows: Array<Partial<SearchTermRow> & { searchTerm?: string }>;
  options?: NgramAnalysisOptions;
}

export function analyzeNgrams({
  rows,
  options = {},
}: AnalyzeNgramInput): NgramAnalysisResult {
  const opts = resolveOptions(options);

  const campaignNeedle = opts.campaign?.toLowerCase() ?? null;
  const filtered = campaignNeedle
    ? rows.filter((r) =>
        String(r.campaign ?? '').toLowerCase().includes(campaignNeedle),
      )
    : rows;

  const ngramMaps = new Map<number, Map<string, NgramStats>>();
  for (const n of opts.n) ngramMaps.set(n, new Map());

  for (const row of filtered) {
    const searchTerm = row.searchTerm;
    const normalized = normalizeText(searchTerm);
    const tokens = tokenize(normalized, opts);
    if (!tokens.length) continue;

    const w = getWeight(row, opts.weight);
    const clicks = Number(row.clicks ?? 0) || 0;
    const impressions = Number(row.impressions ?? 0) || 0;
    const cost = Number(row.cost ?? 0) || 0;

    for (const n of opts.n) {
      const map = ngramMaps.get(n)!;
      for (const g of ngrams(tokens, n)) {
        const prev = map.get(g) ?? {
          count: 0,
          score: 0,
          clicks: 0,
          impressions: 0,
          cost: 0,
        };
        prev.count += 1;
        prev.score += w;
        prev.clicks += clicks;
        prev.impressions += impressions;
        prev.cost += cost;
        map.set(g, prev);
      }
    }
  }

  const result: NgramAnalysisResult = {
    generatedAt: new Date().toISOString(),
    weight: opts.weight,
    campaign: opts.campaign,
    params: {
      n: opts.n,
      top: opts.top,
      minCount: opts.minCount,
      minTokenLen: opts.minTokenLen,
      keepNumbers: opts.keepNumbers,
      keepStopwords: opts.keepStopwords,
    },
    totals: {
      rows: filtered.length,
      rowsBeforeCampaignFilter: rows.length,
    },
    ngrams: {},
  };

  for (const n of opts.n) {
    const sorted = sortEntries(ngramMaps.get(n)!).filter(
      (x) => x.count >= opts.minCount,
    );
    result.ngrams[String(n)] = sorted.slice(0, opts.top);
  }

  return result;
}

export const DEFAULT_NGRAM_INPUT = join(process.cwd(), 'data', 'output.json');
export const DEFAULT_NGRAM_OUTPUT = join(
  process.cwd(),
  'data',
  'ngram-analysis.json',
);

export interface RunNgramFromFileOptions extends NgramAnalysisOptions {
  inputPath?: string;
  outputPath?: string | null;
}

export async function runNgramAnalysisFromFile(
  options: RunNgramFromFileOptions = {},
): Promise<NgramAnalysisResult> {
  const inputPath = options.inputPath ?? DEFAULT_NGRAM_INPUT;
  const raw = await readFile(inputPath, 'utf8');
  const json = JSON.parse(raw) as Partial<SearchTermsReport>;
  const rows = Array.isArray(json?.rows) ? json.rows : [];
  if (!rows.length) {
    throw new Error(
      `No rows found in ${inputPath}. Expected { rows: [...] } from search-terms output.`,
    );
  }

  const result = analyzeNgrams({ rows, options });

  if (options.outputPath !== null) {
    const outputPath = options.outputPath ?? DEFAULT_NGRAM_OUTPUT;
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, JSON.stringify(result, null, 2), 'utf8');
  }

  return result;
}
