import "dotenv/config";
import mysql from "mysql2/promise";
const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Pool by position
const [pool] = await conn.query(`SELECT position, COUNT(*) as cnt FROM gm_player_registry WHERE position IN ('QB','RB','WR','TE','K','DEF') GROUP BY position ORDER BY cnt DESC`);
console.log("Pool by pos:", JSON.stringify(pool));

// 2026 roster by position
const [rpos] = await conn.query(`SELECT position, COUNT(*) as cnt FROM roster_entries WHERE leagueId='457622' AND season=2026 AND week=0 GROUP BY position ORDER BY cnt DESC`);
console.log("2026 roster by pos:", JSON.stringify(rpos));

// Team count + draft rounds
const [tc] = await conn.query(`SELECT COUNT(DISTINCT teamId) as teams, MAX(roundId) as maxRound FROM draft_picks WHERE leagueId='457622' AND season=2026`);
console.log("Teams/rounds:", JSON.stringify(tc));

// Top projected players per position (value pockets)
const [topProj] = await conn.query(`SELECT position, playerName, projectedPoints FROM roster_entries WHERE leagueId='457622' AND season=2026 AND week=0 AND projectedPoints > 200 ORDER BY position, projectedPoints DESC`);
console.log("High-value players:", JSON.stringify(topProj));

// Keeper positions (compression baseline)
const [keepers] = await conn.query(`SELECT d.position, t.ownerName FROM draft_picks d JOIN teams t ON t.season=d.season AND t.teamId=d.teamId WHERE d.leagueId='457622' AND d.season=2026 AND d.isKeeper=1`);
console.log("Keepers:", JSON.stringify(keepers));

await conn.end();
