import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_INPUT = join(__dirname, 'data', 'output.json');
const DEFAULT_OUT = join(__dirname, 'data', 'ngram-analysis.json');

const DEFAULT_STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'from', 'has',
  'have', 'how', 'i', 'in', 'is', 'it', 'its', 'me', 'my', 'of', 'on', 'or',
  'our', 'ours', 'the', 'their', 'them', 'they', 'this', 'to', 'was', 'we',
  'what', 'when', 'where', 'who', 'why', 'with', 'you', 'your',
  // Common search glue
  'near', 'best', 'top', 'price', 'cost', 'fees', 'fee',
]);

function parseArgs(argv) {
  const args = {
    input: DEFAULT_INPUT,
    out: DEFAULT_OUT,
    n: [1, 2, 3, 4],
    top: 50,
    minCount: 2,
    minTokenLen: 2,
    keepNumbers: false,
    keepStopwords: false,
    weight: 'count', // count | clicks | impressions | cost
    campaign: null, // string filter (substring match)
  };

  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i];
    if (!raw.startsWith('--')) {
      positional.push(raw);
      continue;
    }

    const [k, vMaybe] = raw.slice(2).split('=');
    const v = vMaybe ?? argv[i + 1];

    switch (k) {
      case 'input':
        args.input = v;
        if (!vMaybe) i++;
        break;
      case 'out':
        args.out = v;
        if (!vMaybe) i++;
        break;
      case 'campaign':
        args.campaign = String(v ?? '').trim() || null;
        if (!vMaybe) i++;
        break;
      case 'n':
        args.n = String(v)
          .split(',')
          .map(s => Number(s.trim()))
          .filter(x => Number.isFinite(x) && x >= 1 && x <= 5);
        if (!args.n.length) args.n = [1, 2, 3];
        if (!vMaybe) i++;
        break;
      case 'top':
        args.top = Math.max(1, Number(v));
        if (!vMaybe) i++;
        break;
      case 'minCount':
        args.minCount = Math.max(1, Number(v));
        if (!vMaybe) i++;
        break;
      case 'minTokenLen':
        args.minTokenLen = Math.max(1, Number(v));
        if (!vMaybe) i++;
        break;
      case 'keepNumbers':
        args.keepNumbers = true;
        break;
      case 'keepStopwords':
        args.keepStopwords = true;
        break;
      case 'weight':
        args.weight = String(v);
        if (!vMaybe) i++;
        break;
      case 'help':
        args.help = true;
        break;
      default:
        args.unknown ??= [];
        args.unknown.push(raw);
        break;
    }
  }

  if (positional[0]) args.input = positional[0];
  return args;
}

function usage() {
  return `
Usage:
  node ngram-analysis.js [data/output.json] [--top 50] [--n 1,2,3] [--minCount 2] [--weight count|clicks|impressions|cost]

Options:
  --input <path>         Input JSON from search-terms.js (default: data/output.json)
  --out <path>           Write analysis JSON (default: data/ngram-analysis.json)
  --campaign <text>      Only include rows whose campaign includes this text
  --n <csv>              N sizes (default: 1,2,3)
  --top <num>            Top results per n (default: 50)
  --minCount <num>       Minimum occurrences (default: 2)
  --minTokenLen <num>    Drop tokens shorter than this (default: 2)
  --keepNumbers          Keep numeric tokens (default: drop)
  --keepStopwords        Keep stopwords (default: drop)
  --weight <field>       count|clicks|impressions|cost (default: count)
  --help                 Show help
`.trim();
}

