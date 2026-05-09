import mysql from 'mysql2/promise';
const conn = await mysql.createConnection(process.env.DATABASE_URL);

for (const season of [2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018]) {
  const [rows] = await conn.execute(
    `SELECT payload FROM espn_season_cache WHERE season = ? AND viewName = 'combined' ORDER BY fetchedAt DESC LIMIT 1`,
    [season]
  );
  if (!rows.length) { console.log(`${season}: No data`); continue; }
  const data = rows[0].payload;
  const schedule = data.schedule || [];
  const teams = data.teams || [];
  const members = data.members || [];

  const memberMap = {};
  for (const m of members) memberMap[m.id] = `${m.firstName} ${m.lastName}`.trim() || m.displayName;
  const teamMap = {};
  for (const t of teams) teamMap[t.id] = { name: t.name, owner: memberMap[t.primaryOwner] || t.primaryOwner };

  // Current (buggy) logic: reduce picks last by matchupPeriodId
  const completedPlayoffs = schedule.filter(
    m => m.playoffTierType === 'WINNERS_BRACKET' && m.winner && m.winner !== 'UNDECIDED'
  );
  
  let champMatchup = null;
  if (completedPlayoffs.length > 0) {
    champMatchup = completedPlayoffs.reduce((a, b) => a.matchupPeriodId >= b.matchupPeriodId ? a : b);
  }
  
  const currentChampId = champMatchup
    ? (champMatchup.winner === 'HOME' ? champMatchup.home?.teamId : champMatchup.away?.teamId)
    : null;
  const currentRunnerUpId = champMatchup
    ? (champMatchup.winner === 'HOME' ? champMatchup.away?.teamId : champMatchup.home?.teamId)
    : null;

  // Better logic: find the last period, then pick the WINNERS_BRACKET game in that period
  const maxPeriod = completedPlayoffs.reduce((max, m) => Math.max(max, m.matchupPeriodId), 0);
  const finalPeriodGames = completedPlayoffs.filter(m => m.matchupPeriodId === maxPeriod);
  // The championship is the one where both teams are non-null (not a bye)
  const finalGame = finalPeriodGames.find(m => m.home?.teamId && m.away?.teamId) || finalPeriodGames[0];
  
  const correctChampId = finalGame
    ? (finalGame.winner === 'HOME' ? finalGame.home?.teamId : finalGame.away?.teamId)
    : null;
  const correctRunnerUpId = finalGame
    ? (finalGame.winner === 'HOME' ? finalGame.away?.teamId : finalGame.home?.teamId)
    : null;

  const currentChamp = teamMap[currentChampId];
  const correctChamp = teamMap[correctChampId];
  const match = currentChampId === correctChampId ? '✓' : '✗ MISMATCH';

  console.log(`${season}: Current=${currentChamp?.owner || 'None'} (Team${currentChampId}) | Correct=${correctChamp?.owner || 'None'} (Team${correctChampId}) | Period=${maxPeriod} | FinalGames=${finalPeriodGames.length} ${match}`);
}

await conn.end();
