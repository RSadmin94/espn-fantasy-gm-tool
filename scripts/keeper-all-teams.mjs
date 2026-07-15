import "dotenv/config";
import mysql from "mysql2/promise";
const conn = await mysql.createConnection(process.env.DATABASE_URL);

// 1. All historical keepers with player names
const [hist] = await conn.query(`
  SELECT d.season, d.roundId, d.playerName, d.position,
         t.name as teamName, t.ownerName
  FROM draft_picks d
  JOIN teams t ON t.season=d.season AND t.teamId=d.teamId
  WHERE d.leagueId='457622' AND d.isKeeper=1
    AND d.playerName IS NOT NULL AND d.playerName != ''
  ORDER BY d.season DESC, t.ownerName
`);
console.log("Named keepers:", JSON.stringify(hist));

// 2. All 2026 teams
const [teams] = await conn.query(`
  SELECT teamId, name, ownerName FROM teams
  WHERE leagueId='457622' AND season=2026 ORDER BY teamId
`);
console.log("2026 teams count:", teams.length);
console.log("Teams:", JSON.stringify(teams.map(t => ({id: t.teamId, name: t.name, owner: t.ownerName}))));

// 3. Which teams have keeper slots in 2026
const [slots] = await conn.query(`
  SELECT d.teamId, d.roundId, d.roundPick, d.playerName, d.position,
         t.name, t.ownerName
  FROM draft_picks d
  JOIN teams t ON t.season=d.season AND t.teamId=d.teamId
  WHERE d.leagueId='457622' AND d.season=2026 AND d.isKeeper=1
  ORDER BY d.teamId
`);
console.log("2026 keeper slots:", JSON.stringify(slots));

// 4. Current roster - top projected player per team
const [top] = await conn.query(`
  SELECT r.teamId, r.playerName, r.position, r.projectedPoints, r.slotId,
         t.name as teamName, t.ownerName
  FROM roster_entries r
  JOIN teams t ON t.season=r.season AND t.teamId=r.teamId
  WHERE r.leagueId='457622' AND r.season=2026 AND r.week=0
    AND r.slotId NOT IN (20,21) AND r.projectedPoints > 0
  ORDER BY r.teamId, r.projectedPoints DESC
`);
// Group top 3 per team
const byTeam = {};
for (const p of top) {
  if (!byTeam[p.teamId]) byTeam[p.teamId] = [];
  if (byTeam[p.teamId].length < 4) byTeam[p.teamId].push(p);
}
console.log("Top starters per team:", JSON.stringify(byTeam));

// 5. Check historical keeper repeat patterns
// Did any owner keep the same player multiple seasons?
const [repeats] = await conn.query(`
  SELECT t.ownerName, d.playerName, COUNT(*) as times
  FROM draft_picks d
  JOIN teams t ON t.season=d.season AND t.teamId=d.teamId
  WHERE d.leagueId='457622' AND d.isKeeper=1
    AND d.playerName != ''
  GROUP BY t.ownerName, d.playerName
  HAVING COUNT(*) > 1
`);
console.log("Repeat keepers:", JSON.stringify(repeats));

await conn.end();