function normalizeText(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokenize(text, { minTokenLen, keepNumbers, keepStopwords }) {
  if (!text) return [];
  const tokens = text.split(/\s+/g).filter(Boolean);
  return tokens.filter(t => {
    if (t.length < minTokenLen) return false;
    if (!keepNumbers && /^\d+(\.\d+)?$/.test(t)) return false;
    if (!keepStopwords && DEFAULT_STOPWORDS.has(t)) return false;
    return true;
  });
}

function ngrams(tokens, n) {
  if (tokens.length < n) return [];
  const out = [];
  for (let i = 0; i <= tokens.length - n; i++) {
    out.push(tokens.slice(i, i + n).join(' '));
  }
  return out;
}

function getWeight(row, weight) {
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

function getAgg(row) {
  return {
    clicks: Number(row.clicks ?? 0) || 0,
    impressions: Number(row.impressions ?? 0) || 0,
    cost: Number(row.cost ?? 0) || 0,
  };
}

function sortEntries(map) {
  return [...map.entries()]
    .map(([ngram, stats]) => ({ ngram, ...stats }))
    .sort((a, b) => (b.score - a.score) || (b.count - a.count) || a.ngram.localeCompare(b.ngram));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    process.exit(0);
  }

  if (args.unknown?.length) {
    console.error(`Unknown args: ${args.unknown.join(', ')}`);
    console.error(usage());
    process.exit(2);
  }

  const raw = await readFile(args.input, 'utf8');
  const json = JSON.parse(raw);
  const allRows = Array.isArray(json?.rows) ? json.rows : [];

  if (!allRows.length) {
    console.error(`No rows found in ${args.input}. Expected { rows: [...] } from search-terms.js`);
    process.exit(1);
  }

  const campaignNeedle = args.campaign?.toLowerCase() ?? null;
  const rows = campaignNeedle
    ? allRows.filter(r => String(r.campaign ?? '').toLowerCase().includes(campaignNeedle))
    : allRows;

  if (!rows.length) {
    console.error(
      campaignNeedle
        ? `No rows matched --campaign "${args.campaign}" in ${args.input}`
        : `No rows found in ${args.input}.`,
    );
    process.exit(1);
  }

  const ngramMaps = new Map();
  for (const n of args.n) ngramMaps.set(n, new Map());

  for (const row of rows) {
    const searchTerm = row.searchTerm ?? row['Search Term'];
    const normalized = normalizeText(searchTerm);
    const tokens = tokenize(normalized, args);
    if (!tokens.length) continue;

    const w = getWeight(row, args.weight);
    const agg = getAgg(row);
    for (const n of args.n) {
      const map = ngramMaps.get(n);
      for (const g of ngrams(tokens, n)) {
        const prev = map.get(g) ?? { count: 0, score: 0, clicks: 0, impressions: 0, cost: 0 };
        prev.count += 1;
        prev.score += w;
        prev.clicks += agg.clicks;
        prev.impressions += agg.impressions;
        prev.cost += agg.cost;
        map.set(g, prev);
      }
    }
  }

  const result = {
    generatedAt: new Date().toISOString(),
    input: args.input,
    weight: args.weight,
    campaign: args.campaign,
    params: {
      n: args.n,
      top: args.top,
      minCount: args.minCount,
      minTokenLen: args.minTokenLen,
      keepNumbers: args.keepNumbers,
      keepStopwords: args.keepStopwords,
    },
    totals: {
      rows: rows.length,
      rowsBeforeCampaignFilter: allRows.length,
    },
    ngrams: {},
  };

  for (const n of args.n) {
    const sorted = sortEntries(ngramMaps.get(n)).filter(x => x.count >= args.minCount);
    result.ngrams[String(n)] = sorted.slice(0, args.top);
  }

  await writeFile(args.out, JSON.stringify(result, null, 2), 'utf8');

  console.log(`✅ Wrote ${args.out}`);
  for (const n of args.n) {
    const list = result.ngrams[String(n)];
    console.log(`\nTop ${Math.min(args.top, list.length)} ${n}-grams (weight=${args.weight})`);
    for (const item of list.slice(0, Math.min(args.top, 20))) {
      const score = Number.isFinite(item.score) ? item.score : 0;
      console.log(`- ${item.ngram}  (count=${item.count}, score=${score.toFixed?.(2) ?? score})`);
    }
    if (list.length > 20) console.log(`  … and ${list.length - 20} more (see ${args.out})`);
  }
}

main().catch(err => {
  console.error('❌ ngram-analysis failed:', err?.stack || err?.message || err);
  process.exit(1);
});
