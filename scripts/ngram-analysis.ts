import {
  DEFAULT_NGRAM_INPUT,
  DEFAULT_NGRAM_OUTPUT,
  runNgramAnalysisFromFile,
} from "../src/lib/google-ads/ngram-analysis";
import type { NgramAnalysisOptions } from "../src/types/google-ads";

interface CliArgs extends NgramAnalysisOptions {
  inputPath: string;
  outputPath: string;
  help?: boolean;
  unknown?: string[];
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    inputPath: DEFAULT_NGRAM_INPUT,
    outputPath: DEFAULT_NGRAM_OUTPUT,
    n: [1, 2, 3, 4],
    top: 50,
    minCount: 2,
    minTokenLen: 2,
    keepNumbers: false,
    keepStopwords: false,
    weight: "count",
    campaign: null,
  };

  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i];
    if (!raw.startsWith("--")) {
      positional.push(raw);
      continue;
    }

    const [k, vMaybe] = raw.slice(2).split("=");
    const v = vMaybe ?? argv[i + 1];

    switch (k) {
      case "input":
        args.inputPath = String(v);
        if (!vMaybe) i++;
        break;
      case "out":
        args.outputPath = String(v);
        if (!vMaybe) i++;
        break;
      case "campaign":
        args.campaign = String(v ?? "").trim() || null;
        if (!vMaybe) i++;
        break;
      case "n":
        args.n = String(v)
          .split(",")
          .map((s) => Number(s.trim()))
          .filter((x) => Number.isFinite(x) && x >= 1 && x <= 5);
        if (!args.n.length) args.n = [1, 2, 3];
        if (!vMaybe) i++;
        break;
      case "top":
        args.top = Math.max(1, Number(v));
        if (!vMaybe) i++;
        break;
      case "minCount":
        args.minCount = Math.max(1, Number(v));
        if (!vMaybe) i++;
        break;
      case "minTokenLen":
        args.minTokenLen = Math.max(1, Number(v));
        if (!vMaybe) i++;
        break;
      case "keepNumbers":
        args.keepNumbers = true;
        break;
      case "keepStopwords":
        args.keepStopwords = true;
        break;
      case "weight":
        args.weight = String(v) as NgramAnalysisOptions["weight"];
        if (!vMaybe) i++;
        break;
      case "help":
        args.help = true;
        break;
      default:
        args.unknown ??= [];
        args.unknown.push(raw);
        break;
    }
  }

  if (positional[0]) args.inputPath = positional[0];
  return args;
}

function usage(): string {
  return `
Usage:
  pnpm ngram-analysis [data/output.json] [--top 50] [--n 1,2,3] [--minCount 2] [--weight count|clicks|impressions|cost]

Options:
  --input <path>         Input JSON from search-terms (default: data/output.json)
  --out <path>           Write analysis JSON (default: data/ngram-analysis.json)
  --campaign <text>      Only include rows whose campaign includes this text
  --n <csv>              N sizes (default: 1,2,3,4)
  --top <num>            Top results per n (default: 50)
  --minCount <num>       Minimum occurrences (default: 2)
  --minTokenLen <num>    Drop tokens shorter than this (default: 2)
  --keepNumbers          Keep numeric tokens (default: drop)
  --keepStopwords        Keep stopwords (default: drop)
  --weight <field>       count|clicks|impressions|cost (default: count)
  --help                 Show help
`.trim();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (args.unknown?.length) {
    console.error(`Unknown args: ${args.unknown.join(", ")}`);
    console.error(usage());
    process.exit(2);
  }

  try {
    const result = await runNgramAnalysisFromFile({
      inputPath: args.inputPath,
      outputPath: args.outputPath,
      n: args.n,
      top: args.top,
      minCount: args.minCount,
      minTokenLen: args.minTokenLen,
      keepNumbers: args.keepNumbers,
      keepStopwords: args.keepStopwords,
      weight: args.weight,
      campaign: args.campaign,
    });

    console.log(`✅ Wrote ${args.outputPath}`);
    for (const n of result.params.n) {
      const list = result.ngrams[String(n)] ?? [];
      console.log(`\nTop ${Math.min(args.top ?? 50, list.length)} ${n}-grams (weight=${result.weight})`);
      for (const item of list.slice(0, Math.min(args.top ?? 50, 20))) {
        const score = Number.isFinite(item.score) ? item.score : 0;
        console.log(`- ${item.ngram}  (count=${item.count}, score=${score.toFixed(2)})`);
      }
      if (list.length > 20) {
        console.log(`  … and ${list.length - 20} more (see ${args.outputPath})`);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
    console.error("❌ ngram-analysis failed:", message);
    process.exit(1);
  }
}

main();
