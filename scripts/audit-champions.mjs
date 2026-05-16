import { config } from 'dotenv';
config();

const ESPN_S2 = process.env.ESPN_S2;
const ESPN_SWID = process.env.ESPN_SWID;
const LEAGUE_ID = '457622';

const res = await fetch(
  `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/leagueHistory/${LEAGUE_ID}?view=mTeam&view=mMembers`,
  {
    headers: {
      Cookie: `espn_s2=${ESPN_S2}; SWID=${ESPN_SWID}`,
      Accept: 'application/json',
    },
  }
);
const data = await res.json();

const champCounts = {};

for (const season of data) {
  const seasonId = season.seasonId ?? season.id;
  const teams = season.teams ?? [];
  const members = season.members ?? [];

  // Build member ID -> display name map
  const memberMap = {};
  for (const m of members) {
    const name = [m.firstName, m.lastName].filter(Boolean).join(' ') || m.displayName || m.id;
    memberMap[m.id] = name;
  }

  // Find champion by rankCalculatedFinal=1
  const champ = teams.find(t => t.rankCalculatedFinal === 1);
  if (!champ) {
    console.log(`${seasonId}: NO CHAMPION FOUND`);
    continue;
  }

  const ownerId = champ.primaryOwner ?? (champ.owners && champ.owners[0]);
  const ownerName = memberMap[ownerId] ?? ownerId ?? 'UNKNOWN';

  console.log(`${seasonId}: "${champ.name}" -> ${ownerName} (${ownerId})`);

  if (!champCounts[ownerId]) {
    champCounts[ownerId] = { name: ownerName, count: 0, seasons: [] };
  }
  champCounts[ownerId].count++;
  champCounts[ownerId].seasons.push(seasonId);
}

console.log('\n=== CHAMPIONSHIP COUNTS BY OWNER (via rankCalculatedFinal + primaryOwner) ===');
const sorted = Object.entries(champCounts).sort((a, b) => b[1].count - a[1].count);
for (const [id, info] of sorted) {
  console.log(`${info.name}: ${info.count} championship(s) — seasons: ${info.seasons.join(', ')}`);
}
