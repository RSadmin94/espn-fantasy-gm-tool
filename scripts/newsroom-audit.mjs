import "dotenv/config";
import mysql from "mysql2/promise";
const conn = await mysql.createConnection(process.env.DATABASE_URL);

// 1. Transactions - pick trades
const [txTypes] = await conn.query(`SELECT type, COUNT(*) as cnt FROM transactions GROUP BY type ORDER BY cnt DESC`);
console.log("Transaction types:", JSON.stringify(txTypes));

// 2. Sample pick trade transaction
const [pickTrades] = await conn.query(`SELECT * FROM transactions WHERE type LIKE '%TRADE%' OR type LIKE '%PICK%' LIMIT 3`);
console.log("Pick trade sample:", JSON.stringify(pickTrades).slice(0, 500));

// 3. Draft picks with keeper info
const [keepers] = await conn.query(`
  SELECT season, COUNT(*) as total, SUM(isKeeper) as keepers 
  FROM draft_picks 
  WHERE leagueId='457622' 
  GROUP BY season ORDER BY season DESC LIMIT 8
`);
console.log("Keepers by season:", JSON.stringify(keepers));

// 4. League medals full list
const [medals] = await conn.query(`SELECT * FROM league_medals WHERE leagueId='457622' ORDER BY season`);
console.log("All champions:", JSON.stringify(medals));

// 5. Standings for completed seasons
const [standings] = await conn.query(`
  SELECT s.season, s.teamId, s.\`rank\`, s.wins, s.losses, s.pointsFor, t.name, t.ownerName
  FROM standings_snapshots s 
  JOIN teams t ON t.season=s.season AND t.teamId=s.teamId
  WHERE s.season=2010 AND s.week=0
  ORDER BY s.\`rank\`
  LIMIT 12
`);
console.log("2010 final standings:", JSON.stringify(standings));

// 6. Draft picks for 2010 season - owner tendencies
const [dp2010] = await conn.query(`
  SELECT d.roundId, d.roundPick, d.playerName, d.position, t.name as teamName, t.ownerName
  FROM draft_picks d
  JOIN teams t ON t.season=d.season AND t.teamId=d.teamId
  WHERE d.season=2010 AND d.roundId <= 3
  ORDER BY d.overallPick
  LIMIT 30
`);
console.log("2010 early picks:", JSON.stringify(dp2010));

// 7. All matchup data for 2010 with team names
const [m2010] = await conn.query(`
  SELECT m.week, m.homeScore, m.awayScore, m.winnerTeamId, m.isPlayoff,
         th.name as homeName, th.ownerName as homeOwner,
         ta.name as awayName, ta.ownerName as awayOwner
  FROM matchups m
  JOIN teams th ON th.season=m.season AND th.teamId=m.homeTeamId
  JOIN teams ta ON ta.season=m.season AND ta.teamId=m.awayTeamId
  WHERE m.season=2010 AND m.isCompleted=1
  ORDER BY m.week, m.id
  LIMIT 30
`);
console.log("2010 matchups w/names:", JSON.stringify(m2010).slice(0, 1200));

// 8. Check roster entries structure for current season
const [re] = await conn.query(`SELECT * FROM roster_entries WHERE season=2026 LIMIT 3`);
console.log("2026 roster sample:", JSON.stringify(re).slice(0,600));

await conn.end();
