import "dotenv/config";
import mysql from "mysql2/promise";
const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Randy's full roster
const [randy] = await conn.query(`
  SELECT r.playerName, r.position, r.slotId, r.projectedPoints, r.injuryStatus
  FROM roster_entries r
  WHERE r.leagueId='457622' AND r.season=2026 AND r.week=0 AND r.teamId=17
  ORDER BY r.projectedPoints DESC
`);
console.log("RANDY (teamId=17) roster:", JSON.stringify(randy));

// LOZELL full roster
const [lozell] = await conn.query(`
  SELECT r.playerName, r.position, r.slotId, r.projectedPoints
  FROM roster_entries r
  WHERE r.leagueId='457622' AND r.season=2026 AND r.week=0 AND r.teamId=1
  ORDER BY r.projectedPoints DESC
`);
console.log("LOZELL (teamId=1) roster:", JSON.stringify(lozell));

// All starters (non-bench) per team
const [starters] = await conn.query(`
  SELECT teamId, playerName, position, slotId, projectedPoints
  FROM roster_entries
  WHERE leagueId='457622' AND season=2026 AND week=0 AND slotId NOT IN (20,21)
  ORDER BY teamId, projectedPoints DESC
`);
console.log("All starters by team:", JSON.stringify(starters).slice(0,3000));

// VBD baselines - find replacement level by position
// For 14 teams: QB baseline = 14th QB, RB = 28th, WR = 28th, TE = 14th
const [vbd] = await conn.query(`
  SELECT position, playerName, projectedPoints,
    ROW_NUMBER() OVER (PARTITION BY position ORDER BY projectedPoints DESC) as posRank
  FROM roster_entries
  WHERE leagueId='457622' AND season=2026 AND week=0 AND slotId NOT IN (20,21)
  AND position IN ('QB','RB','WR','TE','K')
  ORDER BY position, projectedPoints DESC
`);
// Group by position
const posRanks = {};
for (const p of vbd) {
  if (!posRanks[p.position]) posRanks[p.position] = [];
  posRanks[p.position].push({ name: p.playerName, pts: parseFloat(p.projectedPoints), rank: p.posRank });
}
for (const [pos, players] of Object.entries(posRanks)) {
  console.log(`${pos} top 5 + baseline:`, JSON.stringify(players.slice(0,5)));
}

await conn.end();
