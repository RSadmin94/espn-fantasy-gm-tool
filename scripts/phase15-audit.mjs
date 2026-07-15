import "dotenv/config";
import mysql from "mysql2/promise";
const conn = await mysql.createConnection(process.env.DATABASE_URL);

// 1. Traded picks - what's in transactions
const [tradeAccept] = await conn.query(`
  SELECT t.*, teams.name as toTeamName, teams.ownerName
  FROM transactions t
  LEFT JOIN teams ON teams.season=t.season AND teams.teamId=t.toTeamId
  WHERE t.leagueId='457622' AND t.type IN ('TRADE_ACCEPT','TRADE_UPHOLD')
  AND t.status='EXECUTED'
  ORDER BY t.processedDate DESC
  LIMIT 10
`);
console.log("Executed trades:", JSON.stringify(tradeAccept));

// 2. Draft picks with owningTeamId vs teamId (traded picks have different owningTeamId)
const [tradedPicks] = await conn.query(`
  SELECT d.season, d.roundId, d.overallPick, d.teamId, d.owningTeamId,
         d.playerName, d.isKeeper,
         t1.name as draftingTeam, t1.ownerName as draftingOwner,
         t2.name as originalTeam, t2.ownerName as originalOwner
  FROM draft_picks d
  LEFT JOIN teams t1 ON t1.season=d.season AND t1.teamId=d.teamId
  LEFT JOIN teams t2 ON t2.season=d.season AND t2.teamId=d.owningTeamId
  WHERE d.leagueId='457622' AND d.owningTeamId IS NOT NULL AND d.owningTeamId != d.teamId
  LIMIT 20
`);
console.log("Traded picks (owningTeamId != teamId):", JSON.stringify(tradedPicks).slice(0, 1500));

// 3. Keeper history - track same player kept across seasons
// Check 2026 draft picks again for more detail
const [dp2026] = await conn.query(`
  SELECT d.roundId, d.roundPick, d.overallPick, d.playerName, d.position,
         d.isKeeper, d.bidAmount, d.teamId, t.name, t.ownerName
  FROM draft_picks d
  JOIN teams t ON t.season=d.season AND t.teamId=d.teamId
  WHERE d.leagueId='457622' AND d.season=2026
  ORDER BY d.overallPick
  LIMIT 30
`);
console.log("2026 draft picks first 30:", JSON.stringify(dp2026));

// 4. All keeper instances across seasons
const [allKeepers] = await conn.query(`
  SELECT d.season, d.roundId, d.playerName, d.position,
         t.ownerName, t.name as teamName
  FROM draft_picks d
  JOIN teams t ON t.season=d.season AND t.teamId=d.teamId
  WHERE d.leagueId='457622' AND d.isKeeper=1
  ORDER BY d.season DESC
`);
console.log("All keeper instances:", JSON.stringify(allKeepers));

// 5. Position distribution by round from historical data
const [roundPos] = await conn.query(`
  SELECT d.roundId, d.position, COUNT(*) as cnt
  FROM draft_picks d
  JOIN teams t ON t.season=d.season AND t.teamId=d.teamId
  WHERE d.leagueId='457622' AND d.position != '?' AND d.playerName != ''
  AND d.roundId <= 5
  GROUP BY d.roundId, d.position
  ORDER BY d.roundId, cnt DESC
`);
console.log("Historical round-position distribution:", JSON.stringify(roundPos));

// 6. Check rawTransaction for pick trade details
const [rawTrades] = await conn.query(`
  SELECT type, status, playerKey, playerName, fromTeamId, toTeamId, 
         rawTransaction
  FROM transactions
  WHERE leagueId='457622' AND type='TRADE_ACCEPT'
  LIMIT 3
`);
console.log("Raw trade accepts:", JSON.stringify(rawTrades).slice(0, 2000));

await conn.end();
