// Audit championship counts per owner across all seasons
import { createConnection } from 'mysql2/promise';
import * as dotenv from 'dotenv';
dotenv.config();

const conn = await createConnection(process.env.DATABASE_URL);

const seasons = [2010,2011,2012,2013,2014,2015,2016,2017,2018,2019,2020,2021,2022,2023,2024,2025];

const champCounts = {};

for (const season of seasons) {
  const [rows] = await conn.execute(
    'SELECT payload FROM espn_season_cache WHERE season = ? AND viewName = ? LIMIT 1',
    [season, 'combined']
  );
  if (!rows.length) { console.log(`${season}: NO CACHE`); continue; }

  let payload;
  try {
    payload = typeof rows[0].payload === 'string' ? JSON.parse(rows[0].payload) : rows[0].payload;
  } catch { console.log(`${season}: PARSE ERROR`); continue; }

  const teams = payload?.teams || [];
  if (teams.length === 0) {
    // Show top-level keys to understand structure
    const keys = Object.keys(payload || {}).slice(0, 15);
    console.log(`${season}: NO TEAMS — top-level keys: ${keys.join(', ')}`);
    // Try alternate locations
    const altTeams = payload?.leagueTeams || payload?.data?.teams || payload?.league?.teams || [];
    if (altTeams.length > 0) {
      const altChamp = altTeams.find(t => t.rankCalculatedFinal === 1 || t?.team?.rankCalculatedFinal === 1);
      console.log(`  -> altTeams found ${altTeams.length}, champion: ${JSON.stringify(altChamp?.name || altChamp?.team?.name || 'none')}`);
    }
    continue;
  }
  const champion = teams.find(t => t.rankCalculatedFinal === 1);
  if (!champion) {
    console.log(`${season}: NO CHAMPION (teams=${teams.length})`);
    continue;
  }

  const ownerId = champion.primaryOwner || (champion.owners && champion.owners[0]);
  console.log(`${season}: champion="${champion.name}" primaryOwner=${ownerId} rankCalcFinal=${champion.rankCalculatedFinal}`);
  
  if (ownerId) {
    champCounts[ownerId] = (champCounts[ownerId] || []);
    champCounts[ownerId].push(season);
  }
}

console.log('\n=== CHAMPIONSHIP COUNTS BY OWNER ID ===');
for (const [ownerId, years] of Object.entries(champCounts)) {
  console.log(`  ${ownerId}: ${years.length} titles — ${years.join(', ')}`);
}

await conn.end();
