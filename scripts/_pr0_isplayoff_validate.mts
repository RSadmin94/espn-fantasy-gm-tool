/**
 * PR0 validation — isPlayoff classification + HoF Records/Rivalries population.
 *
 * Read-only. Confirms regular-season matchups are correctly classified
 * (isPlayoff=0) and that the Hall of Fame records/rivalries sections — which
 * filter on isPlayoff=0 completed games — actually populate.
 *
 * Usage:  npx tsx scripts/_pr0_isplayoff_validate.mts [leagueId]
 * Default leagueId: 158918
 */
import { readFileSync } from "node:fs";
import mysql from "mysql2/promise";

const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
const line = env.split(/\r?\n/).find((l) => /^DATABASE_URL\s*=/.test(l));
if (!line) { console.error("DATABASE_URL not found in .env"); process.exit(1); }
const url = line.replace(/^DATABASE_URL\s*=\s*/, "").replace(/^["']|["']$/g, "").trim();
process.env.DATABASE_URL = url;

const leagueId = process.argv[2] ?? "158918";

const conn = await mysql.createConnection(url);
const q = async (s: string, p: unknown[] = []) => (await conn.query(s, p))[0] as any[];

const dist = await q(`SELECT isPlayoff, COUNT(*) c FROM matchups WHERE leagueId=? GROUP BY isPlayoff ORDER BY isPlayoff`, [leagueId]);
const mismatch = (await q(
  `SELECT COUNT(*) c FROM matchups
   WHERE leagueId=?
     AND JSON_EXTRACT(rawMatchup,'$.playoffTierType') IS NOT NULL
     AND isPlayoff <> CASE WHEN JSON_UNQUOTE(JSON_EXTRACT(rawMatchup,'$.playoffTierType'))='NONE' THEN 0 ELSE 1 END`,
  [leagueId],
))[0].c;
await conn.end();

const { getDb } = await import("../server/db.ts");
const { buildHallOfFamePayload } = await import("../server/hallOfFameService.ts");
const db = await getDb();
if (!db) { console.error("NO_DB"); process.exit(1); }

const hof = await buildHallOfFamePayload({ db, leagueId, userId: 1 });
const rsGames = hof.coverage.completedRsGmMatchupGames;
const recordsAvailable = (hof.singleGameRecords.highestTeamScore as any)?.available !== false;
const rivalriesAvailable = (hof.rivalryRecords.mostGamesPlayed as any)?.available !== false;

console.log(`\n=== PR0 isPlayoff validation — league ${leagueId} ===`);
console.log("isPlayoff distribution:", JSON.stringify(dist));
console.log("rows disagreeing with rawMatchup tier (where tier present):", mismatch);
console.log("HoF coverage.completedRsGmMatchupGames:", rsGames);
console.log("singleGameRecords.highestTeamScore available:", recordsAvailable);
console.log("rivalryRecords.mostGamesPlayed available:", rivalriesAvailable);

const pass = mismatch === 0 && rsGames > 0 && recordsAvailable && rivalriesAvailable;
console.log(`\nRESULT: ${pass ? "PASS" : "FAIL"}`);
process.exit(pass ? 0 : 1);
