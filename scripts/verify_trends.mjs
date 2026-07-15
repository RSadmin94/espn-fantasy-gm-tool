import 'dotenv/config';
import mysql from 'mysql2/promise';
const conn = await mysql.createConnection(process.env.DATABASE_URL);

const one = async (sql) => (await conn.query(sql))[0][0];
const many = async (sql) => (await conn.query(sql))[0];

// 1. Population counts
const counts = await one(`SELECT
  COUNT(*) AS total,
  SUM(adp IS NOT NULL) AS withAdp,
  SUM(percentOwned IS NOT NULL) AS withPct,
  SUM(auctionValue IS NOT NULL) AS withAuction,
  SUM(adpChange IS NOT NULL) AS withChange,
  SUM(espnRank IS NOT NULL) AS withRank
  FROM gm_player_registry`);
console.log('1) POPULATION:', JSON.stringify(counts));

// 2. The EXACT query the keeper engine runs (draftWarRoomRouter line 966)
const keeperRows = await one(`SELECT COUNT(*) AS n FROM gm_player_registry WHERE adp IS NOT NULL`);
console.log('2) KEEPER ADP QUERY now returns rows:', keeperRows.n, '(was 0 -> no more Round 7 fallback)');

// Top of the board
const top = await many(`SELECT fullName, position, ROUND(adp,2) AS adp, ROUND(percentOwned,1) AS pctOwned, espnRank
  FROM gm_player_registry WHERE adp IS NOT NULL ORDER BY adp ASC LIMIT 12`);
console.log('   TOP 12 BY ADP:');
for (const r of top) console.log(`     ${r.fullName} (${r.position}) ADP ${r.adp} | owned ${r.pctOwned}% | rank ${r.espnRank}`);

// 3. Brock Bowers
const brock = await many(`SELECT fullName, position, ROUND(adp,2) AS adp, ROUND(percentOwned,1) AS pctOwned, espnRank, ROUND(adpChange,2) AS adpChange FROM gm_player_registry WHERE fullName LIKE '%Bowers%'`);
console.log('3) BROCK BOWERS:', JSON.stringify(brock));

// TEs by ADP (original complaint was TE over-valuation)
const tes = await many(`SELECT fullName, ROUND(adp,2) AS adp, espnRank FROM gm_player_registry WHERE position='TE' AND adp IS NOT NULL ORDER BY adp ASC LIMIT 8`);
console.log('   TOP 8 TEs BY ADP:');
for (const r of tes) console.log(`     ${r.fullName} ADP ${r.adp} | rank ${r.espnRank}`);

await conn.end();
