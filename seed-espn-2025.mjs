/**
 * seed-espn-2025.mjs
 * Fetches ESPN 2025 season data and stores it in the database.
 * Run with: node seed-espn-2025.mjs
 */
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { espnCache, refreshManifests } from "./drizzle/schema.js";
import { eq, and } from "drizzle-orm";
import fetch from "node:fetch";
import * as dotenv from "dotenv";
dotenv.config();

const LEAGUE_ID = process.env.ESPN_LEAGUE_ID || "457622";
const ESPN_S2 = process.env.ESPN_S2;
const ESPN_SWID = process.env.ESPN_SWID;
const DATABASE_URL = process.env.DATABASE_URL;

if (!ESPN_S2 || !ESPN_SWID) {
  console.error("Missing ESPN_S2 or ESPN_SWID environment variables");
  process.exit(1);
}

const SEASONS = [2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015, 2014, 2013, 2012, 2011, 2010, 2009];
const VIEWS = ["mSettings","mTeam","mRoster","mMatchup","mMatchupScore","mScoreboard","mSchedule","mStandings","mStatus","mDraftDetail","mTransactions2"];

async function fetchSeason(season) {
  const params = new URLSearchParams();
  VIEWS.forEach(v => params.append("view", v));
  const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${LEAGUE_ID}?${params}`;
  const resp = await fetch(url, {
    headers: {
      "Cookie": `SWID=${ESPN_SWID}; espn_s2=${ESPN_S2}`,
      "Accept": "application/json",
      "User-Agent": "Mozilla/5.0"
    }
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for season ${season}`);
  return resp.json();
}

async function main() {
  const conn = await mysql.createConnection(DATABASE_URL);
  const db = drizzle(conn);

  const seasonsToFetch = process.argv[2] ? [parseInt(process.argv[2])] : SEASONS;
  
  for (const season of seasonsToFetch) {
    console.log(`\n📡 Fetching ESPN data for ${season}...`);
    try {
      const data = await fetchSeason(season);
      const teams = data.teams || [];
      const settings = data.settings || {};
      const schedule = data.schedule || [];
      const draftDetail = data.draftDetail || {};
      
      console.log(`  ✅ ${teams.length} teams, ${schedule.length} matchups, ${(draftDetail.picks || []).length} draft picks`);
      
      // Upsert into espnCache
      const existing = await db.select().from(espnCache)
        .where(and(eq(espnCache.season, season), eq(espnCache.viewKey, "combined")))
        .limit(1);
      
      if (existing.length > 0) {
        await db.update(espnCache)
          .set({ payload: JSON.stringify(data), updatedAt: new Date() })
          .where(and(eq(espnCache.season, season), eq(espnCache.viewKey, "combined")));
        console.log(`  📝 Updated existing cache for ${season}`);
      } else {
        await db.insert(espnCache).values({
          season,
          viewKey: "combined",
          payload: JSON.stringify(data),
          updatedAt: new Date()
        });
        console.log(`  💾 Inserted new cache for ${season}`);
      }

      // Upsert refresh manifest
      const manifestExisting = await db.select().from(refreshManifests)
        .where(eq(refreshManifests.season, season)).limit(1);
      
      const manifestData = {
        season,
        status: "success",
        teamsCount: teams.length,
        matchupsCount: schedule.length,
        draftPicksCount: (draftDetail.picks || []).length,
        lastRefreshed: new Date(),
        error: null
      };

      if (manifestExisting.length > 0) {
        await db.update(refreshManifests).set(manifestData).where(eq(refreshManifests.season, season));
      } else {
        await db.insert(refreshManifests).values(manifestData);
      }

    } catch (err) {
      console.error(`  ❌ Failed for ${season}: ${err.message}`);
      // Record failure in manifest
      try {
        const manifestExisting = await db.select().from(refreshManifests)
          .where(eq(refreshManifests.season, season)).limit(1);
        const failData = { season, status: "error", error: err.message, lastRefreshed: new Date() };
        if (manifestExisting.length > 0) {
          await db.update(refreshManifests).set(failData).where(eq(refreshManifests.season, season));
        } else {
          await db.insert(refreshManifests).values(failData);
        }
      } catch {}
    }
  }

  await conn.end();
  console.log("\n✅ Seed complete!");
}

main().catch(err => { console.error(err); process.exit(1); });
