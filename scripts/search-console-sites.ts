import { config } from "dotenv";

import path from "node:path";

config({ path: path.resolve(process.cwd(), ".env") });
config({ path: path.resolve(process.cwd(), ".env.local"), override: true });

import { listSearchConsoleSites } from "../src/lib/search-console/client";

async function main() {
  try {
    const sites = await listSearchConsoleSites();

    if (!sites.length) {
      console.log("No Search Console sites found for this account.");
      return;
    }

    console.log(`\n🔎 Search Console sites (${sites.length})\n`);
    console.table(sites);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("❌ Error listing Search Console sites:", message);
    process.exit(1);
  }
}

main();
