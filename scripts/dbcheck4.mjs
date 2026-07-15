import "dotenv/config";
import mysql from "mysql2/promise";
const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Standings (rank is reserved word)
const [s] = await conn.query("SELECT * FROM standings_snapshots WHERE season=2010 AND week=1 ORDER BY `rank`");
console.log("Standings week 1 2010:", JSON.stringify(s));

// All 2010 matchups with scores
const [m] = await conn.query("SELECT id, week, homeTeamId, awayTeamId, homeScore, awayScore, winnerTeamId, isPlayoff FROM matchups WHERE season=2010 AND isCompleted=1 ORDER BY week, id");
console.log("\n2010 completed matchups:", JSON.stringify(m));

// H2H counts between teams
const [h2h] = await conn.query(`
  SELECT homeTeamId, awayTeamId, 
    COUNT(*) as totalGames,
    SUM(CASE WHEN winnerTeamId=homeTeamId THEN 1 ELSE 0 END) as homeWins,
    SUM(CASE WHEN winnerTeamId=awayTeamId THEN 1 ELSE 0 END) as awayWins
  FROM matchups WHERE season=2010 AND isCompleted=1
  GROUP BY homeTeamId, awayTeamId
  HAVING totalGames > 1
`);
console.log("\nH2H with >1 game:", JSON.stringify(h2h));

// Roster entries - check if any season has data
const [re] = await conn.query("SELECT season, week, COUNT(*) as cnt FROM roster_entries WHERE actualPoints > 0 GROUP BY season, week ORDER BY season DESC, week DESC");
console.log("\nRoster entries with actual points:", JSON.stringify(re));

await conn.end();
