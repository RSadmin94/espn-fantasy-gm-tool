import { getDb } from "./server/db.js";
import { espnSeasonCache } from "./drizzle/schema.js";

// Member ID → name mapping (from our analysis)
const MEMBER_NAMES: Record<string, string> = {
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
  "{RODERICK-SELLERS}": "Rod Sellers",
};

// ESPN position map
const POS_MAP: Record<number, string> = {
  1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K",
  16: "D/ST", 17: "K", 23: "FLEX"
};

interface PickData {
  season: number;
  round: number;
  pick: number;
  overallPick: number;
  playerId: number;
  playerName: string;
  position: string;
  teamId: number;
  ownerId: string;
  ownerName: string;
  isKeeper: boolean;
}

async function main() {
  const db = await getDb();
  const rows = await db.select().from(espnSeasonCache);

  // Group by season
  const bySeason: Record<number, typeof rows> = {};
  for (const row of rows) {
    if (!bySeason[row.season]) bySeason[row.season] = [];
    bySeason[row.season].push(row);
  }

  const allPicks: PickData[] = [];
  const seasons = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];

  for (const season of seasons) {
    const seasonRows = bySeason[season] || [];
    const combined = seasonRows.find(r => r.viewName === "combined");
    if (!combined) { console.log(`No combined for ${season}`); continue; }

    const payload = typeof combined.payload === "string"
      ? JSON.parse(combined.payload) : combined.payload;

    const teams: any[] = payload.teams || [];
    const members: any[] = payload.members || [];
    const draftDetail = payload.draftDetail || {};
    const picks: any[] = draftDetail.picks || [];

    // Build team → primary owner map
    const teamOwnerMap: Record<number, string> = {};
    for (const t of teams) {
      const primaryOwner = t.primaryOwner || (t.owners && t.owners[0]) || "";
      teamOwnerMap[t.id] = primaryOwner;
    }

    // Build member id → name
    const memberNameMap: Record<string, string> = {};
    for (const m of members) {
      memberNameMap[m.id] = `${m.firstName} ${m.lastName}`.trim() || m.displayName || m.id;
    }

    // Deduplicate picks by overallPickNumber
    const seenPicks = new Set<number>();
    for (const pick of picks) {
      const overall = pick.overallPickNumber || pick.id;
      if (seenPicks.has(overall)) continue;
      seenPicks.add(overall);

      const teamId = pick.teamId;
      const ownerId = teamOwnerMap[teamId] || "";
      const ownerName = memberNameMap[ownerId] || MEMBER_NAMES[ownerId] || `Team${teamId}`;
      
      // Get player info
      const playerInfo = pick.playerPoolEntry?.playerPoolEntry?.player ||
                         pick.playerPoolEntry?.player ||
                         pick.player || {};
      const playerName = playerInfo.fullName || playerInfo.lastName || `Player#${pick.playerId}`;
      const posId = playerInfo.defaultPositionId || 0;
      const position = POS_MAP[posId] || "UNK";

      allPicks.push({
        season,
        round: pick.roundId || Math.ceil(overall / 14),
        pick: pick.roundPickNumber || (overall % 14) || 14,
        overallPick: overall,
        playerId: pick.playerId,
        playerName,
        position,
        teamId,
        ownerId,
        ownerName,
        isKeeper: pick.keeper === true || pick.isKeeper === true,
      });
    }
  }

  console.log(`\nTotal picks extracted: ${allPicks.length}`);

  // Build per-owner round-by-position stats
  const ownerStats: Record<string, {
    name: string;
    totalPicks: number;
    byRound: Record<number, Record<string, number>>;  // round -> position -> count
    byPosition: Record<string, number>;
    round1Picks: string[];
    round2Picks: string[];
    round3Picks: string[];
    keeperRounds: number[];
    seasons: number;
  }> = {};

  for (const pick of allPicks) {
    const key = pick.ownerId || pick.ownerName;
    if (!ownerStats[key]) {
      ownerStats[key] = {
        name: pick.ownerName,
        totalPicks: 0,
        byRound: {},
        byPosition: {},
        round1Picks: [],
        round2Picks: [],
        round3Picks: [],
        keeperRounds: [],
        seasons: 0,
      };
    }
    const o = ownerStats[key];
    o.totalPicks++;
    if (!o.byRound[pick.round]) o.byRound[pick.round] = {};
    o.byRound[pick.round][pick.position] = (o.byRound[pick.round][pick.position] || 0) + 1;
    o.byPosition[pick.position] = (o.byPosition[pick.position] || 0) + 1;
    if (pick.round === 1) o.round1Picks.push(`${pick.season}: ${pick.playerName} (${pick.position})`);
    if (pick.round === 2) o.round2Picks.push(`${pick.season}: ${pick.playerName} (${pick.position})`);
    if (pick.round === 3) o.round3Picks.push(`${pick.season}: ${pick.playerName} (${pick.position})`);
    if (pick.isKeeper) o.keeperRounds.push(pick.round);
  }

  // Count seasons per owner
  const ownerSeasons: Record<string, Set<number>> = {};
  for (const pick of allPicks) {
    const key = pick.ownerId || pick.ownerName;
    if (!ownerSeasons[key]) ownerSeasons[key] = new Set();
    ownerSeasons[key].add(pick.season);
  }
  for (const [key, seasons] of Object.entries(ownerSeasons)) {
    if (ownerStats[key]) ownerStats[key].seasons = seasons.size;
  }

  // Print summary
  const sorted = Object.entries(ownerStats).sort((a, b) => b[1].totalPicks - a[1].totalPicks);
  for (const [key, o] of sorted) {
    console.log(`\n=== ${o.name} (${o.seasons} seasons, ${o.totalPicks} picks) ===`);
    const posTotal = Object.values(o.byPosition).reduce((a, b) => a + b, 0);
    const posStr = Object.entries(o.byPosition)
      .sort((a, b) => b[1] - a[1])
      .map(([p, c]) => `${p}:${c}(${Math.round(c/posTotal*100)}%)`)
      .join(", ");
    console.log(`  Positions: ${posStr}`);
    
    // Round 1-3 tendencies
    const r1pos = o.byRound[1] || {};
    const r2pos = o.byRound[2] || {};
    const r3pos = o.byRound[3] || {};
    const r1str = Object.entries(r1pos).sort((a,b)=>b[1]-a[1]).map(([p,c])=>`${p}:${c}`).join(",");
    const r2str = Object.entries(r2pos).sort((a,b)=>b[1]-a[1]).map(([p,c])=>`${p}:${c}`).join(",");
    const r3str = Object.entries(r3pos).sort((a,b)=>b[1]-a[1]).map(([p,c])=>`${p}:${c}`).join(",");
    console.log(`  Rd1: [${r1str}] | Rd2: [${r2str}] | Rd3: [${r3str}]`);
    console.log(`  Rd1 picks: ${o.round1Picks.slice(0,5).join(" | ")}`);
    if (o.keeperRounds.length > 0) {
      console.log(`  Keeper rounds: ${o.keeperRounds.join(", ")}`);
    }
  }

  // Write JSON for the server
  const output = sorted.map(([key, o]) => ({
    memberId: key,
    name: o.name,
    seasons: o.seasons,
    totalPicks: o.totalPicks,
    byPosition: o.byPosition,
    byRound: o.byRound,
    round1Picks: o.round1Picks,
    round2Picks: o.round2Picks,
    round3Picks: o.round3Picks,
    keeperRounds: o.keeperRounds,
  }));

  const fs = await import("fs");
  fs.writeFileSync("/home/ubuntu/espn_ff_gm_tool/draft-tendencies-data.json", JSON.stringify(output, null, 2));
  console.log(`\nWrote draft-tendencies-data.json with ${output.length} owners`);
}

main().catch(console.error);
