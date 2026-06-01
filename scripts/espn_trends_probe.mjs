import 'dotenv/config';

const season = 2026;
const leagueId = process.env.ESPN_LEAGUE_ID;
const swid = process.env.ESPN_SWID;
const s2 = process.env.ESPN_S2;

const filter = JSON.stringify({
  players: {
    limit: 10,
    offset: 0,
    sortPercOwned: { sortAsc: false, sortPriority: 1 },
    filterSlotIds: { value: [0, 2, 4, 6, 8, 9, 10, 11, 16, 17, 23] },
  },
});

const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${leagueId}?view=kona_player_info`;

const r = await fetch(url, {
  headers: {
    Accept: 'application/json',
    'x-fantasy-filter': filter,
    'X-Fantasy-Source': 'kona',
    'X-Fantasy-Platform': 'kona',
    Cookie: `SWID=${swid}; espn_s2=${s2}`,
  },
});

console.log('HTTP', r.status);
if (!r.ok) { console.log('BODY', (await r.text()).slice(0, 300)); process.exit(1); }
const data = await r.json();
const players = data?.players || [];
console.log('PLAYER_COUNT', players.length);
for (const entry of players.slice(0, 5)) {
  const p = entry.player || {};
  console.log('---', p.fullName, '| posId', p.defaultPositionId, '| id', p.id);
  console.log('  ownership:', JSON.stringify(p.ownership));
  console.log('  draftRanksByRankType:', JSON.stringify(p.draftRanksByRankType));
}
