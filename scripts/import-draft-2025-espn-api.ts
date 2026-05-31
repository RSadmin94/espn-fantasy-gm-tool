/**
 * Pull 2025 draft from ESPN mDraftDetail API and replace draft_picks.
 * Usage: npx tsx scripts/import-draft-2025-espn-api.ts [leagueId]
 */
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { importSeasonDraftFromEspnApi } from "../server/espnPersistence";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "..", ".env") });

const leagueId = process.argv[2] || process.env.ESPN_LEAGUE_ID || "457622";
const season = 2025;

const result = await importSeasonDraftFromEspnApi(leagueId, season);
console.log(JSON.stringify(result, null, 2));
if (result.status !== "imported") process.exit(1);
