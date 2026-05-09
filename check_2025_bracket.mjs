import mysql from 'mysql2/promise';
const conn = await mysql.createConnection(process.env.DATABASE_URL);

const [rows] = await conn.execute(
  `SELECT payload, fetchedAt FROM espn_season_cache WHERE season = 2025 AND viewName = 'combined' ORDER BY fetchedAt DESC LIMIT 1`,
);
if (!rows.length) { console.log('No 2025 data'); process.exit(1); }
console.log('Using payload fetched at:', rows[0].fetchedAt);

const data = rows[0].payload;
const schedule = data.schedule || [];
const teams = data.teams || [];
const members = data.members || [];

const memberMap = {};
for (const m of members) memberMap[m.id] = `${m.firstName} ${m.lastName}`.trim() || m.displayName;
const teamMap = {};
for (const t of teams) teamMap[t.id] = { name: t.name, owner: memberMap[t.primaryOwner] || t.primaryOwner };

const name = (id) => id ? `Team${id} (${teamMap[id]?.owner || '?'})` : 'BYE';

console.log('\n=== ALL 2025 PLAYOFF MATCHUPS (sorted by period) ===');
const playoffMatchups = schedule.filter(m => m.playoffTierType && m.playoffTierType !== 'NONE');
for (const m of playoffMatchups.sort((a,b) => a.matchupPeriodId - b.matchupPeriodId || a.id - b.id)) {
  const homeScore = m.home?.totalPoints?.toFixed(1) || '?';
  const awayScore = m.away?.totalPoints?.toFixed(1) || '?';
  console.log(`  Period ${m.matchupPeriodId} | ${m.playoffTierType.padEnd(28)} | ${name(m.home?.teamId).padEnd(35)} (${homeScore}) vs ${name(m.away?.teamId).padEnd(35)} (${awayScore}) => Winner: ${m.winner}`);
}

// Championship path
console.log('\n=== CHAMPIONSHIP PATH TRACE ===');
const wb = playoffMatchups.filter(m => m.playoffTierType === 'WINNERS_BRACKET' && m.winner && m.winner !== 'UNDECIDED');
const maxPeriod = wb.reduce((max, m) => Math.max(max, m.matchupPeriodId), 0);
const finalGame = wb.filter(m => m.matchupPeriodId === maxPeriod).find(m => m.home?.teamId && m.away?.teamId);
if (finalGame) {
  const champId = finalGame.winner === 'HOME' ? finalGame.home?.teamId : finalGame.away?.teamId;
  const ruId = finalGame.winner === 'HOME' ? finalGame.away?.teamId : finalGame.home?.teamId;
  console.log(`Championship game (Period ${maxPeriod}): ${name(finalGame.home?.teamId)} vs ${name(finalGame.away?.teamId)}`);
  console.log(`Winner: ${finalGame.winner} => CHAMPION: ${name(champId)}`);
  console.log(`Runner-up: ${name(ruId)}`);
}

await conn.end();
