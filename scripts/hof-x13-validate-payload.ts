/**
 * PHASE X.13 — Validate Hall of Fame payload after matchup isPlayoff repair.
 *
 *   npx tsx scripts/hof-x13-validate-payload.ts [leagueId]
 */
import "dotenv/config";
import { getDb } from "../server/db.js";
import { buildHallOfFamePayload } from "../server/hallOfFameService.js";

const leagueId = String(process.argv[2] || "158918").trim();

const db = await getDb();
if (!db) {
  console.error("DATABASE_URL / getDb unavailable");
  process.exit(1);
}

const p = await buildHallOfFamePayload({ db, leagueId, userId: 0 });

const lbLen = p.championships.leaderboard?.length ?? 0;
const rsGames = p.coverage?.completedRsGmMatchupGames ?? 0;

const unwrap = (m: { available: boolean } | undefined) => m?.available === true;

const hiWeek = unwrap(p.singleGameRecords?.highestTeamScore);
const mostGames = unwrap(p.rivalryRecords?.mostGamesPlayed);

console.log("\n=== SECTION D — HoF payload ===");
console.log("League:", leagueId);
console.log("coverage.completedRsGmMatchupGames:", rsGames);
console.log("championships.leaderboard.length:", lbLen);
console.log("singleGameRecords.highestTeamScore available:", hiWeek);
console.log("rivalryRecords.mostGamesPlayed available:", mostGames);

const recKeys = Object.keys(p.singleGameRecords || {}) as Array<keyof typeof p.singleGameRecords>;
const rivKeys = Object.keys(p.rivalryRecords || {}) as Array<keyof typeof p.rivalryRecords>;
const recAvail = recKeys.filter((k) => p.singleGameRecords[k]?.available).length;
const rivAvail = rivKeys.filter((k) => p.rivalryRecords[k]?.available).length;

console.log("Records fields available:", `${recAvail}/${recKeys.length}`);
console.log("Rivalries fields available:", `${rivAvail}/${rivKeys.length}`);

const pass =
  rsGames > 0 &&
  hiWeek &&
  mostGames &&
  recAvail >= 4 &&
  rivAvail >= 2;

console.log("\nRESULT:", pass ? "PASS" : "FAIL");
if (!pass) {
  console.log("(Need RS completed games + key records/rivalry stats.)");
}

process.exit(pass ? 0 : 1);
