/**
 * fetch-league-history.mjs
 * Fetches ESPN leagueHistory view for all seasons and extracts
 * champion (rankCalculatedFinal=1) with their primaryOwner member ID.
 *
 * Usage: node scripts/fetch-league-history.mjs
 */
import * as dotenv from 'dotenv';
dotenv.config();

const LEAGUE_ID = process.env.ESPN_LEAGUE_ID || "457622";
const SWID      = process.env.ESPN_SWID || "";
const S2        = process.env.ESPN_S2   || "";

const ALL_SEASONS = [2010,2011,2012,2013,2014,2015,2016,2017,2018,2019,2020,2021,2022,2023,2024,2025];

async function fetchLeagueHistory(season) {
  const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/leagueHistory/${LEAGUE_ID}?seasonId=${season}&view=mTeam&view=mSettings`;
  const headers = {
    'Accept': 'application/json',
    'Cookie': `SWID=${SWID}; espn_s2=${S2}`,
    'X-Fantasy-Source': 'kona',
    'X-Fantasy-Platform': 'kona-PROD-m.fantasy.espn.com',
  };
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
  if (!res.ok) {
    console.error(`  ${season}: HTTP ${res.status}`);
    return null;
  }
  const data = await res.json();
  // leagueHistory returns an array of league objects
  const league = Array.isArray(data) ? data[0] : data;
  return league;
}

const results = [];

for (const season of ALL_SEASONS) {
  const league = await fetchLeagueHistory(season);
  if (!league) continue;

  const teams = league.teams || [];
  const members = league.members || [];

  // Build member map: id -> displayName
  const memberMap = {};
  for (const m of members) {
    memberMap[m.id] = `${m.firstName || ''} ${m.lastName || ''}`.trim() || m.displayName || m.id;
  }

  const champion = teams.find(t => t.rankCalculatedFinal === 1);
  if (!champion) {
    console.log(`${season}: NO CHAMPION (teams=${teams.length})`);
    continue;
  }

  const ownerId = champion.primaryOwner || (champion.owners && champion.owners[0]);
  const ownerName = memberMap[ownerId] || ownerId;
  console.log(`${season}: champion="${champion.name}" owner="${ownerName}" ownerId=${ownerId} rankCalcFinal=${champion.rankCalculatedFinal}`);
  results.push({ season, teamName: champion.name, ownerId, ownerName });
}

console.log('\n=== CHAMPIONSHIP SUMMARY ===');
const byOwner = {};
for (const r of results) {
  if (!byOwner[r.ownerId]) byOwner[r.ownerId] = { name: r.ownerName, years: [] };
  byOwner[r.ownerId].years.push(r.season);
}
for (const [id, data] of Object.entries(byOwner)) {
  console.log(`  ${data.name} (${id}): ${data.years.length} titles — ${data.years.join(', ')}`);
}
