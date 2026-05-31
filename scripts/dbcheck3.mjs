import "dotenv/config";
import mysql from "mysql2/promise";
const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Check a completed 2010 matchup
const [[m]] = await conn.query("SELECT * FROM matchups WHERE season=2010 AND isCompleted=1 AND homeScore > 0 LIMIT 1");
console.log("Sample 2010 matchup:", JSON.stringify(m));

// Get teams for that matchup
const [teams] = await conn.query("SELECT teamId, name, ownerName FROM teams WHERE season=2010 LIMIT 20");
console.log("2010 teams:", JSON.stringify(teams));

// Check roster_entries for that matchup's week
const [entries] = await conn.query(
  "SELECT teamId, playerName, position, slotId, projectedPoints, actualPoints FROM roster_entries WHERE season=2010 AND week=1 ORDER BY teamId, actualPoints DESC LIMIT 30"
);
console.log("\nRoster entries week 1 2010:", JSON.stringify(entries));

// Slot IDs breakdown
const [slots] = await conn.query("SELECT slotId, COUNT(*) as cnt FROM roster_entries WHERE season=2010 GROUP BY slotId ORDER BY slotId");
console.log("\nSlot ID counts:", JSON.stringify(slots));

// Check standings_snapshots for 2010 week 1
const [standings] = await conn.query("SELECT * FROM standings_snapshots WHERE season=2010 AND week=1 ORDER BY rank LIMIT 10");
console.log("\nStandings week 1:", JSON.stringify(standings));

// H2H history for two teams
const [h2h] = await conn.query("SELECT season, week, homeTeamId, awayTeamId, homeScore, awayScore, winnerTeamId FROM matchups WHERE season=2010 ORDER BY week LIMIT 10");
console.log("\nAll 2010 matchups:", JSON.stringify(h2h));

await conn.end();
