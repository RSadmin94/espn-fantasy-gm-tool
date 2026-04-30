import mysql from 'mysql2/promise';
import { writeFileSync } from 'fs';

const POS_MAP = {
  1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K",
  16: "D/ST", 17: "K", 23: "FLEX", 0: "UNK"
};

const MEMBER_NAMES = {
  "{96E5F3A7-0AB6-4DF1-AE89-E64CAF4A400B}": "Demetri Clark",
  "{0C4B6DC7-265E-4A23-99DE-2B67369E9141}": "Christian Graham",
  "{1130450A-E524-475A-96E2-F45C79CDBE21}": "Mark DeRoux",
  "{B7DED29D-BF48-441C-91B8-34CCFBB09271}": "Randy Broner Jr",
  "{34381793-095A-4099-B91E-04FB92B016A7}": "Bruce Edwards",
  "{F0C28C6B-C9FC-4D9E-828C-6BC9FC7D9EA8}": "Jan Graham",
  "{C300FD29-76C4-4FF0-8C91-A4F7BC17ADF2}": "Steffon Bizzell",
  "{9F27F0FE-36FA-4C9B-A7F0-FE36FA3C9B90}": "Nate West",
  "{EE3AD8B7-4239-40B0-BAD8-B7423960B094}": "Marlon Moore",
  "{54D64361-5249-472A-9643-615249A72AD3}": "Sheldon deRoux",
  "{C65919E6-63DE-4E91-9919-E663DEFE9114}": "teco Browning",
  "{82E515D1-73FF-466C-A7A8-099B050278B5}": "Marcus Reese",
  "{DE1D22CC-4F17-4463-B090-E06E460C5F1F}": "Jan Graham",
};

// Rod's team IDs across seasons (team 11 in most seasons)
const ROD_TEAM_IDS = { 2018: 11, 2019: 11, 2020: 11, 2021: 11, 2022: 11, 2023: 11, 2024: 11, 2025: 11 };

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  const [rows] = await conn.query(
    'SELECT season, payload FROM espn_season_cache WHERE viewName = ? ORDER BY season',
    ['combined']
  );
  await conn.end();

  console.log(`Processing ${rows.length} seasons...`);

  // owner key -> stats
  const ownerStats = {};

  for (const row of rows) {
    const season = row.season;
    const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
    
    const teams = payload.teams || [];
    const members = payload.members || [];
    const picks = payload.draftDetail?.picks || [];

    // Build team -> primary owner
    const teamOwner = {};
    for (const t of teams) {
      teamOwner[t.id] = t.primaryOwner || (t.owners && t.owners[0]) || '';
    }

    // Build member id -> display name
    const memberName = {};
    for (const m of members) {
      memberName[m.id] = `${m.firstName || ''} ${m.lastName || ''}`.trim() || m.displayName || m.id;
    }

    // Deduplicate picks
    const seen = new Set();
    const uniquePicks = [];
    for (const p of picks) {
      const key = p.overallPickNumber || p.id;
      if (!seen.has(key)) { seen.add(key); uniquePicks.push(p); }
    }

    for (const pick of uniquePicks) {
      const teamId = pick.teamId;
      const ownerId = teamOwner[teamId] || `team_${teamId}`;
      
      // Determine owner name
      let ownerName = memberName[ownerId] || MEMBER_NAMES[ownerId];
      if (!ownerName) {
        // Check if this is Rod's team
        if (teamId === ROD_TEAM_IDS[season]) {
          ownerName = 'Rod Sellers';
        } else {
          ownerName = `Team${teamId}`;
        }
      }

      const overall = pick.overallPickNumber || 0;
      const round = pick.roundId || Math.ceil(overall / 14) || 1;
      const roundPick = pick.roundPickNumber || ((overall - 1) % 14) + 1;

      // Get player info
      const pEntry = pick.playerPoolEntry?.playerPoolEntry?.player ||
                     pick.playerPoolEntry?.player || pick.player || {};
      const playerName = pEntry.fullName || pEntry.lastName || `Player#${pick.playerId}`;
      const posId = pEntry.defaultPositionId || 0;
      const position = POS_MAP[posId] || 'UNK';
      const isKeeper = pick.keeper === true || pick.isKeeper === true;

      const statKey = ownerId;
      if (!ownerStats[statKey]) {
        ownerStats[statKey] = {
          memberId: ownerId,
          name: ownerName,
          seasons: new Set(),
          totalPicks: 0,
          byRound: {},      // round -> { RB: n, WR: n, ... }
          byPosition: {},   // position -> total count
          earlyRoundPicks: [], // rounds 1-3 picks with detail
          round1Picks: [],
          round2Picks: [],
          round3Picks: [],
          keeperRounds: [],
          allPicks: [],
        };
      }

      const o = ownerStats[statKey];
      o.seasons.add(season);
      o.totalPicks++;
      if (!o.byRound[round]) o.byRound[round] = {};
      o.byRound[round][position] = (o.byRound[round][position] || 0) + 1;
      o.byPosition[position] = (o.byPosition[position] || 0) + 1;
      
      const pickDetail = { season, round, pick: roundPick, overall, playerName, position, isKeeper };
      o.allPicks.push(pickDetail);
      if (round === 1) o.round1Picks.push(pickDetail);
      if (round === 2) o.round2Picks.push(pickDetail);
      if (round === 3) o.round3Picks.push(pickDetail);
      if (round <= 3) o.earlyRoundPicks.push(pickDetail);
      if (isKeeper) o.keeperRounds.push(round);
    }
  }

  // Serialize (convert Sets to arrays/numbers)
  const result = Object.values(ownerStats)
    .map(o => ({
      memberId: o.memberId,
      name: o.name,
      seasons: o.seasons.size,
      totalPicks: o.totalPicks,
      byPosition: o.byPosition,
      byRound: o.byRound,
      round1Picks: o.round1Picks,
      round2Picks: o.round2Picks,
      round3Picks: o.round3Picks,
      earlyRoundPicks: o.earlyRoundPicks,
      keeperRounds: o.keeperRounds,
    }))
    .sort((a, b) => b.totalPicks - a.totalPicks);

  // Print summary
  for (const o of result) {
    const posTotal = Object.values(o.byPosition).reduce((a, b) => a + b, 0);
    const posStr = Object.entries(o.byPosition)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([p, c]) => `${p}:${c}(${Math.round(c/posTotal*100)}%)`)
      .join(', ');
    const r1 = Object.entries(o.byRound[1] || {}).sort((a,b)=>b[1]-a[1]).map(([p,c])=>`${p}:${c}`).join(',');
    const r2 = Object.entries(o.byRound[2] || {}).sort((a,b)=>b[1]-a[1]).map(([p,c])=>`${p}:${c}`).join(',');
    const r3 = Object.entries(o.byRound[3] || {}).sort((a,b)=>b[1]-a[1]).map(([p,c])=>`${p}:${c}`).join(',');
    console.log(`\n${o.name} (${o.seasons}s, ${o.totalPicks} picks)`);
    console.log(`  Positions: ${posStr}`);
    console.log(`  Rd1:[${r1}] Rd2:[${r2}] Rd3:[${r3}]`);
    if (o.round1Picks.length > 0) {
      const r1names = o.round1Picks.slice(0, 5).map(p => `${p.season}:${p.playerName}(${p.position})`).join(' | ');
      console.log(`  Rd1 picks: ${r1names}`);
    }
  }

  writeFileSync('/home/ubuntu/espn_ff_gm_tool/draft-tendencies-data.json', JSON.stringify(result, null, 2));
  console.log(`\nWrote draft-tendencies-data.json with ${result.length} owners`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
