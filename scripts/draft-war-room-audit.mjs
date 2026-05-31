import "dotenv/config";
import mysql from "mysql2/promise";
const conn = await mysql.createConnection(process.env.DATABASE_URL);

// 1. Draft picks with keeper flag per season
const [kp] = await conn.query(`
  SELECT d.season, d.roundId, d.roundPick, d.overallPick,
         d.playerName, d.position, d.isKeeper,
         t.name as teamName, t.ownerName
  FROM draft_picks d
  JOIN teams t ON t.season=d.season AND t.teamId=d.teamId
  WHERE d.leagueId='457622' AND d.isKeeper=1
  ORDER BY d.season DESC, d.overallPick
  LIMIT 30
`);
console.log("All keepers:", JSON.stringify(kp));

// 2. Owner position tendencies by round
const [tend] = await conn.query(`
  SELECT t.ownerName, d.roundId, d.position, COUNT(*) as picks
  FROM draft_picks d
  JOIN teams t ON t.season=d.season AND t.teamId=d.teamId
  WHERE d.leagueId='457622' AND d.roundId <= 5 AND d.playerName != '' AND d.position != '?'
  GROUP BY t.ownerName, d.roundId, d.position
  ORDER BY t.ownerName, d.roundId, picks DESC
`);
console.log("Owner tendencies (round 1-5):", JSON.stringify(tend).slice(0, 2000));

// 3. Current 2026 roster
const [roster] = await conn.query(`
  SELECT r.teamId, r.playerName, r.position, r.slotId, r.projectedPoints,
         r.injuryStatus, t.name as teamName, t.ownerName
  FROM roster_entries r
  JOIN teams t ON t.season=r.season AND t.teamId=r.teamId
  WHERE r.leagueId='457622' AND r.season=2026 AND r.week=0
  ORDER BY r.teamId, r.projectedPoints DESC
`);
console.log("2026 roster count:", roster.length);
console.log("2026 roster sample:", JSON.stringify(roster.slice(0,5)));

// 4. Draft round coverage by season
const [coverage] = await conn.query(`
  SELECT season, COUNT(*) as picks, MAX(roundId) as maxRound,
         COUNT(DISTINCT teamId) as teams
  FROM draft_picks
  WHERE leagueId='457622' AND playerName != ''
  GROUP BY season ORDER BY season DESC
  LIMIT 10
`);
console.log("Draft coverage:", JSON.stringify(coverage));

// 5. Unique owners across seasons
const [owners] = await conn.query(`
  SELECT DISTINCT ownerName, COUNT(DISTINCT season) as seasons
  FROM teams WHERE leagueId='457622'
  GROUP BY ownerName ORDER BY seasons DESC LIMIT 15
`);
console.log("Owners:", JSON.stringify(owners));

// 6. 2026 teams (current draft class)
const [teams26] = await conn.query(`
  SELECT teamId, name, ownerName, wins, losses, pointsFor
  FROM teams WHERE leagueId='457622' AND season=2026
  ORDER BY teamId
`);
console.log("2026 teams:", JSON.stringify(teams26));

// 7. Slot IDs (starter vs bench)
const [slots] = await conn.query(`
  SELECT slotId, COUNT(*) as cnt FROM roster_entries
  WHERE leagueId='457622' AND season=2026 AND week=0
  GROUP BY slotId ORDER BY slotId
`);
console.log("Slot distribution:", JSON.stringify(slots));

await conn.end();
