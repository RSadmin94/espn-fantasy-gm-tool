import 'dotenv/config';
import mysql from 'mysql2/promise';
const conn = await mysql.createConnection(process.env.DATABASE_URL);
const L = '457622';

const [counts] = await conn.query(`SELECT season, COUNT(*) AS picks, MIN(overallPick) AS minOv, MAX(overallPick) AS maxOv, SUM(isKeeper) AS keepers FROM draft_picks WHERE leagueId='${L}' GROUP BY season ORDER BY season DESC`);
console.log('DRAFT_PICKS BY SEASON:', JSON.stringify(counts));

const [r1] = await conn.query(`
  SELECT dp.overallPick, dp.roundId, dp.roundPick, dp.teamId, t.ownerName, t.name AS teamName, dp.isKeeper, dp.playerName
  FROM draft_picks dp
  LEFT JOIN teams t ON t.leagueId=dp.leagueId AND t.season=dp.season AND t.teamId=dp.teamId
  WHERE dp.leagueId='${L}' AND dp.season=2026 AND dp.roundId=1
  ORDER BY dp.overallPick ASC`);
console.log('\n2026 ROUND 1 ORDER:');
for (const p of r1) console.log(`  ov${p.overallPick} r${p.roundId}.${p.roundPick} team ${p.teamId} ${p.ownerName ?? '??'} (${p.teamName ?? '?'}) ${p.isKeeper? 'KEEPER':''} ${p.playerName ?? ''}`);

const [r2] = await conn.query(`
  SELECT dp.overallPick, dp.roundPick, dp.teamId, t.ownerName
  FROM draft_picks dp LEFT JOIN teams t ON t.leagueId=dp.leagueId AND t.season=dp.season AND t.teamId=dp.teamId
  WHERE dp.leagueId='${L}' AND dp.season=2026 AND dp.roundId=2 ORDER BY dp.overallPick ASC`);
console.log('\n2026 ROUND 2 ORDER (check snake):');
for (const p of r2) console.log(`  ov${p.overallPick} r2.${p.roundPick} team ${p.teamId} ${p.ownerName ?? '??'}`);

await conn.end();
