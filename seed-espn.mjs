/**
 * seed-espn.mjs — Fetches ESPN season data and seeds the database.
 * Usage: node seed-espn.mjs [season]
 * Example: node seed-espn.mjs 2025
 * Without argument: seeds all seasons 2009-2025
 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);

// Load env from .env file
import { readFileSync, existsSync } from "fs";
function loadEnv() {
  const envPath = new URL(".env", import.meta.url).pathname;
  if (existsSync(envPath)) {
    const lines = readFileSync(envPath, "utf8").split("\n");
    for (const line of lines) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}
loadEnv();

const LEAGUE_ID = process.env.ESPN_LEAGUE_ID || "457622";
const ESPN_S2 = process.env.ESPN_S2;
const ESPN_SWID = process.env.ESPN_SWID;
const DATABASE_URL = process.env.DATABASE_URL;

if (!ESPN_S2 || !ESPN_SWID) {
  console.error("❌ Missing ESPN_S2 or ESPN_SWID env vars");
  process.exit(1);
}
if (!DATABASE_URL) {
  console.error("❌ Missing DATABASE_URL env var");
  process.exit(1);
}

const { drizzle } = await import("drizzle-orm/mysql2");
const mysql = await import("mysql2/promise");
const { eq, and, desc } = await import("drizzle-orm");

const VIEWS = [
  "mSettings","mTeam","mRoster","mMatchup","mMatchupScore",
  "mScoreboard","mSchedule","mStandings","mStatus","mDraftDetail","mTransactions2"
];

const ALL_SEASONS = [2025,2024,2023,2022,2021,2020,2019,2018,2017,2016,2015,2014,2013,2012,2011,2010,2009];

async function fetchSeason(season) {
  const params = new URLSearchParams();
  VIEWS.forEach(v => params.append("view", v));
  const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${LEAGUE_ID}?${params}`;
  const resp = await fetch(url, {
    headers: {
      "Cookie": `SWID=${ESPN_SWID}; espn_s2=${ESPN_S2}`,
      "Accept": "application/json",
      "User-Agent": "Mozilla/5.0 (compatible; ESPN-FF-GM/1.0)"
    }
  });
  if (resp.status === 401 || resp.status === 403) throw new Error(`Auth error ${resp.status} — cookies may have expired`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

async function main() {
  const conn = await mysql.default.createConnection(DATABASE_URL);
  const db = drizzle(conn);

  // Dynamically import schema (TypeScript compiled to JS at runtime via tsx)
  // We'll use raw SQL via mysql2 directly since we can't import TS schema in .mjs
  const seasonsToFetch = process.argv[2] ? [parseInt(process.argv[2])] : ALL_SEASONS;

  console.log(`\n🏈 ESPN FF GM Tool — Data Seeder`);
  console.log(`📋 League ID: ${LEAGUE_ID}`);
  console.log(`📅 Seasons to fetch: ${seasonsToFetch.join(", ")}\n`);

  for (const season of seasonsToFetch) {
    process.stdout.write(`📡 Fetching ${season}... `);
    try {
      const data = await fetchSeason(season);
      const teams = data.teams || [];
      const schedule = data.schedule || [];
      const draftPicks = (data.draftDetail || {}).picks || [];
      const transactions = data.transactions2 || [];
      const rosters = teams.flatMap(t => (t.roster || {}).entries || []);

      process.stdout.write(`✅ ${teams.length} teams, ${schedule.length} matchups, ${draftPicks.length} picks\n`);

      // Upsert into espn_season_cache using raw SQL for .mjs compatibility
      const payloadJson = JSON.stringify(data);
      await conn.execute(
        `INSERT INTO espn_season_cache (season, viewName, payload, fetchedAt, updatedAt)
         VALUES (?, ?, ?, NOW(), NOW())
         ON DUPLICATE KEY UPDATE payload = VALUES(payload), updatedAt = NOW()`,
        [season, "combined", payloadJson]
      );

      // Upsert refresh_manifest
      await conn.execute(
        `INSERT INTO refresh_manifest (season, lastRefreshedAt, teamCount, rosterCount, matchupCount, draftPickCount, transactionCount, status)
         VALUES (?, NOW(), ?, ?, ?, ?, ?, 'success')
         ON DUPLICATE KEY UPDATE
           lastRefreshedAt = NOW(),
           teamCount = VALUES(teamCount),
           rosterCount = VALUES(rosterCount),
           matchupCount = VALUES(matchupCount),
           draftPickCount = VALUES(draftPickCount),
           transactionCount = VALUES(transactionCount),
           status = 'success',
           errorMessage = NULL`,
        [season, teams.length, rosters.length, schedule.length, draftPicks.length, transactions.length]
      );

    } catch (err) {
      console.error(`❌ ${err.message}`);
      try {
        await conn.execute(
          `INSERT INTO refresh_manifest (season, lastRefreshedAt, status, errorMessage)
           VALUES (?, NOW(), 'failed', ?)
           ON DUPLICATE KEY UPDATE lastRefreshedAt = NOW(), status = 'failed', errorMessage = VALUES(errorMessage)`,
          [season, err.message]
        );
      } catch {}
    }
  }

  await conn.end();
  console.log("\n🎉 Seeding complete!");
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
