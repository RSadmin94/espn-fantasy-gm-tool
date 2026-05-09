import mysql from 'mysql2/promise';
const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Check transaction data for 2025 to verify counts are correct
const [rows] = await conn.execute(
  `SELECT payload FROM espn_season_cache WHERE season = 2025 AND viewName = 'combined' ORDER BY fetchedAt DESC LIMIT 1`
);
const data = rows[0].payload;
const teams = data.teams || [];
const members = data.members || [];

const memberMap = {};
for (const m of members) memberMap[m.id] = `${m.firstName} ${m.lastName}`.trim() || m.displayName;

console.log('\n=== 2025 Transaction Counters (from ESPN transactionCounter field) ===');
for (const t of teams.sort((a,b) => a.id - b.id)) {
  const tc = t.transactionCounter || {};
  const owner = memberMap[t.primaryOwner] || t.primaryOwner;
  console.log(`Team${t.id} | ${owner.padEnd(22)} | acq:${(tc.acquisitions??0).toString().padStart(3)} | drops:${(tc.drops??0).toString().padStart(3)} | trades:${(tc.trades??0).toString().padStart(2)} | moveToActive:${(tc.moveToActive??0).toString().padStart(2)} | moveToIR:${(tc.moveToIR??0).toString().padStart(2)}`);
}

// Also check 2024 to compare
const [rows2] = await conn.execute(
  `SELECT payload FROM espn_season_cache WHERE season = 2024 AND viewName = 'combined' ORDER BY fetchedAt DESC LIMIT 1`
);
const data2 = rows2[0].payload;
const teams2 = data2.teams || [];
const members2 = data2.members || [];
const memberMap2 = {};
for (const m of members2) memberMap2[m.id] = `${m.firstName} ${m.lastName}`.trim() || m.displayName;

console.log('\n=== 2024 Transaction Counters ===');
for (const t of teams2.sort((a,b) => a.id - b.id)) {
  const tc = t.transactionCounter || {};
  const owner = memberMap2[t.primaryOwner] || t.primaryOwner;
  console.log(`Team${t.id} | ${owner.padEnd(22)} | acq:${(tc.acquisitions??0).toString().padStart(3)} | drops:${(tc.drops??0).toString().padStart(3)} | trades:${(tc.trades??0).toString().padStart(2)}`);
}

await conn.end();
