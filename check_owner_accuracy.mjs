import mysql from 'mysql2/promise';
const conn = await mysql.createConnection(process.env.DATABASE_URL);

const SEASONS = [2018,2019,2020,2021,2022,2023,2024,2025];
const ownerMap = new Map();

for (const season of SEASONS) {
  const [rows] = await conn.execute(
    `SELECT payload FROM espn_season_cache WHERE season = ? AND viewName = 'combined' ORDER BY fetchedAt DESC LIMIT 1`,
    [season]
  );
  if (!rows[0]) { console.log(`No data for ${season}`); continue; }
  const data = rows[0].payload;
  const teams = data.teams || [];
  const members = data.members || [];
  const schedule = data.schedule || [];
  
  const memberMap = {};
  for (const m of members) memberMap[m.id] = `${m.firstName} ${m.lastName}`.trim();
  const teamToMember = {};
  for (const t of teams) teamToMember[t.id] = t.primaryOwner;
  
  // Find champion
  let champTeamId = null;
  const winnersBracket = schedule.filter(m => m.playoffTierType === 'WINNERS_BRACKET' && m.winner && m.winner !== 'UNDECIDED');
  if (winnersBracket.length > 0) {
    const maxPeriod = Math.max(...winnersBracket.map(m => m.matchupPeriodId));
    const finalGames = winnersBracket.filter(m => m.matchupPeriodId === maxPeriod);
    if (finalGames.length === 1) {
      const g = finalGames[0];
      champTeamId = g.winner === 'HOME' ? g.home?.teamId : g.away?.teamId;
    }
  }
  
  for (const t of teams) {
    const memberId = t.primaryOwner;
    if (!memberId) continue;
    if (!ownerMap.has(memberId)) ownerMap.set(memberId, { name: memberMap[memberId] || memberId, wins: 0, losses: 0, pf: 0, pa: 0, playoffs: 0, champs: 0, seasons: 0 });
    const o = ownerMap.get(memberId);
    const rec = t.record?.overall || {};
    o.wins += rec.wins ?? 0;
    o.losses += rec.losses ?? 0;
    o.pf += t.points ?? 0;
    o.pa += rec.pointsAgainst ?? 0;
    o.seasons++;
    if ((t.playoffSeed ?? 0) > 0 && (t.playoffSeed ?? 0) <= 7) o.playoffs++;
    if (t.id === champTeamId) { o.champs++; console.log(`${season} Champion: ${memberMap[memberId]} (Team${t.id})`); }
  }
}

console.log('\n=== ALL-TIME CAREER STATS (from raw ESPN data) ===');
const sorted = [...ownerMap.entries()].sort((a,b) => b[1].wins - a[1].wins);
for (const [id, o] of sorted) {
  const total = o.wins + o.losses;
  const pct = total > 0 ? ((o.wins/total)*100).toFixed(1) : '0.0';
  const avgPF = o.seasons > 0 ? (o.pf/o.seasons).toFixed(1) : '0';
  console.log(`${o.name.padEnd(22)} | ${o.wins}-${o.losses} (${pct}%) | PF/szn: ${avgPF} | Playoffs: ${o.playoffs} | Champs: ${o.champs}`);
}

await conn.end();
