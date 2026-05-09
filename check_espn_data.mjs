import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Get the most recent 2025 combined payload
const [rows] = await conn.execute(
  `SELECT payload FROM espn_season_cache WHERE season = 2025 AND viewName = 'combined' ORDER BY fetchedAt DESC LIMIT 1`
);

if (!rows.length) { console.log('No 2025 data'); process.exit(1); }

const data = rows[0].payload;
const teams = data.teams || [];
const members = data.members || [];

// Build member lookup
const memberMap = {};
for (const m of members) {
  memberMap[m.id] = `${m.firstName} ${m.lastName}`.trim() || m.displayName || m.id;
}

// Print team records
console.log('\n=== 2025 Team Records ===');
for (const t of teams.sort((a,b) => (b.record?.overall?.wins||0) - (a.record?.overall?.wins||0))) {
  const overall = t.record?.overall || {};
  const owner = memberMap[t.primaryOwner] || t.primaryOwner || 'Unknown';
  console.log(`Team ${t.id} | ${(t.name||'').padEnd(25)} | Owner: ${owner.padEnd(20)} | W:${overall.wins??'?'} L:${overall.losses??'?'} | PF:${(t.points||0).toFixed(1)} | PA:${(overall.pointsAgainst||0).toFixed(1)} | Seed:${t.playoffSeed??'?'} | RankFinal:${t.rankFinal??'?'}`);
}

// Check champion detection
const schedule = data.schedule || [];
const completedPlayoffs = schedule.filter(m => m.playoffTierType === 'WINNERS_BRACKET' && m.winner && m.winner !== 'UNDECIDED');
console.log(`\n=== Playoff Bracket Matchups (completed) ===`);
for (const m of completedPlayoffs.sort((a,b) => a.matchupPeriodId - b.matchupPeriodId)) {
  console.log(`Period ${m.matchupPeriodId} | Home:${m.home?.teamId} vs Away:${m.away?.teamId} | Winner:${m.winner}`);
}

// Check settings
const settings = data.settings || {};
console.log(`\n=== Settings ===`);
console.log(`matchupPeriodCount: ${settings.scheduleSettings?.matchupPeriodCount}`);
console.log(`playoffTeamCount: ${settings.scheduleSettings?.playoffTeamCount}`);
console.log(`playoffMatchupPeriodLength: ${settings.scheduleSettings?.playoffMatchupPeriodLength}`);

await conn.end();
