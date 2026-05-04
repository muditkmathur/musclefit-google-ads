import 'dotenv/config';
import { GoogleAdsApi } from 'google-ads-api';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Accept days as CLI arg, default to 30 (any positive integer)
const args = process.argv.slice(2);
const parsed = args[0] !== undefined ? parseInt(args[0], 10) : 30;
const days = Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
const flags = new Set(args.slice(1));
const includeDaily = flags.has('--daily') || flags.has('--dod') || flags.has('--day-by-day');

if (!Number.isFinite(parsed) || parsed < 1) {
    console.error(`❌ Invalid input. Use a positive number of days. Example: node report.js 21`);
    process.exit(1);
}

function formatYmd(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/** Inclusive range: last N calendar days ending today (local date). */
function dateRangeForLastNDays(n) {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - (n - 1));
    return { start: formatYmd(start), end: formatYmd(end) };
}

const { start: rangeStart, end: rangeEnd } = dateRangeForLastNDays(days);
const periodLabel = `Last ${days} Days`;
const gaqlDateFilter = `segments.date BETWEEN '${rangeStart}' AND '${rangeEnd}'`;

const client = new GoogleAdsApi({
    client_id: process.env.GOOGLE_ADS_CLIENT_ID,
    client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET,
    developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
});

const customer = client.Customer({
    customer_id: process.env.GOOGLE_ADS_CUSTOMER_ID,
    refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN,
});

function directionForDelta(delta) {
    if (delta > 0) return 'up';
    if (delta < 0) return 'down';
    return 'flat';
}

function diff(prev, curr) {
    const delta = curr - prev;
    return { delta, direction: directionForDelta(delta) };
}

async function getCampaignDailyReport(reportsDir, timestamp) {
    const rows = await customer.query(`
      SELECT
        segments.date,
        campaign.name,
        campaign.status,
        metrics.impressions,
        metrics.clicks,
        metrics.ctr,
        metrics.cost_micros,
        metrics.conversions,
        metrics.average_cpc
      FROM campaign
      WHERE ${gaqlDateFilter}
        AND campaign.status = 'ENABLED'
      ORDER BY campaign.name, segments.date
    `);

    if (!rows.length) {
        console.log('No active campaigns found for daily breakdown.');
        return;
    }

    /** @type {Map<string, any[]>} */
    const byCampaign = new Map();
    for (const r of rows) {
        const name = r.campaign.name;
        const date = r.segments.date; // YYYY-MM-DD

        const entry = {
            date,
            impressions: r.metrics.impressions,
            clicks: r.metrics.clicks,
            ctr: r.metrics.ctr,
            spend_micros: r.metrics.cost_micros,
            conversions: r.metrics.conversions,
            avg_cpc_micros: r.metrics.average_cpc,
        };

        const list = byCampaign.get(name) ?? [];
        list.push(entry);
        byCampaign.set(name, list);
    }

    const campaigns = [];
    for (const [campaign, dayRows] of byCampaign.entries()) {
        // Ensure chronological order for DoD diffing
        dayRows.sort((a, b) => a.date.localeCompare(b.date));

        const enriched = dayRows.map((r, idx) => {
            const prev = idx > 0 ? dayRows[idx - 1] : null;
            const dod = prev
                ? {
                    impressions: diff(prev.impressions, r.impressions),
                    clicks: diff(prev.clicks, r.clicks),
                    spend_micros: diff(prev.spend_micros, r.spend_micros),
                    conversions: diff(prev.conversions, r.conversions),
                    ctr: diff(prev.ctr, r.ctr),
                    avg_cpc_micros: diff(prev.avg_cpc_micros, r.avg_cpc_micros),
                }
                : null;

            return {
                date: r.date,
                impressions: r.impressions,
                clicks: r.clicks,
                ctr: Number.isFinite(r.ctr) ? +(r.ctr * 100).toFixed(4) : null, // percent number
                spend: +(r.spend_micros / 1_000_000).toFixed(2),
                conversions: r.conversions,
                avg_cpc: +(r.avg_cpc_micros / 1_000_000).toFixed(2),
                dod: dod
                    ? {
                        impressions: dod.impressions,
                        clicks: dod.clicks,
                        spend: { delta: +(dod.spend_micros.delta / 1_000_000).toFixed(2), direction: dod.spend_micros.direction },
                        conversions: dod.conversions,
                        ctr: { delta: +(dod.ctr.delta * 100).toFixed(4), direction: dod.ctr.direction }, // pct-pt delta
                        avg_cpc: { delta: +(dod.avg_cpc_micros.delta / 1_000_000).toFixed(2), direction: dod.avg_cpc_micros.direction },
                    }
                    : null,
            };
        });

        campaigns.push({ campaign, days: enriched });
    }

    const dailyFilename = join(reportsDir, `campaign-report-daily-${days}d-${timestamp}.json`);
    const dailyOutput = {
        generated_at: new Date().toISOString(),
        period: periodLabel,
        date_range: { start: rangeStart, end: rangeEnd },
        campaigns,
    };

    writeFileSync(dailyFilename, JSON.stringify(dailyOutput, null, 2));
    console.log(`✅ Daily (DoD) report saved to ${dailyFilename}`);
}

