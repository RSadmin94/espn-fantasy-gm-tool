import mysql from 'mysql2/promise';
const conn = await mysql.createConnection(process.env.DATABASE_URL);

for (const season of [2025, 2024, 2023, 2022]) {
  const [rows] = await conn.execute(
    `SELECT payload FROM espn_season_cache WHERE season = ? AND viewName = 'combined' ORDER BY fetchedAt DESC LIMIT 1`,
    [season]
  );
  if (!rows.length) { console.log(`No ${season} data`); continue; }
  const data = rows[0].payload;
  const schedule = data.schedule || [];
  const playoffMatchups = schedule.filter(m => m.playoffTierType && m.playoffTierType !== 'NONE');
  
  console.log(`\n=== ${season} Playoff Matchups ===`);
  for (const m of playoffMatchups.sort((a,b) => a.matchupPeriodId - b.matchupPeriodId)) {
    console.log(`Period ${m.matchupPeriodId} | Tier:${m.playoffTierType} | Home:${m.home?.teamId} vs Away:${m.away?.teamId} | Winner:${m.winner}`);
  }
  
  // Check rankFinal
  const teams = data.teams || [];
  const ranked = teams.filter(t => t.rankFinal > 0);
  if (ranked.length) {
    console.log(`rankFinal data: ${ranked.map(t => `Team${t.id}=#${t.rankFinal}`).join(', ')}`);
  } else {
    console.log('No rankFinal data for this season');
  }
}

await conn.end();
