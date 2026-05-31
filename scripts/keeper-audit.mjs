import "dotenv/config";
import mysql from "mysql2/promise";
const conn = await mysql.createConnection(process.env.DATABASE_URL);

// 1. Full audit for Brock Bowers across all seasons
const [brock] = await conn.query(`
  SELECT d.season, d.roundId, d.roundPick, d.overallPick, d.playerName, d.isKeeper,
         t.name as teamName, t.ownerName, t.teamId
  FROM draft_picks d
  JOIN teams t ON t.season=d.season AND t.teamId=d.teamId
  WHERE d.leagueId='457622' AND d.playerName LIKE '%Bowers%'
  ORDER BY d.season DESC
`);
console.log("=== BROCK BOWERS DRAFT HISTORY ===");
console.log(JSON.stringify(brock, null, 2));

// 2. Who is on LOZELL roster and what round were they drafted?
const [lozellRoster] = await conn.query(`
  SELECT r.playerName, r.position, r.projectedPoints, r.slotId
  FROM roster_entries r
  WHERE r.leagueId='457622' AND r.season=2026 AND r.week=0 AND r.teamId=1
  ORDER BY r.projectedPoints DESC
`);
console.log("\n=== LOZELL 2026 ROSTER ===");
// For each player, find their most recent draft round
for (const p of lozellRoster) {
  const [draftHist] = await conn.query(`
    SELECT d.season, d.roundId, d.roundPick, t.ownerName
    FROM draft_picks d
    JOIN teams t ON t.season=d.season AND t.teamId=d.teamId
    WHERE d.leagueId='457622' AND d.playerName=?
    ORDER BY d.season DESC LIMIT 3
  `, [p.playerName]);
  console.log(`  ${p.playerName} (${p.position}, ${p.projectedPoints} pts): ${JSON.stringify(draftHist)}`);
}

// 3. All 4 keeper team rosters + draft history for top players
const keeperTeams = [
  {teamId: 1, name: "SMASHVILLE TITANS", owner: "LOZELL STYLES"},
  {teamId: 4, name: "Giv'me My Trophy", owner: "Demetri Clark"},
  {teamId: 11, name: "Str8FrmHell", owner: "Rod Sellers"},
  {teamId: 17, name: "3 And A Possible", owner: "Randy Broner Jr"},
];

for (const team of keeperTeams) {
  const [roster] = await conn.query(`
    SELECT r.playerName, r.position, r.projectedPoints
    FROM roster_entries r
    WHERE r.leagueId='457622' AND r.season=2026 AND r.week=0 AND r.teamId=?
      AND r.slotId NOT IN (20,21) AND r.projectedPoints > 100
    ORDER BY r.projectedPoints DESC LIMIT 5
  `, [team.teamId]);
  
  console.log(`\n=== ${team.name} (${team.owner}) TOP STARTERS ===`);
  for (const p of roster) {
    const [draftHist] = await conn.query(`
      SELECT d.season, d.roundId, d.roundPick, t.ownerName, t.name
      FROM draft_picks d
      JOIN teams t ON t.season=d.season AND t.teamId=d.teamId
      WHERE d.leagueId='457622' AND d.playerName=?
      ORDER BY d.season DESC LIMIT 3
    `, [p.playerName]);
    const draftStr = draftHist.length > 0 
      ? draftHist.map(d => `${d.season}:Rd${d.roundId}(${d.name})`).join(', ')
      : "NOT IN DRAFT HISTORY";
    console.log(`  ${p.playerName} (${p.position}) ${p.projectedPoints} pts | ${draftStr}`);
  }
}

// 4. Transaction audit - what types exist and counts per team
const [txTypes] = await conn.query(`
  SELECT type, status, COUNT(*) as cnt 
  FROM transactions WHERE leagueId='457622' 
  GROUP BY type, status ORDER BY cnt DESC
`);
console.log("\n=== TRANSACTION TYPES ===");
console.log(JSON.stringify(txTypes));

// 5. Transactions by team for current season
const [txByTeam] = await conn.query(`
  SELECT t.ownerName, tx.type, COUNT(*) as cnt
  FROM transactions tx
  JOIN teams t ON t.season=tx.season AND t.teamId=tx.toTeamId AND t.leagueId=tx.leagueId
  WHERE tx.leagueId='457622'
  GROUP BY t.ownerName, tx.type
  ORDER BY t.ownerName, cnt DESC
`);
console.log("\n=== TRANSACTIONS BY TEAM ===");
console.log(JSON.stringify(txByTeam));

// 6. Check React Query - dashboard stale time
const [allTeams] = await conn.query(`
  SELECT COUNT(*) as cnt FROM teams WHERE leagueId='457622' AND season=2026
`);
console.log("\n=== 2026 TEAM COUNT ===", allTeams[0].cnt);

await conn.end();