async function getCampaignReport() {
    try {
        const rows = await customer.query(`
      SELECT
        campaign.name,
        campaign.status,
        metrics.clicks,
        metrics.impressions,
        metrics.ctr,
        metrics.cost_micros,
        metrics.conversions,
        metrics.cost_per_conversion,
        metrics.average_cpc
      FROM campaign
      WHERE ${gaqlDateFilter}
        AND campaign.status = 'ENABLED'
      ORDER BY metrics.cost_micros DESC
    `);

        if (!rows.length) {
            console.log('No active campaigns found.');
            return;
        }

        // Build report data
        const report = rows.map(r => ({
            campaign: r.campaign.name,
            status: r.campaign.status,
            impressions: r.metrics.impressions,
            clicks: r.metrics.clicks,
            ctr: `${(r.metrics.ctr * 100).toFixed(2)}%`,
            avg_cpc: `₹${(r.metrics.average_cpc / 1_000_000).toFixed(2)}`,
            spend: `₹${(r.metrics.cost_micros / 1_000_000).toFixed(2)}`,
            conversions: r.metrics.conversions,
            cpa: r.metrics.conversions > 0
                ? `₹${(r.metrics.cost_per_conversion / 1_000_000).toFixed(2)}`
                : 'N/A',
        }));

        // Totals row
        const totalSpend = rows.reduce((s, r) => s + r.metrics.cost_micros, 0) / 1_000_000;
        const totalClicks = rows.reduce((s, r) => s + r.metrics.clicks, 0);
        const totalImpressions = rows.reduce((s, r) => s + r.metrics.impressions, 0);
        const totalConversions = rows.reduce((s, r) => s + r.metrics.conversions, 0);

        const totals = {
            campaign: 'TOTAL',
            status: '—',
            impressions: totalImpressions,
            clicks: totalClicks,
            ctr: `${totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : 0}%`,
            avg_cpc: '—',
            spend: `₹${totalSpend.toFixed(2)}`,
            conversions: totalConversions,
            cpa: totalConversions > 0 ? `₹${(totalSpend / totalConversions).toFixed(2)}` : 'N/A',
        };

        // Save to output/reports/
        const reportsDir = join(__dirname, 'output', 'reports');
        mkdirSync(reportsDir, { recursive: true });
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = join(reportsDir, `campaign-report-${days}d-${timestamp}.json`);
        const output = {
            generated_at: new Date().toISOString(),
            period: periodLabel,
            date_range: { start: rangeStart, end: rangeEnd },
            campaigns: report,
            totals,
        };
        writeFileSync(filename, JSON.stringify(output, null, 2));
        console.log(`\n✅ Report saved to ${filename}\n`);

        // Display as table
        console.log(`📊 Campaign Report — ${periodLabel} (Active only)\n`);
        console.table(report);
        console.log('\n📈 Totals');
        console.table([totals]);

        if (includeDaily) {
            console.log(`\n📅 Generating day-by-day report (with DoD deltas) for ${days} days...\n`);
            await getCampaignDailyReport(reportsDir, timestamp);
        }

    } catch (err) {
        console.error('❌ Error fetching campaign report:', err.message);
        process.exit(1);
    }
}

getCampaignReport();