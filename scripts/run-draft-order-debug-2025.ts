/**
 * CLI: print 2025 Round 1 draft order debug table as JSON.
 * Usage: npx tsx scripts/run-draft-order-debug-2025.ts [leagueId]
 */
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { buildDraftOrderDebugReport } from "../server/draftOrderDebugger";
import { getSeasonDraftPicks } from "../server/historicalDataService";
import { cleanSeasonDraftPicks } from "../server/routers";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "..", ".env") });

const leagueId = process.argv[2] || process.env.ESPN_LEAGUE_ID || "457622";
const season = 2025;

const fb = await getSeasonDraftPicks(season, leagueId);
const cleaned =
  fb.count > 0 ? await cleanSeasonDraftPicks(leagueId, season, undefined, fb) : { picks: [] };

const report = await buildDraftOrderDebugReport({
  leagueId,
  season,
  round: 1,
  uiPicks: cleaned.picks.map((p) => ({
    overallPick: p.overallPick,
    round: p.round,
    roundPick: p.roundPick,
    teamName: p.teamName,
    playerName: p.playerName,
  })),
});

console.log(JSON.stringify({ summary: report.summary, rows: report.rows }, null, 2));
