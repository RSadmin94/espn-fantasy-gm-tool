// analyze-rod-tendencies.ts
// Analyzes Rod Sellers (Team ID 11) draft picks, positional tendencies,
// and GM activity metrics across 2018–2025

import { getCachedView } from "./server/db";

const ROD_TEAM_ID = 11;
const SEASONS = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];

// Position map from ESPN slot IDs
const SLOT_POSITION: Record<number, string> = {
  0: "QB", 2: "RB", 4: "WR", 6: "TE", 16: "D/ST", 17: "K",
  23: "FLEX", 20: "BENCH", 21: "IR"
};

async function main() {
  const allPicks: Array<{
    season: number;
    round: number;
    pick: number;
    overallPick: number;
    playerName: string;
    position: string;
    isKeeper: boolean;
  }> = [];

  const gmActivity: Array<{
    season: number;
    acquisitions: number;
    drops: number;
    trades: number;
    rosterMoves: number;
  }> = [];

  for (const season of SEASONS) {
    const combined = await getCachedView(season, "combined");
    if (!combined) continue;

    let payload: any;
    try {
      payload = typeof combined.payload === "string"
        ? JSON.parse(combined.payload)
        : combined.payload;
    } catch { continue; }

    // Get Rod's team data for transaction counters
    const teams: any[] = payload.teams ?? [];
    const rodTeam = teams.find((t: any) => t.id === ROD_TEAM_ID);
    if (rodTeam) {
      const tc = rodTeam.transactionCounter ?? {};
      gmActivity.push({
        season,
        acquisitions: tc.acquisitions ?? tc.adds ?? 0,
        drops: tc.drops ?? 0,
        trades: tc.trades ?? 0,
        rosterMoves: tc.moveToActive ?? 0,
      });
    }

    // Get draft picks for Rod
    const draftDetail = payload.draftDetail ?? {};
    const picks: any[] = draftDetail.picks ?? [];

    // Build a player name lookup from roster entries
    const playerNameMap: Record<number, { name: string; position: string }> = {};
    for (const team of teams) {
      const roster = team.roster?.entries ?? [];
      for (const entry of roster) {
        const pid = entry.playerId ?? entry.playerPoolEntry?.id;
        const pInfo = entry.playerPoolEntry?.playerInfo ?? entry.playerPoolEntry?.player ?? {};
        const name = pInfo.fullName ?? pInfo.name ?? "";
        const pos = pInfo.defaultPositionId;
        const posMap: Record<number, string> = { 1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "D/ST" };
        if (pid && name) {
          playerNameMap[pid] = { name, position: posMap[pos] ?? "FLEX" };
        }
      }
    }

    // Also check members for team name
    const members: any[] = payload.members ?? [];

    // Deduplicate picks by roundId + teamId + playerId
    const seen = new Set<string>();
    for (const pick of picks) {
      const key = `${pick.roundId}-${pick.teamId}-${pick.playerId}`;
      if (seen.has(key)) continue;
      seen.add(key);

      if (pick.teamId !== ROD_TEAM_ID) continue;

      const playerInfo = pick.playerInfo ?? {};
      let playerName = playerInfo.fullName ?? playerInfo.name ?? "";
      let position = "";

      if (!playerName) {
        const lookup = playerNameMap[pick.playerId];
        playerName = lookup?.name ?? `Player#${pick.playerId}`;
        position = lookup?.position ?? "";
      } else {
        const posId = playerInfo.defaultPositionId;
        const posMap: Record<number, string> = { 1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "D/ST" };
        position = posMap[posId] ?? "";
      }

      const isKeeper = pick.keeper === true || pick.reservedForKeeper === true ||
        (pick.keeperRound !== undefined && pick.keeperRound !== null);

      allPicks.push({
        season,
        round: pick.roundId,
        pick: pick.roundPickNumber ?? pick.pickNumber,
        overallPick: pick.overallPickNumber ?? ((pick.roundId - 1) * 14 + (pick.roundPickNumber ?? 1)),
        playerName,
        position,
        isKeeper,
      });
    }
  }

  // ── Analysis ──────────────────────────────────────────────────────────────

  // 1. Positional breakdown by round
  const posByRound: Record<string, Record<number, number>> = {};
  const posTotal: Record<string, number> = {};
  const posRounds: Record<string, number[]> = {};

  for (const pick of allPicks) {
    if (!pick.position) continue;
    const pos = pick.position;
    posTotal[pos] = (posTotal[pos] ?? 0) + 1;
    if (!posByRound[pos]) posByRound[pos] = {};
    posByRound[pos][pick.round] = (posByRound[pos][pick.round] ?? 0) + 1;
    if (!posRounds[pos]) posRounds[pos] = [];
    posRounds[pos].push(pick.round);
  }

  // Average round per position
  const avgRoundByPos: Record<string, number> = {};
  for (const [pos, rounds] of Object.entries(posRounds)) {
    avgRoundByPos[pos] = Math.round((rounds.reduce((a, b) => a + b, 0) / rounds.length) * 10) / 10;
  }

  // 2. Round 1 picks
  const round1Picks = allPicks.filter(p => p.round === 1);
  const round1ByPos: Record<string, number> = {};
  for (const p of round1Picks) {
    round1ByPos[p.position] = (round1ByPos[p.position] ?? 0) + 1;
  }

  // 3. Keeper picks
  const keeperPicks = allPicks.filter(p => p.isKeeper);

  // 4. GM Activity averages
  const avgAcq = gmActivity.length
    ? Math.round(gmActivity.reduce((s, g) => s + g.acquisitions, 0) / gmActivity.length)
    : 0;
  const avgTrades = gmActivity.length
    ? Math.round((gmActivity.reduce((s, g) => s + g.trades, 0) / gmActivity.length) * 10) / 10
    : 0;
  const avgDrops = gmActivity.length
    ? Math.round(gmActivity.reduce((s, g) => s + g.drops, 0) / gmActivity.length)
    : 0;

  // 5. Early vs Late positional tendencies
  const earlyRounds = allPicks.filter(p => p.round <= 3);
  const earlyByPos: Record<string, number> = {};
  for (const p of earlyRounds) {
    earlyByPos[p.position] = (earlyByPos[p.position] ?? 0) + 1;
  }

  // 6. Total picks per season
  const picksBySeason: Record<number, number> = {};
  for (const p of allPicks) {
    picksBySeason[p.season] = (picksBySeason[p.season] ?? 0) + 1;
  }

  // Print full report
  console.log("\n════════════════════════════════════════════════════════");
  console.log("  ROD SELLERS — DRAFT TENDENCIES & GM ACTIVITY REPORT");
  console.log("════════════════════════════════════════════════════════\n");

  console.log("📊 TOTAL PICKS BY SEASON:");
  for (const [season, count] of Object.entries(picksBySeason)) {
    console.log(`  ${season}: ${count} picks`);
  }
  console.log(`  TOTAL: ${allPicks.length} picks across ${SEASONS.length} seasons\n`);

  console.log("🏈 POSITIONAL BREAKDOWN (all picks):");
  const sortedPos = Object.entries(posTotal).sort((a, b) => b[1] - a[1]);
  for (const [pos, count] of sortedPos) {
    const pct = Math.round((count / allPicks.length) * 100);
    const avgRd = avgRoundByPos[pos];
    console.log(`  ${pos.padEnd(6)}: ${count} picks (${pct}%) — avg round ${avgRd}`);
  }

  console.log("\n🎯 ROUND 1 PICKS (all-time):");
  for (const [pos, count] of Object.entries(round1ByPos).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${pos}: ${count}x`);
  }

  console.log("\n⚡ EARLY ROUNDS (1–3) POSITIONAL SPLIT:");
  const earlyTotal = earlyRounds.length;
  for (const [pos, count] of Object.entries(earlyByPos).sort((a, b) => b[1] - a[1])) {
    const pct = Math.round((count / earlyTotal) * 100);
    console.log(`  ${pos}: ${count} (${pct}%)`);
  }

  console.log("\n🔑 KEEPER PICKS:");
  for (const p of keeperPicks) {
    console.log(`  ${p.season} — ${p.playerName} (${p.position}) Round ${p.round}`);
  }

  console.log("\n💼 GM ACTIVITY BY SEASON:");
  for (const g of gmActivity) {
    console.log(`  ${g.season}: ${g.acquisitions} adds, ${g.drops} drops, ${g.trades} trades, ${g.rosterMoves} roster moves`);
  }
  console.log(`\n  AVERAGES: ${avgAcq} adds/season, ${avgDrops} drops/season, ${avgTrades} trades/season`);

  console.log("\n📋 FULL PICK LIST (Rod's picks, all seasons):");
  for (const p of allPicks.sort((a, b) => a.season - b.season || a.round - b.round)) {
    const keeperTag = p.isKeeper ? " [KEEPER]" : "";
    console.log(`  ${p.season} Rd${p.round} Pick${p.pick}: ${p.playerName} (${p.position})${keeperTag}`);
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
